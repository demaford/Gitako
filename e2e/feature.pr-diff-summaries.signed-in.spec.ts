import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'

// Tripwire for the PR per-file "Viewed" markers, across both GitHub
// files-changed experiences.
//
// Gitako seeds each file node's `reviewed` flag from a server-rendered,
// cookie-authenticated fetch of /pull/N/files, then renders it as
// `.node-item-reviewed`. The data lives in two different shapes:
//   - New Files Changed Experience: embedded `diffSummaries` JSON
//     (`markedAsViewed`), read by resolveDiffSummaryMap.
//   - Classic experience (feature preview off): per-file
//     `input.js-reviewed-checkbox[name="viewed"]` inside each
//     `[id^="diff-"][data-path]` block, read by resolveClassicReviewedMap.
//
// Viewed state is per-user, so this only makes sense signed in. The test
// account (bot) is on the classic experience, so this exercises the
// classic fallback specifically. A marker renders for every file node
// regardless of whether the file was actually viewed, so its presence
// proves the chosen data path resolved. If both paths break, this goes red.
test.describe('PR diff summaries (signed-in)', () => {
  test.skip(
    !resolveProfilePath(),
    'no persistent profile configured; viewed markers are a signed-in-only concept',
  )

  test.beforeEach(async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/285`)
  })

  test('renders per-file viewed markers from the files page', async ({ extensionPage }) => {
    // Sidebar file tree is up first.
    await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
      timeout: 10000,
    })

    await expect(extensionPage.locator(selectors.gitako.reviewedMarker).first()).toBeVisible({
      timeout: 10000,
    })
  })
})
