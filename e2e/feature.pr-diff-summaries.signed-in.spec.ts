import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { sleep } from './utils'

// Coverage for the per-file metadata Gitako overlays on a PR's file tree:
// viewed markers, live viewed-toggle, and diff stats. All run against one
// stable single-file PR (#285: a dependabot bump touching only yarn.lock),
// so the node sits at the top level and its diff block is always in the DOM.
//
// Viewed state is per-user, so these are signed-in only. The bot account is
// on the CLASSIC files experience (feature preview off), which is what the
// live-toggle test drives; it skips on the new experience (which swaps the
// checkbox for a React button + virtualizes the file list).
test.describe('PR per-file metadata (signed-in)', () => {
  test.skip(
    !resolveProfilePath(),
    'no persistent profile configured; viewed/diff overlays need the signed-in PR data path',
  )

  test.beforeEach(async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/285`)
    // Sidebar file tree must be up before any per-file assertion.
    await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
      timeout: 10000,
    })
  })

  // Tripwire for the "Viewed" markers across both files-changed experiences.
  // Gitako seeds each node's `reviewed` flag from a cookie-authenticated
  // fetch of /pull/N/files and renders `.node-item-reviewed`. A marker
  // renders for every file node regardless of actual viewed state, so its
  // presence proves the chosen data path (embedded JSON or classic DOM)
  // resolved. If both paths break, this goes red.
  test('renders per-file viewed markers from the files page', async ({ extensionPage }) => {
    await expect(extensionPage.locator(selectors.gitako.reviewedMarker).first()).toBeVisible({
      timeout: 10000,
    })
  })

  // Diff stats come from the REST PR-tree compare (`node.diff`), not the
  // files-changed experience, so a badge renders on every file node and
  // carries the change count in its title.
  test('renders per-file diff stats on file nodes', async ({ extensionPage }) => {
    const diff = extensionPage.locator(selectors.gitako.diffMarker).first()
    await expect(diff).toBeVisible({ timeout: 10000 })
    expect(await diff.getAttribute('title')).toMatch(/\d+ changes/)
  })

  // Per-file comment counts come from getCommentsMap (utils.ts), which
  // buckets a file's PR review comments into active (still in the diff) vs
  // resolved (outdated — `line === null`). The badge renders only for files
  // with at least one ACTIVE comment. Fixture: PR #197 carries a live in-diff
  // comment on `.babelrc` (verified `line` non-null, `isOutdated` false), so
  // that node must show the badge with an "N active" title. This is the
  // regression guard for the bucketing: before the fix, getCommentsMap split
  // on `position === null`, which counted every current comment as resolved
  // and rendered no badge at all. Uses its own PR, so it bypasses the #285
  // beforeEach by navigating directly.
  test('renders per-file comment counts for files with active review comments', async ({
    extensionPage,
  }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/197`)
    const babelrc = extensionPage.locator(selectors.gitako.fileItemOf('.babelrc'))
    await expect(babelrc).toBeVisible({ timeout: 10000 })

    const comment = babelrc.locator('.node-item-comment')
    await expect(comment).toBeVisible({ timeout: 10000 })
    // Title encodes the active/resolved split; the fixture comment is active.
    expect(await comment.getAttribute('title')).toMatch(/[1-9]\d* active/)
  })

  // The marker must (a) track the GitHub "Viewed" checkbox LIVE
  // (useGitHubReviewStatus mirrors the checkbox `change` onto the node without
  // a refetch) and (b) reflect the persisted state after a reload (the
  // server-rendered fetch re-seeds it). Drives the real checkbox, so it mutates
  // viewed state on the PR — restored in `finally`. Classic experience only;
  // skips on the new one (React button + virtualized files).
  const markerSelectorFor = (path: string) =>
    `.gitako-side-bar .files .node-item[title="${path}"] .node-item-reviewed`
  const isReviewed = (page: import('@playwright/test').Page, path: string) =>
    page.locator(markerSelectorFor(path)).evaluate(el => el.classList.contains('reviewed'))

  test('viewed marker tracks the checkbox live and persists across reload', async ({
    extensionPage,
  }) => {
    // The change listener only has a checkbox to react to on the /files tab
    // (the beforeEach lands on the PR overview, where it isn't rendered).
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/285/files`)
    await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
      timeout: 10000,
    })

    const checkbox = extensionPage.locator(selectors.github.prReviewedCheckbox).first()
    await checkbox.waitFor({ timeout: 8000 }).catch(() => {})
    if ((await checkbox.count()) === 0) {
      test.skip(true, 'classic reviewed-checkbox absent (new files-changed experience)')
    }

    // The path this checkbox belongs to — match it to the Gitako node.
    const path = await checkbox.evaluate(el =>
      el.closest('[id^="diff-"]')?.querySelector('[data-path]')?.getAttribute('data-path'),
    )
    expect(path, 'checkbox resolves to a file path').toBeTruthy()
    if (!path) return

    await expect(extensionPage.locator(markerSelectorFor(path))).toBeVisible({ timeout: 10000 })
    const before = await isReviewed(extensionPage, path)

    // Toggle and wait for the persistence POST so the reload sees the new
    // state. force:true because GitHub visually hides the raw <input>.
    const toggleAndPersist = async () => {
      const cb = extensionPage.locator(selectors.github.prReviewedCheckbox).first()
      await Promise.all([
        extensionPage
          .waitForResponse(r => /viewed/i.test(r.url()), { timeout: 8000 })
          .catch(() => null),
        cb.click({ force: true }),
      ])
      await sleep(800) // settle the POST even if the URL matcher missed it
    }

    try {
      await toggleAndPersist()

      // (a) live update — no reload.
      await expect.poll(() => isReviewed(extensionPage, path), { timeout: 8000 }).toBe(!before)

      // (b) persistence — the toggled state survives a fresh page load.
      await extensionPage.reload()
      await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
        timeout: 10000,
      })
      await expect(extensionPage.locator(markerSelectorFor(path))).toBeVisible({ timeout: 10000 })
      await expect.poll(() => isReviewed(extensionPage, path), { timeout: 10000 }).toBe(!before)
    } finally {
      // Restore the original viewed state so the PR isn't left mutated.
      const restored = await isReviewed(extensionPage, path).catch(() => before)
      if (restored !== before) {
        await toggleAndPersist().catch(() => {})
        await expect
          .poll(() => isReviewed(extensionPage, path), { timeout: 8000 })
          .toBe(before)
          .catch(() => {})
      }
    }
  })

  // Regression guard for the classic-experience initial seed
  // (resolveClassicReviewedMap in getPullRequestTreeData.ts). The live mirror
  // (useGitHubReviewStatus) only attaches its change listener once the tree
  // has rendered, so a "Viewed" click made while the tree is still loading is
  // invisible to it — the node's state then comes ENTIRELY from the seed's
  // read of the live document. A click flips the checkbox's `.checked`
  // PROPERTY immediately, but GitHub's JS only syncs the server-rendered
  // `checked` ATTRIBUTE once its persistence POST resolves (measured: the two
  // diverge for ~1–2s; forever if the POST fails). A seed that reads
  // `hasAttribute('checked')` reports the pre-click state during that window
  // — the bug this guards against. Deterministic repro: gate the PR tree API
  // so the seed read happens inside the window, and model the mid-flight
  // click by setting the property directly (no change event — exactly what
  // the detached mirror sees; no POST — nothing to restore), then assert the
  // marker shows the post-click state.
  test('seeds viewed state from the live checkbox when toggled during tree load', async ({
    extensionPage,
  }) => {
    const TREE_API = '**/repos/EnixCoda/Gitako/pulls/285/files*'
    let release!: () => void
    const gate = new Promise<void>(resolve => (release = resolve))
    await extensionPage.context().route(TREE_API, async route => {
      await gate
      // The finally-block's release+unroute can auto-resume a still-pending
      // route before this handler wakes (seen on the new-experience pass,
      // where the skip path tears down with the gate still held) — continuing
      // an already-handled route throws and would fail an otherwise-skipped
      // test.
      await route.continue().catch(() => {})
    })

    try {
      // Full page load (not pjax) so the tree builds fresh on the /files page,
      // where getPullPageDocuments reads the LIVE document.
      await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/pull/285/files`)

      const checkbox = extensionPage.locator(selectors.github.prReviewedCheckbox).first()
      await checkbox.waitFor({ timeout: 8000 }).catch(() => {})
      if ((await checkbox.count()) === 0) {
        test.skip(true, 'classic reviewed-checkbox absent (new files-changed experience)')
      }

      const path = await checkbox.evaluate(el =>
        el.closest('[id^="diff-"]')?.querySelector('[data-path]')?.getAttribute('data-path'),
      )
      expect(path, 'checkbox resolves to a file path').toBeTruthy()
      if (!path) return

      // Flip the property while the tree fetch is gated — the attribute and
      // the (not-yet-attached) live mirror both still hold the old state, so
      // only the seed's property read can get this right.
      const before = await checkbox.evaluate(el => (el as HTMLInputElement).checked)
      await checkbox.evaluate((el, want) => {
        ;(el as HTMLInputElement).checked = want
      }, !before)
      release()

      await expect(extensionPage.locator(selectors.gitako.fileItem).first()).toBeVisible({
        timeout: 10000,
      })
      await expect(extensionPage.locator(markerSelectorFor(path))).toBeVisible({ timeout: 10000 })
      await expect.poll(() => isReviewed(extensionPage, path), { timeout: 8000 }).toBe(!before)
    } finally {
      release()
      await extensionPage
        .context()
        .unroute(TREE_API)
        .catch(() => {})
    }
  })
})
