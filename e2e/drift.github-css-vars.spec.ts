import * as fs from 'fs'
import * as path from 'path'
import { expect, test } from './fixtures'
import { sleep } from './utils'

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
  test(':root custom property keys match baseline', async ({ extensionPage }) => {
    await extensionPage.goto('https://github.com/EnixCoda/Gitako/tree/develop')
    await sleep(2500)

    const live = await extensionPage.evaluate(() => {
      const collected = new Set<string>()
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | null = null
        try {
          rules = sheet.cssRules
        } catch {
          continue
        }
        if (!rules) continue
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            if (!/^(:root|html)\b/.test(rule.selectorText)) continue
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style.item(i)
              if (prop.startsWith('--')) collected.add(prop)
            }
          }
        }
      }
      return Array.from(collected).sort()
    })

    const baseline = new Set(readBaseline())
    const liveSet = new Set(live)
    const added = live.filter(k => !baseline.has(k))
    const removed = [...baseline].filter(k => !liveSet.has(k)).sort()

    expect(
      { added, removed },
      'GitHub CSS design tokens differ from baseline — refresh ' +
        '`e2e/github-css-vars.baseline.txt` via _capture-css-baseline.spec.ts ' +
        'after confirming the change is benign for Gitako',
    ).toEqual({ added: [], removed: [] })
  })
})
