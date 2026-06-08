import { chromium, type BrowserContext, type Worker } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { setFeatureState } from './featurePreview'
import { resolveProfilePath } from './fixtures'
import { knownFeaturePreviewItems, type FeaturePreviewKey } from './github-feature-preview'
import { sleep } from './utils'

// playwright.config only loads .env on arm64 darwin; load it here too so
// GITAKO_ACCESS_TOKEN is available wherever globalSetup runs (CI included).
dotenv.config()

const GITHUB_CONFIG_KEY = 'platform_github.com'

// Cap any single setup step so a service-worker/profile-lock hiccup can't
// wedge the whole run (a hung persistent context blocks every spec behind it).
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`globalSetup: ${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

// These run INSIDE the service worker (the only context with chrome.storage
// access); the `chrome` global is typed inline since the page-side TS config
// has no `chrome` types.
function readStoredToken(worker: Worker): Promise<string> {
  return worker.evaluate(async key => {
    const stored = await (
      globalThis as unknown as {
        chrome: {
          storage: { local: { get(k: string): Promise<Record<string, { accessToken?: string }>> } }
        }
      }
    ).chrome.storage.local.get(key)
    return stored[key]?.accessToken || ''
  }, GITHUB_CONFIG_KEY)
}

function writeStoredToken(worker: Worker, token: string): Promise<void> {
  return worker.evaluate(
    async ([key, accessToken]) => {
      const storage = (
        globalThis as unknown as {
          chrome: {
            storage: {
              local: {
                get(k: string): Promise<Record<string, Record<string, unknown>>>
                set(v: Record<string, unknown>): Promise<void>
              }
            }
          }
        }
      ).chrome.storage.local
      const stored = await storage.get(key)
      await storage.set({ [key]: { ...(stored[key] || {}), accessToken } })
    },
    [GITHUB_CONFIG_KEY, token] as const,
  )
}

/**
 * Ensure Gitako holds a GitHub access token before the suite runs, so every
 * spec — and the Feature Preview ON/OFF matrix in particular — makes
 * AUTHENTICATED API calls. Without a token Gitako falls back to the anonymous
 * 60 req/hour ceiling; a full run exhausts that and the tree fetch fails,
 * blanking the file list (the 'disabled'/'error-due-to-auth' states render no
 * nodes) — flaky "node-item not found" failures unrelated to the code under
 * test. An authenticated token raises the ceiling to 5000/hour.
 *
 * Idempotent by design: we READ the profile's token first and skip the write
 * when one is already present (the normal case — the profile is provisioned via
 * maint.oauth-bootstrap). Only when it's missing do we write GITAKO_ACCESS_TOKEN
 * (.env) into chrome.storage via the service worker. Whether that token came
 * from OAuth or a PAT is irrelevant here — the goal is just "a token is set."
 *
 * Best-effort: if the worker is unreachable we warn and let the suite run on
 * whatever the profile already holds, rather than wedging every spec behind a
 * setup hang. Token-LESS specs (feature.oauth, maint.oauth-bootstrap) bring
 * their own fresh/cleared profiles, so this never disturbs them.
 */
// The MV3 service worker is registered at launch, but the FIRST evaluate after
// a fresh launch can hang while the worker is still activating — then, once it
// responds, every later evaluate is instant and reliable. So we retry with a
// short per-attempt cap, re-acquiring the worker handle each time (a stale
// handle to a not-yet-live worker is part of the problem), until one lands.
async function runInWorker<T>(
  context: BrowserContext,
  op: (worker: Worker) => Promise<T>,
  label: string,
): Promise<T> {
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= 6; attempt++) {
    let [worker] = context.serviceWorkers()
    if (!worker) {
      try {
        worker = await withTimeout(
          context.waitForEvent('serviceworker'),
          4000,
          'await serviceworker',
        )
      } catch (err) {
        lastErr = err as Error
        await sleep(1500)
        continue
      }
    }
    try {
      return await withTimeout(op(worker), 4000, `${label} attempt ${attempt}`)
    } catch (err) {
      lastErr = err as Error
      await sleep(1500) // let the worker finish waking, then re-acquire and retry
    }
  }
  throw lastErr ?? new Error(`${label}: exhausted retries`)
}

async function ensureAccessToken(context: BrowserContext) {
  try {
    // Detect-first: if the profile already carries a token (the steady state —
    // provisioned once via maint.oauth-bootstrap), there's nothing to do.
    const existing = await runInWorker(context, readStoredToken, 'read token')
    if (existing) {
      console.log('[globalSetup] access token already present — skipping seed')
      return
    }

    const token = process.env.GITAKO_ACCESS_TOKEN
    if (!token) {
      console.warn(
        '[globalSetup] no token in profile and GITAKO_ACCESS_TOKEN unset — specs run anonymously (rate-limited)',
      )
      return
    }

    await runInWorker(context, w => writeStoredToken(w, token), 'write token')
    console.log('[globalSetup] seeded Gitako access token into the profile')
  } catch (err) {
    console.warn(`[globalSetup] could not ensure access token (${(err as Error).message})`)
  }
}

/**
 * Drive the bot profile to a known Feature Preview state. Gated by env so
 * manual `yarn playwright test` runs aren't slowed by a 15s dialog walk —
 * the nightly runner sets `GITAKO_PREVIEW_TARGET=on|off` to force the floor.
 * The runner does two passes (on then off) so every spec is validated at both
 * extremes. Unset (or any value besides on/off) → skipped.
 */
async function normalizeFeaturePreview(context: BrowserContext) {
  const raw = process.env.GITAKO_PREVIEW_TARGET
  if (raw !== 'on' && raw !== 'off') return
  const target = raw

  const page = await context.newPage()
  await page.goto('https://github.com/EnixCoda/Gitako')
  await sleep(2500)
  const keys = Object.keys(knownFeaturePreviewItems) as FeaturePreviewKey[]
  for (const key of keys) {
    await setFeatureState(page, key, target)
  }
  console.log(`[globalSetup] normalized ${keys.length} preview flags to ${target}`)
}

export default async function globalSetup() {
  const profile = resolveProfilePath()
  if (!profile || !fs.existsSync(profile)) {
    // No persistent profile — nothing to seed/normalize. Signed-in specs
    // self-skip; the token-less specs bring their own profiles.
    return
  }

  const EXTENSION_PATH = path.resolve(__dirname, '..', 'dist')
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [
      `--no-sandbox`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })
  try {
    await ensureAccessToken(context)
    await normalizeFeaturePreview(context)
  } finally {
    await context.close()
  }
}
