import * as fs from 'fs'
import * as path from 'path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { withFeatureStates } from './featurePreview'
import { knownFeaturePreviewItems, type FeaturePreviewKey } from './github-feature-preview'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * All-features-ON regression check.
 *
 * Tests don't fail most nights, so paying for 9 per-feature open/close
 * cycles to localize an attribution that almost never matters is the
 * wrong trade. Instead: flip every known Feature Preview entry ON in
 * one shot, exercise the surfaces Gitako depends on (PR /files for the
 * DOM-impacting flags, repo root as a smoke), then restore. On the
 * rare failure, bisect manually by re-running with a narrower set.
 *
 * Gated by env: opt-in for manual runs because the dialog round-trips
 * are slow; the nightly runner sets GITAKO_FEATURE_MATRIX=1.
 * Signed-in only — feature preview is per-user.
 */

const ENABLED = process.env.GITAKO_FEATURE_MATRIX === '1'

test.describe('feature preview matrix', () => {
  test.skip(!ENABLED, 'Set GITAKO_FEATURE_MATRIX=1 to opt in (nightly runner does).')
  test.skip(
    !process.env.PLAYWRIGHT_PROFILE && !fs.existsSync(path.resolve(__dirname, '.profile')),
    'Feature preview is signed-in-only; needs persistent profile.',
  )

  // Setup + teardown each do a full dialog walk over every feature.
  // Allow generous slack so a slow night doesn't false-fail.
  test.setTimeout(240_000)

  const allKeys = Object.keys(knownFeaturePreviewItems) as FeaturePreviewKey[]

  async function exerciseSurfaces(page: Page) {
    // PR /files — the surface prx_files and pull_request_files_virtualization
    // change. Most likely place for a Gitako break under preview flags.
    await page.goto(testURL`https://github.com/EnixCoda/Gitako/pull/71/files`)
    await expect(page.locator(selectors.gitako.bodyWrapper)).toBeVisible({ timeout: 10000 })
    await expect(page.locator(selectors.gitako.fileItem).first()).toBeVisible({ timeout: 10000 })

    // Repo root — smoke that Gitako mounted (sidebar can be collapsed).
    await page.goto(testURL`https://github.com/EnixCoda/Gitako`)
    await expect(page.locator(selectors.gitako.bodyWrapper)).toBeAttached({ timeout: 10000 })
  }

  test('Gitako survives with every Feature Preview ON', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
    await sleep(2000)
    await withFeatureStates(extensionPage, allKeys, 'on', async () => {
      await exerciseSurfaces(extensionPage)
    })
  })

  test('Gitako survives with every Feature Preview OFF', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
    await sleep(2000)
    await withFeatureStates(extensionPage, allKeys, 'off', async () => {
      await exerciseSurfaces(extensionPage)
    })
  })
})
