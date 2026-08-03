import * as fs from 'fs'
import * as path from 'path'
import { expect, test } from './fixtures'
import { waitForStableGitHubCssVars } from './githubCssVars'

/**
 * Detect changes to GitHub's CSS design-token surface.
 *
 * The CSS custom property keys defined on `:root` (Primer's design
 * tokens) are stable per deploy. When GitHub adds or removes a token,
 * this test surfaces the diff so we can decide if Gitako needs to
 * follow (typically: only if it references the removed key directly,
 * which it currently doesn't — but knowing first is the point).
 *
 * Baseline lives in `e2e/github-css-vars.baseline.txt`. Refresh via
 * `e2e/_capture-css-baseline.spec.ts` (kept out of the regular suite
 * because it WRITES the baseline). Light and dark schemes produce the
 * same key set; we probe light only.
 */

const BASELINE_PATH = path.resolve(__dirname, 'github-css-vars.baseline.txt')

function readBaseline(): string[] {
  return fs
    .readFileSync(BASELINE_PATH, 'utf8')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
}

test.describe('drift: GitHub CSS design tokens', () => {
  test(':root custom property keys match baseline', async ({ extensionPage }, testInfo) => {
    await extensionPage.goto('https://github.com/EnixCoda/Gitako/tree/develop')
    const baselineKeys = readBaseline()
    const live = await waitForStableGitHubCssVars(extensionPage, baselineKeys.length - 25)
    const baseline = new Set(baselineKeys)
    const liveSet = new Set(live)
    const added = live.filter(k => !baseline.has(k))
    const removed = [...baseline].filter(k => !liveSet.has(k)).sort()

    if (added.length || removed.length) {
      await testInfo.attach('github-css-vars-diff', {
        body: JSON.stringify({ added, removed }, null, 2),
        contentType: 'application/json',
      })
    }

    expect(
      { added, removed },
      'GitHub CSS design tokens differ from baseline — refresh ' +
        '`e2e/github-css-vars.baseline.txt` via maint.capture-css-baseline.spec.ts ' +
        'after confirming the change is benign for Gitako',
    ).toEqual({ added: [], removed: [] })
  })
})
