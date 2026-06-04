import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'

// Gitako can dock on the right (`sidebarPlacement: 'right'`, the experimental
// option in Settings). That side has its own CSS branch: the resize handle
// moves to the inner edge and, in persistent mode, the body is indented with
// `margin-right` instead of `margin-left` (DOMHelper.setBodyIndent → the
// `html[data-with-gitako-spacing='right']` rule). Nothing in the suite
// exercised the right side before, so a regression there (e.g. a left-only
// margin rule, or `setBodyIndent` ignoring placement) was invisible.
//
// We force config via Gitako's URL-config channel (`?gitako-config-<key>=<json>`),
// which overrides stored config for this load only and — crucially — disables
// persistence, so the shared profile is never polluted. No sign-in needed.
//
// `intelligentToggle=true` pins a saved-expanded state so the bar is expanded
// regardless of auto-expand's page heuristics: on a signed-in profile GitHub
// shows its OWN native file tree on the repo page, which would make auto-expand
// (`intelligentToggle=null`) keep Gitako collapsed. Pinning expanded keeps this
// test about the RIGHT placement CSS + right-margin indent, not about
// native-tree detection (covered elsewhere).
test.describe('state: right-side dock placement', () => {
  test('docks on the right and indents the body with right margin', async ({ extensionPage }) => {
    await extensionPage.goto(
      testURL`https://github.com/EnixCoda/Gitako/tree/develop?gitako-config-sidebarPlacement=%22right%22&gitako-config-sidebarToggleMode=%22persistent%22&gitako-config-intelligentToggle=true`,
    )

    const rightWrapper = extensionPage.locator(selectors.gitako.bodyWrapperPlacementRight)
    await expect(rightWrapper).toBeAttached({ timeout: 15000 })
    // It must not have landed on the left.
    await expect(extensionPage.locator(selectors.gitako.bodyWrapperPlacementLeft)).toHaveCount(0)

    // Persistent + auto-expand on a code page expands; the wrapper should be
    // visible, not collapsed.
    await expect(rightWrapper).not.toHaveClass(/collapsed/, { timeout: 10000 })

    // The right-side body indent: <html data-with-gitako-spacing="right">,
    // which the stylesheet turns into `margin-right: var(--gitako-width)`.
    await expect
      .poll(
        () =>
          extensionPage.evaluate(() =>
            document.documentElement.getAttribute('data-with-gitako-spacing'),
          ),
        { timeout: 10000 },
      )
      .toBe('right')
  })
})
