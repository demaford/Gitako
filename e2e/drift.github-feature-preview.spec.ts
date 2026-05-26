import * as fs from 'fs'
import * as path from 'path'
import { expect, test } from './fixtures'
import { knownFeaturePreviewItems } from './github-feature-preview'
import { sleep } from './utils'

/**
 * Drift detector for GitHub's Feature Preview dialog.
 *
 * Opens the dialog (via avatar drawer), scrapes the tablist, and
 * compares the live key set against `knownFeaturePreviewItems`. Fails
 * with a clear diff so unknown features get flagged for evaluation
 * (most often: marked `affectsGitako: 'no'` with a why-skip) and
 * removed features get pruned.
 *
 * Requires a signed-in profile — feature preview is per-user. The
 * spec.skip below short-circuits anonymous runs.
 */

test.describe('drift: GitHub Feature Preview tracker', () => {
  test.skip(
    !process.env.PLAYWRIGHT_PROFILE && !fs.existsSync(path.resolve(__dirname, '.profile')),
    'Feature preview is signed-in-only; needs persistent profile.',
  )

  test('live tablist matches knownFeaturePreviewItems', async ({ extensionPage }) => {
    await extensionPage.goto('https://github.com/EnixCoda/Gitako')
    await sleep(2500)

    // Open user drawer via the avatar in the header. Selectors here are
    // intentionally narrow — if GitHub changes the avatar widget, this
    // test fails early with a clear "couldn't open menu" rather than a
    // confusing dialog-content mismatch later.
    const drawerOpened = await extensionPage.evaluate(() => {
      const btn = document.querySelector('header button:has(img)') as HTMLElement | null
      if (!btn) return false
      btn.click()
      return true
    })
    expect(drawerOpened, 'avatar trigger in header').toBe(true)
    await sleep(800)

    // Click "Feature preview" inside the drawer (matches the menu-only
    // entry, not any footer/page reference).
    const fpClicked = await extensionPage.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      if (!dialog) return false
      const target = Array.from(dialog.querySelectorAll('a, button')).find(el =>
        /feature preview/i.test((el.textContent || '').trim()),
      )
      if (target instanceof HTMLElement) {
        target.click()
        return true
      }
      return false
    })
    expect(fpClicked, '"Feature preview" entry in user drawer').toBe(true)

    // FP dialog loads its content asynchronously; poll for the tablist.
    let liveTabs: { featureKey: string | null; title: string }[] = []
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      liveTabs = await extensionPage.evaluate(() => {
        const dialogs = Array.from(
          document.querySelectorAll('[role="dialog"][data-component="Dialog"]'),
        )
        const fp = dialogs.find(d =>
          /^Feature Preview$/.test(
            d.querySelector('h1.prc-Dialog-Title-M-iPn')?.textContent?.trim() ?? '',
          ),
        )
        if (!fp) return []
        const tablist = fp.querySelector('[role="tablist"][aria-label="Feature Preview"]')
        if (!tablist) return []
        return Array.from(tablist.querySelectorAll('[role="tab"]')).map(tab => ({
          // The id pattern is `_r_NN_-tab-<feature_key>`; the suffix is
          // the stable GitHub-internal key.
          featureKey: tab.id.match(/-tab-(.+)$/)?.[1] ?? null,
          title: (tab.querySelector('[id$="--label"]')?.textContent ?? tab.textContent ?? '')
            .trim()
            .slice(0, 80),
        }))
      })
      if (liveTabs.length > 0) break
    }
    expect(liveTabs.length, 'feature preview tabs loaded').toBeGreaterThan(0)

    const liveKeys = new Set(liveTabs.map(t => t.featureKey).filter(Boolean) as string[])
    const knownKeys = new Set(Object.keys(knownFeaturePreviewItems))

    const added = [...liveKeys].filter(k => !knownKeys.has(k)).sort()
    const removed = [...knownKeys].filter(k => !liveKeys.has(k)).sort()

    if (added.length || removed.length) {
      const addedDetail = added.map(k => {
        const tab = liveTabs.find(t => t.featureKey === k)
        return `  + ${k}  ("${tab?.title ?? ''}")`
      })
      const removedDetail = removed.map(k => {
        const entry = (knownFeaturePreviewItems as Record<string, { title: string }>)[k]
        return `  - ${k}  ("${entry?.title ?? ''}")`
      })
      const msg = [
        'Feature Preview dialog drifted from tracker.',
        '',
        added.length ? 'NEW features (evaluate impact, add to knownFeaturePreviewItems):' : '',
        ...addedDetail,
        removed.length ? 'REMOVED features (GA’d or rolled back; prune from tracker):' : '',
        ...removedDetail,
      ]
        .filter(Boolean)
        .join('\n')
      expect.soft(added, msg).toEqual([])
      expect.soft(removed, msg).toEqual([])
      throw new Error(msg)
    }
  })
})
