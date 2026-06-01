import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { detectDockMode, ensureDockMode } from './sidebar'
import { testURL } from './testURL'

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

test.describe('state: toggle-mode persistence', () => {
  test('switching modes survives a reload', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop`)
    await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).toBeAttached({
      timeout: 10000,
    })

    // Detect whatever the persistent profile is currently in; we'll
    // toggle to the opposite, verify reload preserves it, and restore.
    // This way the spec is a pure no-op on the on-disk config — no
    // pollution for other specs that share the profile.
    const original = await detectDockMode(extensionPage)
    const target = original === 'float' ? 'persistent' : 'float'
    const targetSelector =
      target === 'float'
        ? selectors.gitako.bodyWrapperFloatMode
        : selectors.gitako.bodyWrapperPersistentMode

    try {
      await ensureDockMode(extensionPage, target)

      // Reload — config must be re-read from storage on the fresh mount.
      await extensionPage.reload()
      await expect(extensionPage.locator(targetSelector)).toBeAttached({ timeout: 10000 })
    } finally {
      // Restore whatever the profile was when we started.
      try {
        await ensureDockMode(extensionPage, original)
      } catch {
        /* best-effort restore */
      }
    }
  })
})
