import { expect, test } from './fixtures'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Gitako exposes a configurable keyboard shortcut for toggling the
 * sidebar (`config.shortcut` in src/utils/config/helper.ts). The
 * default is `undefined` — no key triggers anything — so the suite
 * needs to set a shortcut via the Settings UI before exercising it,
 * and restore the original at the end so the persistent profile is
 * unchanged for downstream specs.
 *
 * Verifies the contract: when a shortcut is configured, pressing it
 * flips the sidebar's expanded state. Failure mode is silent
 * (shortcut handler doesn't fire, user sees no response and assumes
 * the feature is broken).
 */

const shortcutLabelText = 'Keyboard shortcut for toggle sidebar'

async function revealSidebarBody(extensionPage: import('@playwright/test').Page) {
  await extensionPage.locator('.gitako-toggle-show-button').hover()
  await sleep(200)
  if (await extensionPage.locator('.gitako-side-bar-body-wrapper.collapsed').count()) {
    await extensionPage.locator('.gitako-toggle-show-button').click({ force: true })
    await sleep(400)
  }
}

async function openSettings(extensionPage: import('@playwright/test').Page) {
  await revealSidebarBody(extensionPage)
  await extensionPage.locator('[aria-label="Settings"]').click()
  await sleep(600)
}

async function closeSettings(extensionPage: import('@playwright/test').Page) {
  await extensionPage
    .locator('[aria-label="Close settings"]')
    .click({ timeout: 5000 })
    .catch(() => {})
  await sleep(300)
}

async function shortcutInputId(extensionPage: import('@playwright/test').Page) {
  return extensionPage.evaluate(text => {
    const label = Array.from(document.querySelectorAll('label')).find(l =>
      l.textContent?.includes(text),
    )
    return label?.getAttribute('for') ?? null
  }, shortcutLabelText)
}

// Returns the committed `value` displayed in the shortcut input — that's
// the friendly format, e.g. "Ctrl + Shift + \\". The keyHelper-stored
// raw value (e.g. "ctrl+shift+\\") is what triggers handlers; the UI
// formats it for display only. We round-trip via the UI so we don't
// need to parse the friendly format.
async function readShortcutDisplay(
  extensionPage: import('@playwright/test').Page,
  inputId: string,
) {
  return extensionPage.evaluate(id => {
    const el = document.getElementById(id) as HTMLInputElement | null
    return el?.value ?? ''
  }, inputId)
}

test.describe('keyboard: configured shortcut toggles sidebar', () => {
  test('a saved shortcut flips the sidebar expanded state on press', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop`)
    await sleep(2000)

    await openSettings(extensionPage)
    const inputId = await shortcutInputId(extensionPage)
    if (!inputId) throw new Error('Could not find shortcut input via label')

    const originalDisplay = await readShortcutDisplay(extensionPage, inputId)

    try {
      const input = extensionPage.locator(`[id="${inputId}"]`)
      // Stage the combo. We then check whether the input's value
      // actually changed — if not, the profile was already configured
      // to this combo (a prior crashed run that skipped its restore),
      // the form is not dirty, the Save button stays disabled, and
      // waiting for `Save:not([disabled])` would deadlock to test
      // timeout. In that case skip the Save step and go straight to
      // verifying the press flips the sidebar — that's the actual
      // contract under test.
      await input.click()
      await sleep(200)
      // pick a combo unlikely to collide with native browser shortcuts
      await input.press('Control+Shift+KeyG')
      await sleep(300)
      const afterPress = await readShortcutDisplay(extensionPage, inputId)

      if (afterPress !== originalDisplay) {
        // The "Save" button sits next to the input. Scope to the Gitako
        // sidebar and the enabled one specifically — there are multiple
        // shortcut FormControls and other settings buttons in the panel,
        // most disabled until something stages.
        await extensionPage
          .locator('.gitako-side-bar button:has-text("Save"):not([disabled])')
          .first()
          .click()
        await sleep(400)
      }

      // Close settings so the keydown propagation isn't intercepted by
      // any focused input.
      await closeSettings(extensionPage)
      // Move keyboard focus off any Gitako input
      await extensionPage
        .locator('body')
        .click({ position: { x: 200, y: 200 } })
        .catch(() => {})
      await sleep(200)

      // Capture starting expanded state, then fire the shortcut until it
      // flips. The keydown handler is (re)bound asynchronously after Save
      // commits the new config, so a single press right after Save can land
      // before the handler is live and be silently lost ("was 0, now 0"
      // flake). Press once per poll tick: a press with no live handler is a
      // no-op, so retrying is safe, and the first press after the handler
      // binds flips the state and ends the poll.
      const beforeCollapsed = await extensionPage
        .locator('.gitako-side-bar-body-wrapper.collapsed')
        .count()
      await expect
        .poll(
          async () => {
            await extensionPage.keyboard.press('Control+Shift+KeyG')
            await sleep(400)
            return extensionPage.locator('.gitako-side-bar-body-wrapper.collapsed').count()
          },
          {
            message: `shortcut press should flip collapsed state (was ${beforeCollapsed})`,
            timeout: 10000,
          },
        )
        .not.toBe(beforeCollapsed)
    } finally {
      // Restore the original shortcut. Re-open settings, focus the
      // input, clear it with Backspace, click the now-Clear-or-Save
      // button to commit. If the input already shows the original
      // value, no action needed.
      try {
        await openSettings(extensionPage)
        // React-Aria assigns fresh randomized ids on each Settings
        // panel mount; the inputId we cached before the panel was
        // closed is stale. Re-lookup by label text. (This was the
        // sneaky bug behind the previous "finally hangs 60s" failure.)
        const restoreInputId = await shortcutInputId(extensionPage)
        if (restoreInputId) {
          const current = await readShortcutDisplay(extensionPage, restoreInputId)
          if (current !== originalDisplay) {
            const input = extensionPage.locator(`[id="${restoreInputId}"]`)
            await input.click({ timeout: 5000 }).catch(() => {})
            await sleep(200)
            // Backspace clears to undefined in the input's local state.
            await extensionPage.keyboard.press('Backspace')
            await sleep(200)
            // The button now reads "Save" (committing the cleared value).
            await extensionPage
              .locator(
                '.gitako-side-bar button:has-text("Save"), .gitako-side-bar button:has-text("Clear")',
              )
              .first()
              .click({ timeout: 5000 })
              .catch(() => {})
            await sleep(400)
          }
        }
        await closeSettings(extensionPage)
      } catch {
        /* best-effort restore */
      }
    }
  })
})
