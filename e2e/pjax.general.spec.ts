import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { ensureSidebarExpanded } from './sidebar'
import { collapseFloatModeSidebar, patientClick, sleep, waitForRedirect } from './utils'

test.describe('in Gitako project page', () => {
  test.beforeEach(async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop/src`)
  })

  test('should work with PJAX', async ({ extensionPage }) => {
    await sleep(3000)

    await ensureSidebarExpanded(extensionPage)
    await patientClick(extensionPage, selectors.gitako.fileItemOf('src/analytics.ts'))
    await waitForRedirect(extensionPage)
    await collapseFloatModeSidebar(extensionPage)

    await waitForRedirect(extensionPage, () =>
      extensionPage.click(selectors.github.navBarItemIssues),
    )

    await waitForRedirect(extensionPage, () =>
      extensionPage.click(selectors.github.navBarItemPulls),
    )

    await waitForRedirect(extensionPage, async () => {
      await extensionPage.goBack()
    })
    await waitForRedirect(extensionPage, async () => {
      await extensionPage.goBack()
    })

    await expect(extensionPage.locator(selectors.github.breadcrumbFileName).first()).toHaveText(
      '/analytics.ts',
      { timeout: 10000 },
    )
  })
})
