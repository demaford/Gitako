import { expect, test } from './fixtures'
import { assertGitakoAbsent, assertGitakoMounted } from './lifecycle'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Anti-drift coverage for the page-type matrix.
 *
 * For every URL pattern this extension can land on, assert (a) whether
 * Gitako should be mounted at all, and (b) when mounted, that meta
 * resolution lands on the right branch/ref. This catches the class of
 * bug that historically dominates this codebase: GitHub redesigns a
 * surface, our DOM selectors stop matching, and meta resolution
 * silently returns null or the wrong value.
 *
 * Branch text is read from the rendered sidebar (`.branch-name`) rather
 * than poking Gitako's internals — same DOM path the user sees.
 */

type PageCase = {
  name: string
  url: string
  expect: 'mounted' | 'absent'
  /** when mounted, the literal text the sidebar's branch-name should show */
  branchText?: string
}

const repoPages: PageCase[] = [
  { name: 'repo overview', url: 'https://github.com/EnixCoda/Gitako', expect: 'mounted' },
  {
    name: 'tree, default branch with path',
    url: 'https://github.com/EnixCoda/Gitako/tree/develop/src',
    expect: 'mounted',
    branchText: 'develop',
  },
  {
    name: 'tree, simple branch name',
    url: 'https://github.com/EnixCoda/Gitako/tree/v3',
    expect: 'mounted',
    branchText: 'v3',
  },
  {
    name: 'tree, slashed branch name',
    url: 'https://github.com/EnixCoda/Gitako/tree/test/200-changed-files-200-lines-each',
    expect: 'mounted',
    branchText: 'test/200-changed-files-200-lines-each',
  },
  {
    name: 'blob',
    url: 'https://github.com/EnixCoda/Gitako/blob/develop/src/analytics.ts',
    expect: 'mounted',
    branchText: 'develop',
  },
  {
    name: 'pull request',
    url: 'https://github.com/EnixCoda/Gitako/pull/1',
    expect: 'mounted',
    // PR pages render the PR title in the branch slot, not a ref name;
    // assert non-empty rather than a specific string.
  },
  {
    name: 'commit page',
    url: 'https://github.com/EnixCoda/Gitako/commit/8adccd9',
    expect: 'mounted',
    // Commit pages render the commit subject in the branch slot
    // (getCurrentBranch falls through to getCommitTitle for commits).
    // Asserts the literal subject from a known stable commit so a
    // regression in the commit-title extraction surfaces here.
    branchText: 'test: support persistent browser profile for signed-in e2e runs',
  },
]

const nonRepoPages: PageCase[] = [
  { name: 'github root', url: 'https://github.com/', expect: 'absent' },
  { name: 'settings', url: 'https://github.com/settings/profile', expect: 'absent' },
]

test.describe('drift: page matrix', () => {
  for (const c of [...repoPages, ...nonRepoPages]) {
    test(`${c.expect === 'mounted' ? 'mounts' : 'absent'} on ${c.name}`, async ({
      extensionPage,
    }) => {
      await extensionPage.goto(testURL([c.url] as unknown as TemplateStringsArray), {
        timeout: 20000,
      })
      await sleep(2500)

      if (c.expect === 'absent') {
        await assertGitakoAbsent(extensionPage, c.name)
        return
      }

      await assertGitakoMounted(extensionPage, c.name)

      // Branch-name slot should be populated. We always assert it's
      // non-empty (catches meta resolution returning null). If the case
      // has a literal expectation, also assert the exact text.
      const branchLocator = extensionPage.locator(selectors.gitako.branchName)
      if (c.branchText !== undefined) {
        await expect(branchLocator, `${c.name}: branch-name text`).toHaveText(c.branchText, {
          timeout: 10000,
        })
      } else {
        const text = (await branchLocator.textContent({ timeout: 10000 }))?.trim() ?? ''
        expect(text.length, `${c.name}: branch-name non-empty`).toBeGreaterThan(0)
      }
    })
  }
})
