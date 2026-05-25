import { expect, test } from './fixtures'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Gitako reads `data-color-mode` from the document once at mount and
 * passes it to @primer/react's ThemeProvider. Per the project owner:
 * theme tracking is mount-time only — there's no live recomputation
 * on theme change after mount.
 *
 * GitHub respects `data-color-mode="auto"` (the default) by deferring
 * to the OS preference via `prefers-color-scheme`. Playwright's
 * `emulateMedia` controls that, giving us a deterministic way to
 * exercise both branches of the theme code path.
 *
 * We don't pin to specific colors (those couple to Primer's palette
 * and break on refactor). Instead we assert that the computed text
 * color of the same Gitako element actually differs between the two
 * modes — that's the contract that matters: theme tracking does
 * something measurable at mount.
 */

async function captureGitakoThemeSignature(
  extensionPage: import('@playwright/test').Page,
  scheme: 'light' | 'dark',
) {
  await extensionPage.emulateMedia({ colorScheme: scheme })
  await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop`)
  await sleep(2500)
  return extensionPage.evaluate(() => {
    const sb = document.querySelector('.gitako-side-bar')
    if (!sb) return null
    // Sample a few descendants that ThemeProvider's CSS variables touch.
    // Take the first one with a non-transparent background — that's a
    // surface element whose colors come from the theme.
    const themed = Array.from(sb.querySelectorAll('*'))
      .map(e => getComputedStyle(e))
      .find(s => s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)')
    return {
      sidebarColor: getComputedStyle(sb).color,
      surfaceBg: themed?.backgroundColor ?? null,
      surfaceColor: themed?.color ?? null,
    }
  })
}

test.describe('theme: on-mount tracking', () => {
  test('Gitako renders differently in dark vs light system theme', async ({ extensionPage }) => {
    const light = await captureGitakoThemeSignature(extensionPage, 'light')
    const dark = await captureGitakoThemeSignature(extensionPage, 'dark')

    expect(light, 'light mount captured').not.toBeNull()
    expect(dark, 'dark mount captured').not.toBeNull()
    expect(light!.surfaceBg, 'light has a themed surface').not.toBeNull()
    expect(dark!.surfaceBg, 'dark has a themed surface').not.toBeNull()

    // The real assertion: at least one of the captured properties must
    // differ between the two themes. Asserts theme tracking is wired,
    // without coupling to specific RGB values.
    const anyDiff =
      light!.sidebarColor !== dark!.sidebarColor ||
      light!.surfaceBg !== dark!.surfaceBg ||
      light!.surfaceColor !== dark!.surfaceColor
    expect(
      anyDiff,
      `theme tracking produced no observable difference: light=${JSON.stringify(light)} dark=${JSON.stringify(dark)}`,
    ).toBe(true)
  })
})
