import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { ensureSidebarExpanded } from './sidebar'
import { testURL } from './testURL'

test.describe('in Gitako project page', () => {
  test.beforeEach(async ({ extensionPage }) => {
    await extensionPage.goto(
      testURL`https://github.com/EnixCoda/Gitako/tree/test/200-changed-files-200-lines-each`,
    )
  })

  test('should render Gitako', async ({ extensionPage }) => {
    // Expand first so the assertion holds in either dock mode (float hides
    // the body until hover; persistent can start collapsed).
    await ensureSidebarExpanded(extensionPage)
    await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).toBeVisible({ timeout: 5000 })
  })

  test('should resolve branch name with slashes', async ({ extensionPage }) => {
    await expect(extensionPage.locator(selectors.gitako.branchName)).toHaveText(
      'test/200-changed-files-200-lines-each',
      { timeout: 5000 },
    )
  })

  test('should render file list', async ({ extensionPage }) => {
    await ensureSidebarExpanded(extensionPage)
    await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('should render while scroll', async ({ extensionPage }) => {
    await ensureSidebarExpanded(extensionPage)

    await extensionPage.waitForSelector(selectors.gitako.files)
    // node of tsconfig.json should NOT be rendered before scroll down
    await expect(
      extensionPage.locator(selectors.gitako.fileItemOf('tsconfig.json')),
    ).not.toBeVisible({
      timeout: 2000,
    })

    const filesEle = extensionPage.locator(selectors.gitako.files)
    const box = await filesEle.boundingBox()
    if (box) {
      // Keep the float-mode sidebar expanded while we scroll.
      await extensionPage.mouse.move(box.x + 40, box.y + 40)
      // Scroll the virtualized container directly. `mouse.wheel` is unreliable
      // here: it can land on the page instead of the sidebar's scroll container,
      // leaving the target node unrendered. Setting `scrollTop` fires the same
      // `onScroll` that drives virtualization, deterministically.
      await filesEle.evaluate(el => {
        const scroller = el.firstElementChild as HTMLElement
        scroller.scrollTop = scroller.scrollHeight
      })

      // node of tsconfig.json should be rendered now
      await expect(extensionPage.locator(selectors.gitako.fileItemOf('tsconfig.json'))).toBeVisible(
        { timeout: 5000 },
      )
    }
  })
})

test.describe('in Gitako project page on a simple branch', () => {
  test.beforeEach(async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/v3`)
  })

  test('should resolve simple branch name', async ({ extensionPage }) => {
    await expect(extensionPage.locator(selectors.gitako.branchName)).toHaveText('v3', {
      timeout: 5000,
    })
  })
})
