import * as fs from 'fs'
import * as path from 'path'
import { expect, test } from './fixtures'
import { sleep } from './utils'

// Maintenance script: refresh `github-css-vars.baseline.txt` after a
// known-good GitHub deploy. Gated behind an env var so the regular e2e
// suite doesn't accidentally overwrite the baseline. To run:
//
//   CAPTURE_CSS_BASELINE=1 yarn playwright test e2e/maint.capture-css-baseline.spec.ts
//
// The companion `drift.github-css-vars.spec.ts` then diffs live state
// against the baseline file.
test.skip(
  !process.env.CAPTURE_CSS_BASELINE,
  'Set CAPTURE_CSS_BASELINE=1 to refresh the baseline file.',
)

test('refresh CSS custom property baseline', async ({ extensionPage }) => {
  await extensionPage.goto('https://github.com/EnixCoda/Gitako/tree/develop')
  await sleep(2500)
  const vars = await extensionPage.evaluate(() => {
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
  fs.writeFileSync(path.resolve(__dirname, 'github-css-vars.baseline.txt'), vars.join('\n') + '\n')
  console.log(`wrote ${vars.length} CSS custom property keys`)
  expect(vars.length).toBeGreaterThan(500)
})
