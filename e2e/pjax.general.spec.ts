import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { ensureSidebarExpanded } from './sidebar'
import { testURL } from './testURL'
import { collapseFloatModeSidebar } from './utils'

async function navigateAndWait(
  page: Page,
  action: () => Promise<unknown>,
  expectedURL: string,
  ready: () => Promise<unknown>,
) {
  await page.evaluate(() => {
    const navigationWindow = window as typeof window & {
      __gitakoE2ENavigationSettled?: Promise<void>
    }
    navigationWindow.__gitakoE2ENavigationSettled = new Promise<void>(resolve => {
      const finish = () => {
        document.removeEventListener('turbo:load', finish)
        document.removeEventListener('pjax:end', finish)
        resolve()
      }
      document.addEventListener('turbo:load', finish)
      document.addEventListener('pjax:end', finish)
    })
  })
  const settled = page
    .evaluate(
      () =>
        (
          window as typeof window & {
            __gitakoE2ENavigationSettled?: Promise<void>
          }
        ).__gitakoE2ENavigationSettled,
    )
    // A true full-page navigation destroys the old execution context instead
    // of delivering a Turbo/PJAX event. In that case load-state is the settled
    // signal; the destination-specific assertion below is still authoritative.
    .catch(() => page.waitForLoadState('domcontentloaded'))
  await Promise.all([page.waitForURL(expectedURL, { timeout: 15000 }), action()])
  await settled
  await ready()
}

test.describe('in Gitako project page', () => {
  test.beforeEach(async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop/src`)
  })

  test('should work with PJAX', async ({ extensionPage }) => {
    await expect(extensionPage.locator(selectors.gitako.toggleButton)).toBeAttached({
      timeout: 15000,
    })
    await ensureSidebarExpanded(extensionPage)

    const analytics = extensionPage.locator(selectors.gitako.fileItemOf('src/analytics.ts'))
    await expect(analytics).toBeVisible({ timeout: 15000 })
    await navigateAndWait(
      extensionPage,
      () => analytics.click(),
      '**/blob/develop/src/analytics.ts',
      () =>
        expect(extensionPage.locator(selectors.github.breadcrumbFileName).first()).toHaveText(
          '/analytics.ts',
        ),
    )
    await collapseFloatModeSidebar(extensionPage)

    await navigateAndWait(
      extensionPage,
      () => extensionPage.locator(selectors.github.navBarItemIssues).click(),
      '**/issues',
      () => expect(extensionPage.getByRole('heading', { name: 'All issues' })).toBeVisible(),
    )

    await navigateAndWait(
      extensionPage,
      () => extensionPage.locator(selectors.github.navBarItemPulls).click(),
      '**/pulls',
      () =>
        expect(
          extensionPage.getByRole('heading', { name: /Pull requests/i }).first(),
        ).toBeVisible(),
    )

    await navigateAndWait(
      extensionPage,
      () => extensionPage.goBack(),
      '**/issues',
      () => expect(extensionPage.getByRole('heading', { name: 'All issues' })).toBeVisible(),
    )
    await navigateAndWait(
      extensionPage,
      () => extensionPage.goBack(),
      '**/blob/develop/src/analytics.ts',
      () =>
        expect(extensionPage.locator(selectors.github.breadcrumbFileName).first()).toHaveText(
          '/analytics.ts',
        ),
    )
  })
})
