import * as fs from 'fs'
import * as path from 'path'
import { expect, test } from './fixtures'
import { waitForStableGitHubCssVars } from './githubCssVars'

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
  const vars = await waitForStableGitHubCssVars(extensionPage, 500)
  fs.writeFileSync(path.resolve(__dirname, 'github-css-vars.baseline.txt'), vars.join('\n') + '\n')
  console.log(`wrote ${vars.length} CSS custom property keys`)
  expect(vars.length).toBeGreaterThan(500)
})
