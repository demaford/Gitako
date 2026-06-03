import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'

// Guards the DOM-reuse fast path for the PR file tree. When Gitako builds the
// tree on a PR's files page it can reuse the already-loaded page document
// instead of refetching it — gated by `isInPullFilesPage()` (URLHelper.ts).
//
// The New Files Changed Experience serves that page at `/pull/<N>/changes`,
// not `/pull/<N>/files`. `isInPullFilesPage()` once matched only `files`, so
// on `/changes` it returned false, dropped the reuse path, and refetched
// `github.com/<owner>/<repo>/pull/<N>/files` (API.getPullPageDocuments →
// continuousLoadFragmentedPagesFromUrl → getDOM → fetch). The output was
// still correct (GitHub serves the same new-experience document at /files),
// so every DOM/output assertion stayed green and the regression was invisible
// — exactly the kind of gap the preview matrix can't catch without an
// assertion. This pins it: on `/changes`, building the tree must NOT issue a
// redundant page fetch to `/pull/<N>/files`.
//
// Signed-in + new-experience only: `/changes` is honoured solely by the New
// Files Changed Experience. We navigate straight to it and skip when it didn't
// engage (classic experience / all-OFF pass / an account without the feature).
test.describe('feature: PR files-page DOM reuse (no redundant refetch)', () => {
  test.skip(!resolveProfilePath(), 'new files-changed experience requires a signed-in profile')

  test('building the tree on /changes does not refetch /pull/<N>/files', async ({
    extensionPage,
  }) => {
    // The redundant fetch is a GET to the github.com PAGE at this exact path
    // (not the REST API at api.github.com/repos/.../pulls/<N>/files).
    const redundantPath = '/EnixCoda/Gitako/pull/197/files'
    const refetches: string[] = []
    extensionPage.on('request', req => {
      try {
        const u = new URL(req.url())
        if (u.hostname === 'github.com' && u.pathname === redundantPath) refetches.push(req.url())
      } catch {
        /* ignore unparseable */
      }
    })

    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/197/changes`)

    // Did the new experience actually engage? Only it honours `/changes`;
    // classic redirects to `/files`. Skip otherwise so the all-OFF matrix
    // pass / featureless accounts don't fail spuriously.
    const engaged = await extensionPage.evaluate(() => location.pathname.endsWith('/changes'))
    test.skip(!engaged, 'new files-changed experience not active (classic / prx_files OFF)')

    // Wait for Gitako to build the tree — that's what triggers the
    // (potential) refetch via getPullRequestTreeData.
    await extensionPage.locator(selectors.gitako.fileItem).first().waitFor({
      state: 'attached',
      timeout: 20000,
    })
    // The node hrefs are built only after getPullPageDocuments resolves, so a
    // rendered tree already implies the (potential) refetch fired; the request
    // listener captures it synchronously at fetch start. Settle briefly anyway.
    await extensionPage.waitForTimeout(1500)

    expect(
      refetches,
      `tree build on /changes must reuse the page DOM, not refetch ${redundantPath}`,
    ).toEqual([])
  })
})
