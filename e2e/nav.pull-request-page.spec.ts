import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { expandFloatModeSidebar } from './utils'

test.describe('in Gitako pull request page', () => {
  test.beforeEach(async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/71`)
  })

  test('should render Gitako', async ({ extensionPage }) => {
    await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).toBeVisible({ timeout: 5000 })
  })

  test('should render file list', async ({ extensionPage }) => {
    await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
      timeout: 5000,
    })
  })
})

// Clicking a file node in a PR must jump to that file's diff. Each PR node's
// URL carries a `#diff-<hash>` anchor matching the diff block's `id`, so a
// click sets the hash and the matching block scrolls into view. PR #197 is a
// 5-file PR; "long added file.txt" sits below the fold, so a successful jump
// has to actually scroll. The assertion relies only on the hash + the
// `#diff-<id>` block (NOT `[data-path]`, which is absent on the classic
// experience) so it holds for both files-changed experiences — verified ON and
// OFF, and the nightly preview matrix multiplies it across both.
test.describe('in Gitako pull request files page', () => {
  test("clicking a file node jumps to that file's diff", async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/197/files`)
    // The tree body may be collapsed (the dock mode + collapsed state persist
    // in the profile). Wait for a node to attach, then expand: hover reveals
    // it in float mode, clicking the toggle expands it in persistent mode.
    await extensionPage
      .locator(selectors.gitako.fileItem)
      .first()
      .waitFor({ state: 'attached', timeout: 15000 })
    await expandFloatModeSidebar(extensionPage)
    if (await extensionPage.locator(selectors.gitako.collapsedBodyWrapper).count()) {
      await extensionPage.locator(selectors.gitako.toggleButton).click({ force: true })
    }
    await expect(extensionPage.locator(selectors.gitako.bodyWrapper)).not.toHaveClass(/collapsed/, {
      timeout: 5000,
    })

    const node = extensionPage.locator(selectors.gitako.fileItemOf('long added file.txt'))
    await expect(node).toBeVisible({ timeout: 10000 })

    // The node itself is the anchor; its href encodes the target diff block id.
    const expectedHash = await node.evaluate(el => new URL((el as HTMLAnchorElement).href).hash)
    expect(expectedHash, 'node carries a #diff- anchor').toMatch(/^#diff-[0-9a-f]+$/)

    await node.click()

    // (a) navigation: the page hash becomes the clicked file's diff anchor.
    await expect
      .poll(() => extensionPage.evaluate(() => window.location.hash), { timeout: 10000 })
      .toBe(expectedHash)

    // (b) the file's change is shown: its diff block exists and is in view.
    const block = extensionPage.locator(expectedHash)
    await expect(block).toBeVisible({ timeout: 10000 })
    await expect(block).toBeInViewport()
  })
})
