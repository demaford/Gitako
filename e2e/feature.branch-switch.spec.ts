import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { waitForRedirect } from './utils'

// Repro for: starting on the repo overview, switching branches via the
// GitHub branch picker, then navigating away and back, leaves Gitako's
// sidebar detached — the toggle icon never reappears.
//
// We drive the navigation with Turbo.visit() because that's what GitHub's
// branch picker calls internally on selection, and it's deterministic to
// trigger from a test (the picker dropdown contents load lazily and the
// DOM has churned).
test.describe('branch switch lifecycle', () => {
  test('Gitako sidebar survives overview -> branch -> issues -> back', async ({
    extensionPage,
  }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
    await expect(extensionPage.locator('.gitako-toggle-show-button')).toBeVisible({
      timeout: 10000,
    })

    // Wait for GitHub's Turbo bundle to bind before driving it; on slow CI
    // the page is technically loaded (toggle is visible) before Turbo
    // attaches. The optional-chain would otherwise silently no-op and the
    // failure would surface 10s later as a URL-mismatch timeout.
    await extensionPage.waitForFunction(
      () => typeof (window as { Turbo?: unknown }).Turbo !== 'undefined',
      undefined,
      { timeout: 10000 },
    )
    await extensionPage.evaluate(() => {
      ;(window as { Turbo: { visit: (url: string) => void } }).Turbo.visit(
        '/EnixCoda/Gitako/tree/v3',
      )
    })
    await extensionPage.waitForURL('**/tree/v3', { timeout: 10000 })
    await expect(extensionPage.locator(selectors.gitako.branchName)).toHaveText('v3', {
      timeout: 10000,
    })

    await waitForRedirect(extensionPage, async () => {
      await extensionPage.click(selectors.github.navBarItemIssues)
    })

    await waitForRedirect(extensionPage, async () => {
      await extensionPage.goBack()
    })

    await expect(extensionPage.locator('.gitako-toggle-show-button')).toBeVisible({
      timeout: 10000,
    })
  })
})
