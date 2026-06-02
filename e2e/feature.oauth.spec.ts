import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { selectors } from './selectors'
import { sleep } from './utils'

/**
 * OAuth entry-point coverage.
 *
 * Gitako's recommended way to obtain an access token is the OAuth flow
 * (getOAuthLink → github.com/login/oauth/authorize → setOAuth exchange via
 * gitako.enix.one). The affordance for it — the "Create with OAuth
 * (recommended)" link in Settings → Access Token — only renders when NO
 * token is configured (see AccessTokenSettings.tsx: gated on
 * `!hasAccessToken`). The signed-in persistent profile always carries a
 * token, so this entry point is invisible there; covering it requires a
 * deliberately token-LESS context.
 *
 * This spec therefore launches its OWN fresh, empty profile (not the shared
 * signed-in one) so the no-token branch renders, then asserts both the
 * OAuth link and the manual-token fallback are present. It needs no
 * secrets, no GitHub session, and no live OAuth server — it only checks
 * that the UI surface that kicks off OAuth still exists. A regression that
 * removes or breaks that entry point (the only non-manual way most users
 * authenticate) goes red here.
 *
 * The full round-trip (clicking through authorize + the server code
 * exchange) is exercised separately by the opt-in maint.oauth-bootstrap
 * spec, which depends on a real GitHub session and the prod OAuth server
 * and so is not part of the regular suite.
 */
test.describe('feature: OAuth entry point (token-less)', () => {
  let context: BrowserContext
  let profileDir: string

  test.beforeAll(async () => {
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitako-oauth-'))
    const extensionPath = path.resolve(__dirname, '..', 'dist')
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        `--no-sandbox`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    })
  })

  test.afterAll(async () => {
    await context?.close()
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true })
  })

  test('Settings shows "Create with OAuth" and a manual token fallback', async () => {
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto('https://github.com/EnixCoda/Gitako/tree/develop')
    await sleep(3000)

    // Open Gitako settings (float-mode: hover to reveal, then click).
    await page.locator('.gitako-toggle-show-button').hover()
    await sleep(400)
    await page.locator('.gitako-side-bar [aria-label="Settings"]').click()
    // Scope to the settings-bar title. A bare `.gitako-side-bar h2` is
    // ambiguous: in a token-less context an API failure (e.g. the runner's
    // anonymous rate-limit) makes Gitako also render an "Access Denied" <h2>,
    // and this spec must pass regardless of that — covering OAuth is the
    // whole point of being token-less.
    await expect(page.locator(selectors.gitako.settings.title)).toBeVisible({ timeout: 10000 })

    // The OAuth entry point: a link-button labelled "Create with OAuth".
    const oauthLink = page.locator('.gitako-side-bar a.link-button', {
      hasText: 'Create with OAuth',
    })
    await expect(oauthLink, 'OAuth entry point renders when no token is set').toBeVisible({
      timeout: 10000,
    })

    // The manual-token fallback must coexist (some users / enterprises
    // can't use OAuth and paste a PAT instead).
    await expect(
      page.locator('.gitako-side-bar .access-token-input'),
      'manual token input coexists with OAuth',
    ).toBeVisible()
  })
})
