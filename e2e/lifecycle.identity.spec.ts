import { expect, expectNoGitakoPageErrors, test } from './fixtures'
import {
  assertGitakoMounted,
  assertNoOrphanRoot,
  assertRootIdentityPreserved,
  stampRootIdentity,
} from './lifecycle'
import { testURL } from './testURL'

/**
 * Locks in the bug class we just fixed: Turbo replaces <body> on
 * cross-page navigation; our cached gitako-root must (a) survive as
 * the same JS object and (b) be re-attached to the live document by
 * MountPointWatcher. Catches both the original "Gitako disappears"
 * regression and the latent styled-components-orphan subclass.
 *
 * Navigation is driven through Turbo.visit explicitly rather than UI
 * clicks. GitHub's nav-tab clicks on anonymous pages can fall back to
 * a hard reload (resetting `window`), which would invalidate the
 * stamped reference for reasons unrelated to the invariant being
 * tested. Programmatic Turbo.visit forces the Turbo path on both
 * auth modes so the test exercises the same lifecycle uniformly.
 */

async function turboVisit(page: import('@playwright/test').Page, url: string) {
  await page.waitForFunction(
    () => typeof (window as { Turbo?: unknown }).Turbo !== 'undefined',
    undefined,
    { timeout: 10000 },
  )
  await page.evaluate(target => {
    ;(window as { Turbo: { visit: (u: string) => void } }).Turbo.visit(target)
  }, url)
}

test.describe('lifecycle: root identity', () => {
  test('#gitako-root JS identity survives Turbo body-swap sequence', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
    await expect(extensionPage.locator('.gitako-toggle-show-button')).toBeVisible({
      timeout: 10000,
    })
    await stampRootIdentity(extensionPage)
    await assertGitakoMounted(extensionPage, 'initial overview')

    // overview -> /tree/v3 via Turbo
    await turboVisit(extensionPage, '/EnixCoda/Gitako/tree/v3')
    await extensionPage.waitForURL('**/tree/v3', { timeout: 10000 })
    await assertGitakoMounted(extensionPage, 'after Turbo to tree/v3')
    await assertRootIdentityPreserved(extensionPage, 'after Turbo to tree/v3')
    await assertNoOrphanRoot(extensionPage, 'after Turbo to tree/v3')

    // tree/v3 -> /issues (Gitako should not be VISIBLE here, but the
    // root element and our JS reference must still be the same)
    await turboVisit(extensionPage, '/EnixCoda/Gitako/issues')
    await extensionPage.waitForURL('**/issues', { timeout: 10000 })
    await assertRootIdentityPreserved(extensionPage, 'after Turbo to issues')
    await assertNoOrphanRoot(extensionPage, 'after Turbo to issues')

    // /issues -> /tree/v3 (Turbo nav, not goBack — goBack on the cached
    // /issues snapshot can collapse back into a hard reload on some auth
    // states; Turbo.visit keeps the path uniform)
    await turboVisit(extensionPage, '/EnixCoda/Gitako/tree/v3')
    await extensionPage.waitForURL('**/tree/v3', { timeout: 10000 })
    await assertGitakoMounted(extensionPage, 'back to tree/v3')
    await assertRootIdentityPreserved(extensionPage, 'back to tree/v3')
    await assertNoOrphanRoot(extensionPage, 'back to tree/v3')

    // back to overview
    await turboVisit(extensionPage, '/EnixCoda/Gitako')
    await extensionPage.waitForURL(/\/EnixCoda\/Gitako$/, { timeout: 10000 })
    await assertGitakoMounted(extensionPage, 'back to overview')
    await assertRootIdentityPreserved(extensionPage, 'back to overview')
    await assertNoOrphanRoot(extensionPage, 'back to overview')

    // No uncaught exceptions from extension code during the whole sequence.
    expectNoGitakoPageErrors(extensionPage)
  })
})
