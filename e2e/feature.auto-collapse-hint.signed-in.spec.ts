import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'

// When the sidebar is pinned (persistent) with auto-expand on, Gitako stays
// collapsed on pages where GitHub shows its OWN file tree — otherwise two file
// trees would stack. That collapse is silent and confuses users, so Gitako
// surfaces a one-time-dismissable hint next to the toggle tentacle.
//
// A blob page is the reliable trigger: signed-in github.com renders the
// code-view file tree (`#repos-file-tree`) by default, so `shouldExpandSideBar`
// returns false for the native-tree reason and the after-redirect handler
// (turbo:load, which fires on initial load too) raises the hint. PR pages also
// have a native tree but only past a file-count threshold and often behind an
// "Expand file tree" toggle, so they're not a dependable fixture.
//
// Config is forced via Gitako's URL-config channel, which overrides stored
// config for this load only and disables persistence — the shared profile is
// never polluted (including by the "Don't show again" write below).
test.describe('feature: sidebar auto-collapse hint (signed-in)', () => {
  test.skip(!resolveProfilePath(), "GitHub's native file tree requires a signed-in profile")

  test('hint appears when the native file tree keeps the pinned sidebar collapsed', async ({
    extensionPage,
  }) => {
    // Wide enough that GitHub renders the code-view file tree (it hides below a
    // width breakpoint).
    await extensionPage.setViewportSize({ width: 1920, height: 1080 })
    await extensionPage.goto(
      testURL`https://github.com/EnixCoda/Gitako/blob/develop/README.md?gitako-config-sidebarToggleMode=%22persistent%22&gitako-config-intelligentToggle=null`,
    )

    // Precondition: the native tree is actually shown. If GitHub stops shipping
    // `#repos-file-tree` (drift) or hides it, skip rather than fail — there's
    // nothing for Gitako to defer to, so the hint legitimately wouldn't fire.
    const nativeTreeShown = await extensionPage.evaluate(() => {
      const el = document.querySelector('#repos-file-tree')
      if (!el) return false
      const { width, height } = el.getBoundingClientRect()
      return width * height > 0
    })
    test.skip(!nativeTreeShown, 'GitHub native code-view file tree not shown (drift / narrow)')

    // The native tree forces the pinned bar to stay collapsed...
    await expect(extensionPage.locator(selectors.gitako.collapsedBodyWrapper)).toHaveCount(1)
    // ...and that silent collapse raises the hint.
    const hint = extensionPage.locator(selectors.gitako.collapseHint)
    await expect(hint).toBeVisible({ timeout: 10000 })

    // Dismiss closes it for this view.
    await extensionPage.locator(selectors.gitako.collapseHintDismiss).click()
    await expect(hint).toBeHidden()

    // It is NOT one-time-ever: a fresh navigation (reload re-fires turbo:load)
    // shows it again, because "Don't show again" hasn't been chosen.
    await extensionPage.reload()
    await expect(hint).toBeVisible({ timeout: 10000 })

    // Choosing "Don't show again" closes it. Dispatch the click directly rather
    // than driving a real mouse: the popover overlaps GitHub's left-edge native
    // file tree, and Playwright's real-mouse .check() there intermittently tears
    // down the page ("Target page... has been closed"). The change handler is
    // what we're asserting, so a synthetic click exercises the same path.
    await extensionPage.locator(selectors.gitako.collapseHintNeverAgain).dispatchEvent('click')
    await expect(hint).toBeHidden()
  })
})
