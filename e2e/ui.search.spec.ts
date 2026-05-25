import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { expandFloatModeSidebar, sleep } from './utils'

/**
 * Search bar filters Gitako's file tree. Failure mode is silent —
 * user types, sees nothing happen (or sees stale results), assumes
 * file doesn't exist, gives up. Sentry catches nothing because no
 * exception was thrown.
 */

test.describe('ui: search filters file tree', () => {
  // Needs Gitako to actually load the file tree from GitHub. Without a
  // configured access token in either the persistent profile or via
  // GITAKO_ACCESS_TOKEN env, Gitako hits "Access Denied" and renders no
  // files — there's nothing for search to filter. Skip rather than fail.
  test.skip(
    !process.env.GITAKO_ACCESS_TOKEN,
    'GITAKO_ACCESS_TOKEN not set; Gitako cannot fetch the file tree, so search has nothing to filter',
  )

  test('typing narrows the visible file list, clearing restores it', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop`)
    // Expand the sidebar regardless of current mode (float hover doesn't
    // help when persistent+collapsed). Hover then click the toggle as a
    // belt-and-braces "ensure body is open" sequence.
    await expandFloatModeSidebar(extensionPage)
    if (await extensionPage.locator('.gitako-side-bar-body-wrapper.collapsed').count()) {
      await extensionPage.locator('.gitako-toggle-show-button').click({ force: true })
      await sleep(400)
    }
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
