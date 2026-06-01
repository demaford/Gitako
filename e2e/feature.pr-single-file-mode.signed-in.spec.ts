import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { ensureSidebarExpanded } from './sidebar'
import { testURL } from './testURL'

// Single-file mode is part of the New Files Changed Experience (prx_files):
// large PRs expose a "Switch to single file mode" banner whose link is
// `<changes>?mode=single`. In that mode GitHub renders ONE file's diff at a
// time inside a comparison viewer (`#diff-comparison-viewer-container`) and
// swaps the shown file when the URL hash changes.
//
// Gitako builds each PR node's href from the *current* location, so in this
// mode the node href carries the `?mode=single` query through
// (`…/changes?mode=single#diff-<hash>`). Clicking a node is therefore a
// same-page hash change that the single-file viewer reacts to by showing that
// file. This pins exactly that: a Gitako click selects the right file in
// single-file mode (in contrast to a cross-page hop from the conversation
// page, which the React `/changes` router lands without scrolling — see
// nav.pull-request-page.spec.ts).
//
// Signed-in + new-experience only: `?mode=single` is honoured solely by the
// New Files Changed Experience (the nightly all-ON pass). We navigate straight
// to it and skip when the single-file viewer didn't mount (classic experience
// / all-OFF pass / an account without the feature).
test.describe('feature: PR single-file mode navigation', () => {
  test.skip(!resolveProfilePath(), 'single-file mode requires a signed-in profile')

  test('clicking a Gitako node selects that file in single-file mode', async ({
    extensionPage,
  }) => {
    // Single-file mode lays out a side file-tree + viewer; give it room.
    await extensionPage.setViewportSize({ width: 1680, height: 1000 })
    // PR #311 is large enough that GitHub offers single-file mode.
    await extensionPage.goto(
      testURL`https://github.com/EnixCoda/Gitako/pull/311/changes?mode=single`,
    )
    await extensionPage.locator(selectors.gitako.fileItem).first().waitFor({
      state: 'attached',
      timeout: 20000,
    })

    // Did single-file mode actually engage? Only the New Files Changed
    // Experience honours `?mode=single` (classic drops it). Skip otherwise so
    // the all-OFF matrix pass / featureless accounts don't fail spuriously.
    const engaged = await extensionPage.evaluate(
      () =>
        location.search.includes('mode=single') &&
        !!document.getElementById('diff-comparison-viewer-container'),
    )
    test.skip(!engaged, 'single-file mode not active (classic experience / prx_files OFF)')

    await ensureSidebarExpanded(extensionPage)

    // Pick a Gitako file node whose target differs from the file shown on load
    // (single-file mode auto-selects the first file's `#diff-` on entry).
    const initialHash = await extensionPage.evaluate(() => location.hash)
    const hrefs = await extensionPage.$$eval(selectors.gitako.fileItem, els =>
      els.map(el => (el as HTMLAnchorElement).href),
    )
    const idx = hrefs.findIndex(h => {
      try {
        const u = new URL(h)
        return /^#diff-[0-9a-f]+$/.test(u.hash) && u.hash !== initialHash
      } catch {
        return false
      }
    })
    expect(idx, 'found a file node targeting a different file').toBeGreaterThanOrEqual(0)

    const node = extensionPage.locator(selectors.gitako.fileItem).nth(idx)
    await expect(node).toBeVisible({ timeout: 10000 })
    const target = new URL(await node.evaluate(el => (el as HTMLAnchorElement).href))
    // The node must keep the single-file query so the viewer swaps in-place.
    expect(target.search, 'node carries ?mode=single').toContain('mode=single')

    await node.click()

    // Hash updates to the target file, and the single-file viewer shows it:
    // its diff block is the visible one and in the viewport.
    await expect
      .poll(() => extensionPage.evaluate(() => location.hash), { timeout: 10000 })
      .toBe(target.hash)
    const block = extensionPage.locator(target.hash)
    await expect(block).toBeVisible({ timeout: 10000 })
    await expect(block).toBeInViewport()
  })
})
