import * as fs from 'fs'
import * as path from 'path'
import { expect, test } from './fixtures'
import { withFeatureState } from './featurePreview'
import { knownFeaturePreviewItems, type FeaturePreviewKey } from './github-feature-preview'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Per-feature ON/OFF coverage for GitHub Feature Preview entries.
 *
 * Gated by env: this suite is OPT-IN for manual runs because flipping
 * server-side flags through the UI is slow (~20–40s per round-trip)
 * and we don't want to make `yarn e2e` heavier for day-to-day work.
 * The nightly runner sets `GITAKO_FEATURE_MATRIX=1` so we always
 * catch regressions on the preview surfaces — see ~/workspace/gitako-e2e/run.sh.
 *
 * Coverage strategy:
 * - Features marked `affectsGitako: 'yes'` (currently `prx_files` and
 *   `pull_request_files_virtualization`) get a dedicated test that
 *   flips them ON, exercises the affected page (PR /files), and
 *   asserts Gitako still renders + the file list is populated.
 * - `affectsGitako: 'no'` features are smoke-tested with a single OFF→ON
 *   round-trip on a repo page, just to verify our "no impact" claim
 *   empirically. If Gitako breaks under one of these, the relevant
 *   tracker entry needs to flip to 'yes'.
 * - `affectsGitako: 'unknown'` features fall through to the no-impact
 *   smoke as a starting probe.
 *
 * Signed-in only: feature preview is per-user.
 */

const ENABLED = process.env.GITAKO_FEATURE_MATRIX === '1'

test.describe('feature preview matrix', () => {
  test.skip(!ENABLED, 'Set GITAKO_FEATURE_MATRIX=1 to opt in (nightly runner does).')
  test.skip(
    !process.env.PLAYWRIGHT_PROFILE && !fs.existsSync(path.resolve(__dirname, '.profile')),
    'Feature preview is signed-in-only; needs persistent profile.',
  )

  // Each round-trip costs ~25–40s (dialog open + click + verify + close + restore).
  // Bump per-test timeout so a 60s default doesn't bite us on slow runs.
  test.setTimeout(180_000)

  test('prx_files ON: PR /files still renders Gitako sidebar + file list', async ({
    extensionPage,
  }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
    await sleep(2000)
    await withFeatureState(extensionPage, 'prx_files', 'on', async () => {
      await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/71/files`)
      await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).toBeVisible({
        timeout: 8000,
      })
      await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
        timeout: 8000,
      })
    })
  })

  test('pull_request_files_virtualization ON: PR /files still renders Gitako + file list', async ({
    extensionPage,
  }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
    await sleep(2000)
    await withFeatureState(extensionPage, 'pull_request_files_virtualization', 'on', async () => {
      await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/71/files`)
      await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).toBeVisible({
        timeout: 8000,
      })
      await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
        timeout: 8000,
      })
    })
  })

  // Smoke: every "no impact" feature still toggles cleanly through the
  // helper AND the repo page keeps rendering Gitako while the flag is
  // flipped. If one of these starts breaking Gitako, the tracker is wrong.
  const noImpactKeys = (Object.keys(knownFeaturePreviewItems) as FeaturePreviewKey[]).filter(
    k => knownFeaturePreviewItems[k].affectsGitako !== 'yes',
  )

  for (const key of noImpactKeys) {
    test(`${key} (no-impact smoke): Gitako survives ON`, async ({ extensionPage }) => {
      await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
      await sleep(2000)
      await withFeatureState(extensionPage, key, 'on', async () => {
        await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
        // "Survived" = Gitako mounted with no crash. Sidebar can be in
        // collapsed state on the repo root, so attached (not visible) is
        // the right bar — we just want to know nothing exploded.
        await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).toBeAttached({
          timeout: 8000,
        })
      })
    })
  }
})
