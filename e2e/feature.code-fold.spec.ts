import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Code-fold guard for the current github.com code view.
 *
 * Gitako's code-fold (`useGitHubCodeFold`) walks `<tr>` rows inside
 * `.blob-wrapper table`. github.com no longer ships that table — blob
 * pages render a virtualized `.react-code-lines` list — so the feature
 * cannot attach and would only confuse users if left on. It is now
 * default-off on github.com (`codeFolding: !isInGitHub` in
 * src/utils/config/helper.ts) and preserved only for GitHub Enterprise,
 * which still serves the legacy DOM and lacks GitHub's native gutter
 * folding.
 *
 * This spec pins that decision on a real blob page:
 *   - the sidebar renders (we are on a working blob page, so the
 *     no-fold assertions below aren't vacuously true on a blank page),
 *   - the legacy `.blob-wrapper table` is absent (the documented reason
 *     the feature is disabled — a tripwire if GitHub brings it back),
 *   - no `.gitako-code-fold-handler` is injected.
 *
 * package.json is used because it is long-lived and indented, so if the
 * feature ever did attach it would produce handlers here.
 */
test.describe('feature: code-fold is inert on current github.com blob DOM', () => {
  test.beforeEach(async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/blob/develop/package.json`)
  })

  test('renders no fold handler and no legacy table', async ({ extensionPage }) => {
    // Confirms the blob code view actually rendered (the page uses
    // responsive + virtualized DOM, so assert attachment, not visibility),
    // so the no-fold assertions below aren't vacuously true.
    await expect(extensionPage.locator(selectors.github.codeViewLines).first()).toBeAttached({
      timeout: 10000,
    })

    // Confirms Gitako actually mounted, so "no fold handler" means the
    // feature stayed off — not that the extension simply never ran.
    await expect(extensionPage.locator(selectors.gitako.files).first()).toBeAttached({
      timeout: 10000,
    })

    // Give any (unexpected) fold attachment a chance to run.
    await sleep(1500)

    expect(
      await extensionPage.locator(selectors.github.legacyBlobTable).count(),
      'legacy .blob-wrapper table should be gone on current github.com',
    ).toBe(0)

    expect(
      await extensionPage.locator(selectors.gitako.codeFoldHandler).count(),
      'Gitako must not inject code-fold handlers on github.com',
    ).toBe(0)
  })
})
