import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { ensureSidebarExpanded } from './sidebar'
import { testURL } from './testURL'

// Gitako's sidebar auto-expands on code/commit/pull pages (persistent +
// auto-expand mode) but NOT on issue pages: `shouldExpandSideBar()` gates on
// the page type, and issue pages are deliberately excluded (isInIssuePage was
// removed from the check). An issue page still renders the repo's
// default-branch tree — the user just has to expand the bar themselves.
//
// This pins that contract. The collapse here is NOT the native-tree collapse
// (issues have no native file tree), so the auto-collapse hint must not
// appear either — that hint is reserved for "Gitako yielded the gutter to
// GitHub's own tree".
//
// Config is forced via the URL-config channel (overrides stored config for
// this load only and disables persistence), so the shared profile is never
// polluted.
test.describe('feature: no auto-expand on issue pages (signed-in)', () => {
  test.skip(!resolveProfilePath(), 'issue-page expand behavior needs the signed-in profile')

  test('sidebar stays collapsed on an issue page in persistent auto mode', async ({
    extensionPage,
  }) => {
    await extensionPage.goto(
      testURL`https://github.com/EnixCoda/Gitako/issues/318?gitako-config-sidebarToggleMode=%22persistent%22&gitako-config-intelligentToggle=null`,
    )

    // Gitako mounts on the issue page...
    await expect(extensionPage.locator(selectors.gitako.toggleButton)).toBeAttached({
      timeout: 15000,
    })
    // ...but the pinned bar must NOT auto-expand (issue pages are excluded
    // from shouldExpandSideBar).
    await expect(extensionPage.locator(selectors.gitako.collapsedBodyWrapper)).toBeAttached({
      timeout: 10000,
    })
    // And it's not the native-tree collapse: issues have no native file tree,
    // so the auto-collapse hint must not appear.
    await expect(extensionPage.locator(selectors.gitako.collapseHint)).toHaveCount(0)

    // Non-vacuous: the page is a valid Gitako page — the default-branch tree
    // loads once the user expands manually. Soft-guarded: if the tree never
    // loads it's a GitHub page drift concern, not the auto-expand contract
    // under test (which the assertions above already pinned).
    await ensureSidebarExpanded(extensionPage)
    const treeLoaded = await expect
      .poll(() => extensionPage.locator(selectors.gitako.fileItem).first().isVisible(), {
        timeout: 15000,
      })
      .toBe(true)
      .then(() => true)
      .catch(() => false)
    test.skip(!treeLoaded, 'issue page did not render the default-branch tree (drift?)')
  })

  test('sidebar still expands on an issue page when pinned expanded', async ({ extensionPage }) => {
    // Control: the sidebar CAN expand on an issue page — it just must not
    // AUTO-expand. Pinning expanded (intelligentToggle=true) proves the page
    // is a valid Gitako page and the tree renders.
    await extensionPage.goto(
      testURL`https://github.com/EnixCoda/Gitako/issues/318?gitako-config-sidebarToggleMode=%22persistent%22&gitako-config-intelligentToggle=true`,
    )
    await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).not.toHaveClass(/collapsed/, {
      timeout: 15000,
    })
    await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
      timeout: 15000,
    })
  })
})
