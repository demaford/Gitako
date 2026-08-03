import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { openSettings } from './sidebar'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Verify the complete saved-shortcut contract through the Settings UI.
 *
 * This spec deliberately uses a disposable extension profile. It mutates
 * chrome.storage, and a failed cleanup against the shared signed-in profile
 * would otherwise change the starting state of retries and later specs.
 */
test.describe('keyboard: configured shortcut toggles sidebar', () => {
  test('a saved shortcut flips the sidebar expanded state on press', async ({
    isolatedExtensionPage: page,
  }) => {
    await page.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop`)
    await expect(page.locator(selectors.gitako.toggleButton)).toBeAttached({ timeout: 15000 })

    await openSettings(page)
    await expect(page.locator(selectors.gitako.settings.title)).toBeVisible()

    const input = page.getByLabel(selectors.gitako.settings.shortcutToggleSidebarLabel)
    await expect(input).toBeVisible()
    await expect(input).toHaveValue('')
    await input.press('Control+Shift+KeyG')
    await expect(input).not.toHaveValue('')

    const save = page.locator(selectors.gitako.settings.saveButton).first()
    await expect(save).toBeEnabled()
    await save.click()

    await page.locator(selectors.gitako.settings.closeButton).click()
    await expect(page.locator(selectors.gitako.settings.title)).toBeHidden()

    // Move focus away from the shortcut input without clicking GitHub. The old
    // coordinate click landed on GitHub's Branches link and navigated the test
    // away from the repository page.
    await page.evaluate(() => {
      const sink = document.createElement('button')
      sink.id = 'gitako-e2e-keyboard-focus-sink'
      sink.type = 'button'
      sink.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px'
      document.body.appendChild(sink)
      sink.focus()
    })
    await expect(page.locator('#gitako-e2e-keyboard-focus-sink')).toBeFocused()

    const startingURL = page.url()
    const collapsed = page.locator(selectors.gitako.collapsedBodyWrapper)
    const beforeCollapsed = await collapsed.count()

    // Saving updates chrome.storage and rebinds the key handler asynchronously.
    // A press before the handler is live is a no-op; the first live press flips
    // the state and ends the poll.
    await expect
      .poll(
        async () => {
          await page.keyboard.press('Control+Shift+KeyG')
          await sleep(100)
          return collapsed.count()
        },
        { timeout: 10000 },
      )
      .not.toBe(beforeCollapsed)

    expect(page.url(), 'shortcut must not navigate the host page').toBe(startingURL)
  })
})
