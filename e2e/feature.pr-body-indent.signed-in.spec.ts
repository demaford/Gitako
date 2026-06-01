import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { detectDockMode, ensureDockMode, ensureSidebarExpanded } from './sidebar'
import { testURL } from './testURL'

// In persistent dock mode Gitako reserves screen space by indenting the
// document: it sets `data-with-gitako-spacing` on <html>, which the stylesheet
// turns into a `margin-left: var(--gitako-width)` on <body>. That's how the
// sidebar sits beside the page instead of over it.
//
// But on a PR's "Files changed" page GitHub may ship its OWN native file-tree
// pane (the new experience). When that pane is shown Gitako yields the gutter
// to it and does NOT indent — `shouldExpandSideBar()` returns false, so the
// bar stays collapsed and no spacing is applied. So the indent is expected
// precisely WHEN the native PR file tree is absent (the classic experience, or
// the new one with its tree pane hidden). This pins that positive case.
//
// Signed-in only: the native PR file-tree experience is gated to signed-in
// users, and persistent-mode auto-expand on a PR depends on that detection.
test.describe('feature: PR body indent in persistent dock mode', () => {
  test.skip(!resolveProfilePath(), 'native PR file-tree experience requires a signed-in profile')

  test('indents the body in PR changes when the native file tree is not active', async ({
    extensionPage,
  }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/197/files`)
    await extensionPage.locator(selectors.gitako.fileItem).first().waitFor({
      state: 'attached',
      timeout: 15000,
    })

    const original = await detectDockMode(extensionPage)
    try {
      await ensureDockMode(extensionPage, 'persistent')

      // Scope: this asserts the "native tree absent" contract. When GitHub's
      // own PR file tree is shown (new experience), Gitako defers to it and
      // does not indent — out of scope here, so skip that pass of the matrix.
      const nativeTreeShown = await extensionPage.evaluate(() => {
        const el = document.querySelector('file-tree[data-target="diff-layout.fileTree"]')
        if (!el) return false
        const { width, height } = el.getBoundingClientRect()
        return width * height > 0
      })
      test.skip(nativeTreeShown, 'native PR file tree shown: Gitako defers the gutter to it')

      await ensureSidebarExpanded(extensionPage)
      await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).not.toHaveClass(
        /collapsed/,
        { timeout: 5000 },
      )

      // Click a tree item, then assert the indent holds on the resulting diff.
      const node = extensionPage.locator(selectors.gitako.fileItemOf('.babelrc'))
      await expect(node).toBeVisible({ timeout: 10000 })
      await node.click()

      // <html data-with-gitako-spacing="left"> is what the stylesheet turns
      // into the body margin (see DOMHelper.setBodyIndent).
      await expect
        .poll(
          () =>
            extensionPage.evaluate(() =>
              document.documentElement.getAttribute('data-with-gitako-spacing'),
            ),
          { timeout: 5000 },
        )
        .toBe('left')
    } finally {
      try {
        await ensureDockMode(extensionPage, original)
      } catch {
        /* best-effort restore so the shared profile isn't left in persistent */
      }
    }
  })
})
