import { expect, test } from './fixtures'
import { selectors } from './selectors'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Selector drift tripwire.
 *
 * Every selector in `selectors.ts` is a coupling point to GitHub's DOM.
 * GitHub redesigns surfaces routinely, and a selector that silently
 * starts matching zero (or worse, the wrong number of) elements is the
 * #1 source of regressions in this codebase. This spec walks each
 * selector against a fixture URL where it should resolve, with a
 * known expected count. When GitHub drifts, this fails first — before
 * the functional tests downstream — giving a clear, focused signal.
 */

type Probe = {
  label: string
  url: string
  selector: string
  /** expected count exactly; for "must be at least N" set min instead */
  count?: number
  min?: number
}

const probes: Probe[] = [
  // repo overview surface
  {
    label: 'navBarItemIssues on tree page',
    url: 'https://github.com/EnixCoda/Gitako/tree/develop/src',
    selector: selectors.github.navBarItemIssues,
    count: 1,
  },
  {
    label: 'navBarItemPulls on tree page',
    url: 'https://github.com/EnixCoda/Gitako/tree/develop/src',
    selector: selectors.github.navBarItemPulls,
    count: 1,
  },
  {
    label: 'navBarItemIssues on blob page',
    url: 'https://github.com/EnixCoda/Gitako/blob/develop/src/analytics.ts',
    selector: selectors.github.navBarItemIssues,
    count: 1,
  },
  {
    label: 'navBarItemIssues on repo overview',
    url: 'https://github.com/EnixCoda/Gitako',
    selector: selectors.github.navBarItemIssues,
    count: 1,
  },

  // tree page file-list shape
  {
    label: 'fileListItemFileLinks on tree page',
    url: 'https://github.com/EnixCoda/Gitako/tree/develop/src',
    selector: selectors.github.fileListItemFileLinks,
    min: 1,
  },
  {
    label: 'fileListItemLinkOf(specific file) on tree page',
    url: 'https://github.com/EnixCoda/Gitako/tree/develop/src',
    selector: selectors.github.fileListItemLinkOf('analytics.ts'),
    count: 1,
  },

  // blob page breadcrumb
  {
    label: 'breadcrumbFileName on blob page',
    url: 'https://github.com/EnixCoda/Gitako/blob/develop/src/analytics.ts',
    selector: selectors.github.breadcrumbFileName,
    min: 1,
  },
]

test.describe('drift: selectors', () => {
  for (const p of probes) {
    test(p.label, async ({ extensionPage }) => {
      await extensionPage.goto(testURL([p.url] as unknown as TemplateStringsArray), {
        timeout: 20000,
      })
      await sleep(2500)
      const actual = await extensionPage.evaluate(
        sel => document.querySelectorAll(sel).length,
        p.selector,
      )
      if (p.count !== undefined) {
        expect(actual, `${p.label} — selector "${p.selector}"`).toBe(p.count)
      } else if (p.min !== undefined) {
        expect(actual, `${p.label} — selector "${p.selector}"`).toBeGreaterThanOrEqual(p.min)
      }
    })
  }
})
