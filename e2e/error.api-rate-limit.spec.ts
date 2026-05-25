import { expect, test } from './fixtures'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * Gitako fetches the repository tree from GitHub's REST API on every
 * supported page. When the API returns 403 with a rate-limit body,
 * `useHandleNetworkError` (src/utils/hooks/useHandleNetworkError.ts)
 * dispatches the `error-due-to-auth` state and the sidebar swaps in
 * <AccessDeniedDescription/> — a clearly visible "Access Denied"
 * header asking the user to set up a token.
 *
 * Failure mode is silent: a regression that breaks the error-state
 * transition or hides the panel would leave users staring at an
 * empty sidebar with no signal about what went wrong. Sentry catches
 * nothing because no exception escapes; the error handler swallowed it.
 *
 * Intercepts api.github.com tree requests via Playwright route, returns
 * a realistic rate-limit response, and asserts the "Access Denied"
 * header renders.
 */

test.describe('error UI: API rate-limit shows Access Denied', () => {
  test('403 from tree API → AccessDeniedDescription renders', async ({
    extensionPage,
    context,
  }) => {
    // Intercept calls Gitako makes to the GitHub REST API for tree data.
    // The exact path looks like `/repos/{owner}/{repo}/git/trees/...`.
    await context.route('https://api.github.com/repos/**', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
        },
        body: JSON.stringify({
          message:
            "API rate limit exceeded for 0.0.0.0. (But here's the good news: " +
            'Authenticated requests get a higher rate limit. ' +
            'Check out the documentation for more details.)',
          documentation_url:
            'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
        }),
      })
    })

    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako/tree/develop`)
    // Give Gitako time to attempt the API call, hit 403, dispatch error
    // state, and re-render. We don't poll the API directly — we observe
    // the rendered UI.
    await sleep(4000)

    // The Access Denied content lives inside the sidebar body. In float
    // mode the body is hidden until hover; in persistent + collapsed it
    // has display:none. Reveal it before asserting visibility so we're
    // testing what a user actually sees once they engage with the bar.
    await extensionPage.locator('.gitako-toggle-show-button').hover()
    await sleep(200)
    if (await extensionPage.locator('.gitako-side-bar-body-wrapper.collapsed').count()) {
      await extensionPage.locator('.gitako-toggle-show-button').click({ force: true })
      await sleep(400)
    }

    // The AccessDeniedDescription panel has a fixed `<h2>Access Denied</h2>`.
    await expect(
      extensionPage.locator('.gitako-side-bar h2', { hasText: 'Access Denied' }),
    ).toBeVisible({ timeout: 5000 })
  })
})
