import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { openSettings } from './sidebar'
import { sleep } from './utils'

/**
 * OAuth token bootstrap (maintenance, opt-in).
 *
 * Provisions the persistent profile's Gitako access token by driving the
 * REAL OAuth flow, so the profile can be set up without hand-creating a PAT
 * and pasting it in:
 *
 *   Settings → "Create with OAuth (recommended)"
 *     → github.com/login/oauth/authorize  (uses the profile's GitHub session)
 *     → redirect back with ?code
 *     → OAuthWrapper calls platform.setOAuth(code)
 *     → gitako.enix.one exchanges code+secret for an access token
 *     → token saved into chrome.storage
 *
 * This is NOT part of the regular suite. It is destructive (it clears any
 * existing token first) and depends on external state we don't control —
 * a live GitHub session in the profile, the bot having already authorized
 * the Gitako OAuth app (so authorize auto-redirects with no click), and the
 * prod gitako.enix.one OAuth server. Those make it a poor fit for nightly,
 * so it is double-gated: a persistent profile AND an explicit opt-in env
 * flag. Run it deliberately when (re)provisioning a profile:
 *
 *   GITAKO_OAUTH_BOOTSTRAP=1 npx playwright test maint.oauth-bootstrap --workers=1
 *
 * Validate against a throwaway COPY of the profile first if you don't want
 * to disturb a working token (see e2e/README.md).
 */
test.describe('maint: OAuth token bootstrap', () => {
  test.skip(
    !resolveProfilePath() || process.env.GITAKO_OAUTH_BOOTSTRAP !== '1',
    'opt-in only: needs a persistent profile (for the GitHub session) and GITAKO_OAUTH_BOOTSTRAP=1',
  )

  test('mints an access token via the OAuth flow', async ({ extensionPage }) => {
    test.setTimeout(120000)

    await extensionPage.goto('https://github.com/EnixCoda/Gitako/tree/develop')
    await sleep(2000)
    await openSettings(extensionPage)
    await expect(extensionPage.locator(selectors.gitako.accessDeniedHeader)).toHaveText(
      'Settings',
      {
        timeout: 10000,
      },
    )

    // 1. Clear any existing token so the OAuth entry point renders. Scope
    //    to the Access Token section's div (a SettingsSection Box whose
    //    direct child is its <h3> title) — the keyboard-shortcut sections
    //    have their own "Clear" buttons we must not grab.
    const tokenSection = extensionPage.locator(
      '.gitako-side-bar div:has(> h3:has-text("Access Token"))',
    )
    const clearButton = tokenSection.locator('button', { hasText: 'Clear' })
    if (await clearButton.count()) {
      await clearButton.first().click()
      // Confirm button counts down ~3s before it enables.
      const confirm = tokenSection.locator('button', { hasText: 'Confirm' })
      await expect(confirm).toBeEnabled({ timeout: 8000 })
      await confirm.click()
      await sleep(1000)
    }

    // 2. Kick off OAuth. This navigates the tab to GitHub's authorize page.
    const oauthLink = extensionPage.locator('.gitako-side-bar a.link-button', {
      hasText: 'Create with OAuth',
    })
    await expect(oauthLink, 'OAuth entry point present after clearing token').toBeVisible({
      timeout: 10000,
    })
    await Promise.all([
      extensionPage.waitForURL(/github\.com\/login\/oauth\/authorize/, { timeout: 20000 }),
      oauthLink.click(),
    ])

    // Precondition guard: the OAuth client_id is baked into the bundle at
    // BUILD time from GITHUB_OAUTH_CLIENT_ID (see src/env.ts → getOAuthLink).
    // A dist built without it sends client_id= (empty), which makes GitHub
    // serve a 404 instead of the authorize screen. Fail fast with guidance
    // rather than timing out on the redirect that never comes.
    const clientId = new URL(extensionPage.url()).searchParams.get('client_id')
    expect(
      clientId,
      'OAuth client_id is empty — rebuild dist with GITHUB_OAUTH_CLIENT_ID set (this bootstrap needs a production-style build + the prod OAuth server)',
    ).toBeTruthy()

    // 3. The authorize endpoint server-redirects a few times before settling,
    //    and github.com never reaches `networkidle` (live connections), so a
    //    one-shot probe races a mid-navigation blank frame. Poll the rendered
    //    text until it settles into a terminal state. Note GitHub can demand
    //    sudo ("Confirm access" / "Verify via email") EITHER before showing
    //    the grant page OR right after the Authorize click — so we re-settle
    //    after clicking.
    const authorizeButton = extensionPage.locator(
      'button[name="authorize"][value="1"], button:has-text("Authorize")',
    )
    async function settle(): Promise<'redirected' | 'sudo' | 'authorize' | 'unknown'> {
      for (let i = 0; i < 25; i++) {
        if (/github\.com\/EnixCoda\/Gitako/.test(extensionPage.url())) return 'redirected'
        const probe = await extensionPage
          .evaluate(() => {
            const t = document.body?.innerText || ''
            return {
              sudo: /Confirm access|Verify via email/i.test(t),
              authorize: /\bAuthorize\b/.test(t) && /wants to access|owned and operated/i.test(t),
            }
          })
          .catch(() => ({ sudo: false, authorize: false }))
        if (probe.sudo) return 'sudo'
        if (
          probe.authorize &&
          (await authorizeButton
            .first()
            .isVisible()
            .catch(() => false))
        )
          return 'authorize'
        await sleep(1000)
      }
      return 'unknown'
    }

    const skipSudo = () =>
      test.skip(
        true,
        'GitHub sudo-mode "Confirm access" gate hit — authorizing the OAuth app needs interactive re-auth (password/email code) we can\'t satisfy headlessly. Satisfy sudo in the profile once within the sudo window, then re-run. See e2e/README.md.',
      )

    let state = await settle()
    if (state === 'sudo') skipSudo()
    if (state === 'authorize') {
      // The Authorize button is disabled by a short countdown on first grant.
      await expect(authorizeButton.first()).toBeEnabled({ timeout: 10000 })
      await authorizeButton.first().click()
      // Clicking Authorize can itself trigger the sudo gate.
      state = await settle()
      if (state === 'sudo') skipSudo()
    }

    // 4. Land back on the repo page; OAuthWrapper exchanges ?code for a
    //    token. Wait for the redirect_uri origin to come back.
    await extensionPage.waitForURL(/github\.com\/EnixCoda\/Gitako/, { timeout: 30000 })
    await sleep(4000) // token exchange + chrome.storage write

    // 5. Re-open settings and assert the token was generated: the saved-token
    //    state shows AND the "Create with OAuth" entry point is gone.
    await openSettings(extensionPage)
    await expect(
      extensionPage.locator('.gitako-side-bar', { hasText: 'Your token has been saved' }),
      'token provisioned via OAuth',
    ).toBeVisible({ timeout: 15000 })
    await expect(
      extensionPage.locator('.gitako-side-bar a.link-button', { hasText: 'Create with OAuth' }),
      'OAuth entry point gone once a token exists',
    ).toHaveCount(0)
  })
})
