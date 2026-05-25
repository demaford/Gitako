import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Toggle-mode (float vs persistent) is a user setting Gitako persists
 * via browser.storage.local. The silent failure mode is "I set
 * persistent, refreshed, and it's back to float" — Sentry catches
 * nothing, the user sees the bar in the wrong mode and re-clicks.
 *
 * Uses the in-UI pin button to flip the mode (no internal API), then
 * reloads the page and asserts the mode was restored. Toggles back to
 * float at the end so the persistent profile isn't polluted for
 * subsequent specs sharing the same context.
 */

const pinButton = '[aria-label="Toggle sidebar dock mode between float and persistent"]'
const floatModeSelector = '.gitako-side-bar-body-wrapper.toggle-mode-float'
const persistentModeSelector = '.gitako-side-bar-body-wrapper.toggle-mode-persistent'

test.describe('state: toggle-mode persistence', () => {
  test('switching to persistent mode survives a reload', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop`)
    await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).toBeAttached({
      timeout: 10000,
    })

    // Sanity-check we're starting from float (this assumes a clean
    // profile — the spec's `finally` restores float at the end so a
    // re-run within the same persistent context starts clean too).
    await expect(extensionPage.locator(floatModeSelector)).toBeAttached({ timeout: 5000 })

    try {
      // In float mode the body is hidden until hovered. Hover the
      // toggle button to reveal the panel, then click the pin inside.
      await extensionPage.locator('.gitako-toggle-show-button').hover()
      await sleep(400)
      await extensionPage.locator(pinButton).click()
      await expect(extensionPage.locator(persistentModeSelector)).toBeAttached({ timeout: 5000 })
      // debounced storage write
      await sleep(800)

      // Reload — config must be re-read from storage on the fresh mount.
      await extensionPage.reload()
      await expect(extensionPage.locator(persistentModeSelector)).toBeAttached({ timeout: 10000 })
    } finally {
      // Restore float for subsequent tests in this worker.
      try {
        await extensionPage.locator(pinButton).click({ timeout: 5000 })
        await sleep(800)
      } catch {
        /* best-effort restore */
      }
    }
  })
})
