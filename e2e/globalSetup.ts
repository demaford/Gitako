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

/**
 * Seed Gitako's access token into the profile's extension storage so every
 * spec makes AUTHENTICATED GitHub API calls.
 *
 * Why this matters: without a token Gitako talks to the GitHub REST API
 * anonymously, capped at 60 requests/hour. A full suite (let alone the
 * nightly's two passes) blows past that mid-run; the tree fetch then fails
 * and Gitako blanks the file list (the 'disabled'/'error-due-to-auth'
 * states render no nodes), producing flaky "node-item not found" failures
 * across the render/nav/pjax/search specs that have nothing to do with the
 * code under test. An authenticated token raises the ceiling to 5000/hour
 * and removes that whole class of drift.
 *
 * Token source is GITAKO_ACCESS_TOKEN (.env). We write it directly into the
 * extension's chrome.storage via the background service worker — no UI
 * driving, no OAuth round-trip (that lives in the opt-in maint.oauth-bootstrap
 * spec). Read-modify-write preserves any other config already in the profile.
 *
 * Specs that need a token-LESS context (feature.oauth, maint.oauth-bootstrap)
 * use their own fresh/cleared profiles, so seeding the shared one is safe.
 */
// Write { accessToken } into the github config, merging with whatever else is
// already stored. Runs inside the extension's service worker (the only context
// with chrome.storage access).
function writeTokenInWorker(worker: Worker, token: string) {
  return worker.evaluate(
    async ([key, accessToken]) => {
      const { storage } = (
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
      ).chrome
      const stored = await storage.local.get(key)
      const config = { ...(stored[key] || {}), accessToken }
      await storage.local.set({ [key]: config })
    },
    [GITHUB_CONFIG_KEY, token] as const,
  )
}

async function seedAccessToken(context: BrowserContext) {
  const token = process.env.GITAKO_ACCESS_TOKEN
  if (!token) {
    console.log('[globalSetup] GITAKO_ACCESS_TOKEN unset — specs run anonymously (rate-limited)')
    return
  }

  // The MV3 service worker is registered at launch but, on a cold profile
  // (first pass right after a build), the first evaluate can hang while the
  // worker is still installing/activating. Loading a page the content script
  // matches drives extension ↔ worker traffic that forces the worker awake;
  // then we retry the write a few times with a short per-attempt cap. The
  // whole thing is best-effort: if it still can't land, warn and let the suite
  // run on whatever token the profile already holds (or anonymously).
  const page = await context.newPage()
  try {
    await page.goto('https://github.com/', { waitUntil: 'domcontentloaded', timeout: 20000 })

    let lastErr: Error | undefined
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        let [worker] = context.serviceWorkers()
        if (!worker) {
          worker = await withTimeout(
            context.waitForEvent('serviceworker'),
            8000,
            'await serviceworker',
          )
        }
        await withTimeout(writeTokenInWorker(worker, token), 8000, `write attempt ${attempt}`)
        console.log(
          `[globalSetup] seeded Gitako access token into the profile (attempt ${attempt})`,
        )
        return
      } catch (err) {
        lastErr = err as Error
        // Re-warm: another content-script load nudges a sleeping worker awake
        // before the next attempt.
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
      }
    }
    console.warn(`[globalSetup] could not seed access token after 3 tries (${lastErr?.message})`)
  } catch (err) {
    console.warn(`[globalSetup] could not seed access token (${(err as Error).message})`)
  } finally {
    await page.close().catch(() => {})
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
    await seedAccessToken(context)
    await normalizeFeaturePreview(context)
  } finally {
    await context.close()
  }
}
