import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { setFeatureState } from './featurePreview'
import { knownFeaturePreviewItems, type FeaturePreviewKey } from './github-feature-preview'
import { resolveProfilePath } from './fixtures'
import { sleep } from './utils'

/**
 * Drive the bot profile to a known Feature Preview state before any
 * spec runs. Gated by env so manual `yarn playwright test` runs aren't
 * slowed down by a 15s dialog walk — the nightly runner sets
 * `GITAKO_PREVIEW_TARGET=on|off` to force the floor.
 *
 * Why: without this, the base suite runs against whatever state the
 * profile happens to be in (an accident of history). The runner does
 * two passes (target=on then target=off) so every spec is validated
 * at both extremes.
 *
 * Unset (or any value besides on/off) → no-op.
 */
export default async function globalSetup() {
  const raw = process.env.GITAKO_PREVIEW_TARGET
  if (raw !== 'on' && raw !== 'off') return
  const target = raw

  const profile = resolveProfilePath()
  if (!profile || !fs.existsSync(profile)) {
    // No persistent profile available — nothing to normalize. Specs that
    // need signed-in state will self-skip; nothing for globalSetup to do.
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
    const page = await context.newPage()
    await page.goto('https://github.com/EnixCoda/Gitako')
    await sleep(2500)
    const keys = Object.keys(knownFeaturePreviewItems) as FeaturePreviewKey[]
    for (const key of keys) {
      await setFeatureState(page, key, target)
    }
     
    console.log(`[globalSetup] normalized ${keys.length} preview flags to ${target}`)
  } finally {
    await context.close()
  }
}
