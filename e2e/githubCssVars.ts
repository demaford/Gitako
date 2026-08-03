import { expect, type Page } from '@playwright/test'

export async function collectGitHubCssVars(page: Page): Promise<string[]> {
  return page.evaluate(() => {
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
        if (!(rule instanceof CSSStyleRule)) continue
        if (!/^(:root|html)\b/.test(rule.selectorText)) continue
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style.item(i)
          if (prop.startsWith('--')) collected.add(prop)
        }
      }
    }
    return Array.from(collected).sort()
  })
}

export async function waitForStableGitHubCssVars(
  page: Page,
  minimumCount: number,
): Promise<string[]> {
  let previous = ''
  let stableSamples = 0
  let latest: string[] = []

  await expect
    .poll(
      async () => {
        latest = await collectGitHubCssVars(page)
        const serialized = JSON.stringify(latest)
        stableSamples = serialized === previous ? stableSamples + 1 : 0
        previous = serialized
        return latest.length >= minimumCount && stableSamples >= 2
      },
      {
        message: `GitHub CSS variable set did not stabilize above ${minimumCount} keys`,
        timeout: 15000,
        intervals: [250, 500, 750],
      },
    )
    .toBe(true)

  return latest
}
