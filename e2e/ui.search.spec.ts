import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Search bar filters Gitako's file tree. Failure mode is silent —
 * user types, sees nothing happen (or sees stale results), assumes
 * file doesn't exist, gives up. Sentry catches nothing because no
 * exception was thrown.
 */

test.describe('ui: search filters file tree', () => {
  test('typing narrows the visible file list, clearing restores it', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop`)
    await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
      timeout: 10000,
    })
    await sleep(500)

    const initialCount = await extensionPage.locator(selectors.gitako.fileItem).count()
    expect(initialCount, 'initial file count').toBeGreaterThan(3)

    // Type a filter that should match at least one entry but not most
    const searchInput = extensionPage.locator('.gitako-side-bar input[aria-label="Search files"]')
    await searchInput.fill('package')
    await sleep(700) // debounce + filter render

    const filteredCount = await extensionPage.locator(selectors.gitako.fileItem).count()
    expect(filteredCount, 'count after typing "package"').toBeLessThan(initialCount)
    expect(filteredCount, 'at least one match for "package"').toBeGreaterThan(0)

    // Clear the input and verify full list returns
    await searchInput.fill('')
    await sleep(700)
    const restoredCount = await extensionPage.locator(selectors.gitako.fileItem).count()
    expect(restoredCount, 'count restored after clearing search').toBe(initialCount)
  })
})
