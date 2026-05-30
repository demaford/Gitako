// @ts-check
/**
 * Interactive OAuth token bootstrap (core script, lives in the gitako repo).
 *
 * Provisions the persistent profile's Gitako access token by driving the REAL
 * OAuth flow in a HEADED browser, so a human can satisfy GitHub's one-time
 * sudo gate ("Confirm access" / "Verify via email") that blocks the headless
 * `maint.oauth-bootstrap` spec.
 *
 *   Settings → "Create with OAuth (recommended)"
 *     → github.com/login/oauth/authorize  (profile's GitHub session)
 *     → [you complete sudo + Authorize here, once]
 *     → redirect back with ?code
 *     → OAuthWrapper exchanges code+secret via gitako.enix.one
 *     → token saved into the profile's chrome.storage
 *
 * Run it deliberately when (re)provisioning a profile:
 *
 *   node e2e/scripts/oauth-bootstrap.mjs
 *
 * It is DESTRUCTIVE: it clears any existing token first (OAuthWrapper only
 * exchanges `?code` when no token is present). Validate against a throwaway
 * COPY of the profile first if you don't want to disturb a working token
 * (point PLAYWRIGHT_PROFILE at the copy). See e2e/README.md.
 *
 * Build dependency: the OAuth client_id is baked into dist at BUILD time from
 * GITHUB_OAUTH_CLIENT_ID (src/env.ts → getOAuthLink). A dist built without it
 * sends client_id= (empty) and GitHub serves a 404. This script loads the
 * repo-root .env and asserts client_id is present in the authorize URL.
 */
import { chromium } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

dotenv.config({ path: path.join(repoRoot, '.env') })

const sleep = ms => new Promise(r => setTimeout(r, ms))

function resolveProfilePath() {
  if (process.env.PLAYWRIGHT_PROFILE) return process.env.PLAYWRIGHT_PROFILE
  const checkedIn = path.join(repoRoot, 'e2e', '.profile')
  if (fs.existsSync(checkedIn)) return checkedIn
  return ''
}

async function revealAndOpenSettings(page) {
  await page.locator('.gitako-toggle-show-button').hover()
  await sleep(300)
  if (await page.locator('.gitako-side-bar-body-wrapper.collapsed').count()) {
    await page.locator('.gitako-toggle-show-button').click({ force: true })
    await sleep(400)
  }
  await page.locator('.gitako-side-bar [aria-label="Settings"]').click()
  await sleep(600)
}

async function main() {
  const profilePath = resolveProfilePath()
  if (!profilePath) {
    console.error(
      'No profile found. Set PLAYWRIGHT_PROFILE or create e2e/.profile (the signed-in bot profile).',
    )
    process.exit(1)
  }

  console.log(`Launching headed Chromium against profile: ${profilePath}`)
  const extensionPath = path.join(repoRoot, 'dist')
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
    console.error(`No built extension at ${extensionPath}. Run \`yarn build\` first.`)
    process.exit(1)
  }

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: [
      '--no-sandbox',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })

  const page = context.pages()[0] ?? (await context.newPage())

  try {
    await page.goto('https://github.com/EnixCoda/Gitako/tree/develop')
    await sleep(2000)
    await revealAndOpenSettings(page)

    // 1. Clear any existing token so the OAuth entry point renders. Scope to
    //    the Access Token section so we don't grab a shortcut "Clear".
    const tokenSection = page.locator('.gitako-side-bar div:has(> h3:has-text("Access Token"))')
    const clearButton = tokenSection.locator('button', { hasText: 'Clear' })
    if (await clearButton.count()) {
      console.log('Clearing existing token…')
      await clearButton.first().click()
      const confirm = tokenSection.locator('button', { hasText: 'Confirm' })
      await confirm.waitFor({ state: 'visible', timeout: 8000 })
      // Confirm counts down ~3s before it enables.
      for (let i = 0; i < 20 && (await confirm.isDisabled().catch(() => true)); i++) await sleep(500)
      await confirm.click()
      await sleep(1000)
    }

    // 2. Kick off OAuth — navigates the tab to GitHub's authorize page.
    const oauthLink = page.locator('.gitako-side-bar a.link-button', {
      hasText: 'Create with OAuth',
    })
    await oauthLink.waitFor({ state: 'visible', timeout: 10000 })
    console.log('Starting OAuth flow…')
    await Promise.all([
      page.waitForURL(/github\.com\/login\/oauth\/authorize/, { timeout: 20000 }),
      oauthLink.click(),
    ])

    const clientId = new URL(page.url()).searchParams.get('client_id')
    if (!clientId) {
      console.error(
        'OAuth client_id is empty — rebuild dist with GITHUB_OAUTH_CLIENT_ID set (yarn build with .env).',
      )
      await context.close()
      process.exit(1)
    }

    console.log('\n' + '='.repeat(70))
    console.log('  Browser is open on the GitHub authorize page.')
    console.log('  Complete any "Confirm access" / "Verify via email" sudo gate')
    console.log('  and click "Authorize" if prompted. You only need to do this once.')
    console.log('  This script will detect the minted token automatically.')
    console.log('='.repeat(70) + '\n')

    // 3. Wait (up to 5 min) for the redirect back to the repo, which means
    //    GitHub granted and OAuthWrapper is exchanging ?code for a token.
    await page.waitForURL(/github\.com\/EnixCoda\/Gitako/, { timeout: 300000 })
    console.log('Redirected back — exchanging code for token…')
    await sleep(5000) // token exchange + chrome.storage write

    // 4. Re-open settings and confirm the token landed: saved-token state
    //    shows AND the OAuth entry point is gone. In float mode the outer
    //    `.gitako-side-bar` is hover-hidden, so don't assert it visible —
    //    poll its text content (which is present whether or not the float
    //    container is currently revealed) and the OAuth link count.
    await revealAndOpenSettings(page)
    let saved = false
    let oauthGone = false
    for (let i = 0; i < 15; i++) {
      const text = await page.locator('.gitako-side-bar').innerText().catch(() => '')
      saved = /Your token has been saved/.test(text)
      oauthGone =
        (await page
          .locator('.gitako-side-bar a.link-button', { hasText: 'Create with OAuth' })
          .count()) === 0
      if (saved) break
      await sleep(1000)
    }

    if (saved && oauthGone) {
      console.log('\n✅ Token minted via OAuth and saved into the profile. Done.')
    } else if (saved) {
      console.log('\n⚠️  Token saved but the OAuth entry point is still showing — verify manually.')
    } else {
      console.log('\n❌ Could not confirm "Your token has been saved" in Settings — verify manually.')
      process.exitCode = 1
    }
  } catch (err) {
    console.error('\n❌ OAuth bootstrap failed:', err?.message || err)
    process.exitCode = 1
  } finally {
    await sleep(1500)
    await context.close()
  }
}

main()
