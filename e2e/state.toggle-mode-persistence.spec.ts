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

// Reveal the body wrapper (pin button lives inside it) regardless of
// starting mode. In float mode hover expands; in persistent + collapsed
// only a click on the toggle expands. Click works in both modes.
async function revealSidebar(extensionPage: import('@playwright/test').Page) {
  await extensionPage.locator('.gitako-toggle-show-button').hover()
  await sleep(200)
  // If body is still collapsed (persistent mode or float-with-no-hover),
  // click to expand. Best-effort — failure means body was already open.
  const collapsed = await extensionPage.locator('.gitako-side-bar-body-wrapper.collapsed').count()
  if (collapsed > 0) {
    await extensionPage.locator('.gitako-toggle-show-button').click({ force: true })
    await sleep(400)
  }
}

// Force the mode to the requested value, no matter what state the
// persistent profile starts in. Idempotent.
async function ensureMode(
  extensionPage: import('@playwright/test').Page,
  mode: 'float' | 'persistent',
) {
  const desired = mode === 'float' ? floatModeSelector : persistentModeSelector
  if (await extensionPage.locator(desired).count()) return
  await revealSidebar(extensionPage)
  await extensionPage.locator(pinButton).click()
  await expect(extensionPage.locator(desired)).toBeAttached({ timeout: 5000 })
  await sleep(800) // debounced storage write
}

async function detectMode(
  extensionPage: import('@playwright/test').Page,
): Promise<'float' | 'persistent'> {
  if (await extensionPage.locator(persistentModeSelector).count()) return 'persistent'
  return 'float'
}

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
    const original = await detectMode(extensionPage)
    const target = original === 'float' ? 'persistent' : 'float'
    const targetSelector = target === 'float' ? floatModeSelector : persistentModeSelector

    try {
      await ensureMode(extensionPage, target)

      // Reload — config must be re-read from storage on the fresh mount.
      await extensionPage.reload()
      await expect(extensionPage.locator(targetSelector)).toBeAttached({ timeout: 10000 })
    } finally {
      // Restore whatever the profile was when we started.
      try {
        await ensureMode(extensionPage, original)
      } catch {
        /* best-effort restore */
      }
    }
  })
})
