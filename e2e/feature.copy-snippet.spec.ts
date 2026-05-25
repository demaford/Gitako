import { expect, test } from './fixtures'
import { testURL } from './testURL'
import { sleep } from './utils'

/**
 * The copy-snippet feature attaches a Clippy button next to `<pre>` blocks
 * in the readme on hover. The DOM-selector that gates it (in
 * src/platforms/GitHub/DOMHelper.ts:attachCopySnippet) silently no-op'd
 * when GitHub stopped wrapping the readme in `main div#readme` —
 * 10k users saw the button quietly disappear with no exception fired and
 * no error reaching Sentry.
 *
 * This spec exercises the full feature: enable the setting via Gitako's
 * Settings UI, hover a `<pre>` in the readme, assert a Clippy appears.
 * Restores the setting at the end so the persistent profile is not
 * polluted.
 *
 * Defaults to disabled on github.com (`copySnippetButton: !isInGitHub`
 * in src/utils/config/helper.ts) — the suite must turn it on, exercise
 * it, then turn it off.
 */

const copySnippetCheckboxLabel = 'Copy snippet button'

async function findCheckboxByLabel(extensionPage: import('@playwright/test').Page, label: string) {
  return extensionPage.evaluate(text => {
    const labels = Array.from(document.querySelectorAll('label'))
    for (const l of labels) {
      if (l.textContent?.includes(text)) {
        const forId = l.getAttribute('for')
        if (forId) return forId
      }
    }
    return null
  }, label)
}

async function openSettings(extensionPage: import('@playwright/test').Page) {
  // Reveal the body wrapper first (Settings button lives inside it; in
  // float mode + collapsed it's not reachable).
  await extensionPage.locator('.gitako-toggle-show-button').hover()
  await sleep(200)
  if (await extensionPage.locator('.gitako-side-bar-body-wrapper.collapsed').count()) {
    await extensionPage.locator('.gitako-toggle-show-button').click({ force: true })
    await sleep(400)
  }
  await extensionPage.locator('[aria-label="Settings"]').click()
  await sleep(500)
}

async function setCopySnippet(extensionPage: import('@playwright/test').Page, on: boolean) {
  await openSettings(extensionPage)
  const id = await findCheckboxByLabel(extensionPage, copySnippetCheckboxLabel)
  if (!id) throw new Error('Could not find "Copy snippet button" checkbox')
  const checkbox = extensionPage.locator(`#${id}`)
  const isChecked = await checkbox.isChecked()
  if (isChecked !== on) {
    await checkbox.click({ force: true })
    await sleep(500)
  }
  // close settings
  await extensionPage
    .locator('[aria-label="Close settings"]')
    .click({ timeout: 5000 })
    .catch(() => {})
  await sleep(300)
}

test.describe('feature: copy-snippet button on readme code blocks', () => {
  test.skip(
    !process.env.GITAKO_ACCESS_TOKEN,
    'GITAKO_ACCESS_TOKEN not set; Gitako sidebar (and its Settings UI) is gated on access-denied, so we cannot toggle the feature',
  )

  test('hovering a <pre> in the readme attaches a Clippy', async ({ extensionPage }) => {
    await extensionPage.goto(testURL`https://github.com/EnixCoda/Gitako`)
    await sleep(2000)

    try {
      await setCopySnippet(extensionPage, true)

      // Reload so attachCopySnippet runs fresh against the updated config.
      // (The setting flips a React effect dep; it should re-attach without
      // reload too, but a reload is the most uniform path.)
      await extensionPage.reload()
      await sleep(2500)

      // Hover the first <pre> in the readme; Clippy is inserted as a
      // previousSibling of the <pre>.
      const pre = extensionPage
        .locator('article.markdown-body pre, main div#readme article pre')
        .first()
      await pre.waitFor({ timeout: 10000 })
      await pre.hover()
      await sleep(700)

      const clippyCount = await extensionPage
        .locator('article.markdown-body .clippy-wrapper, main div#readme article .clippy-wrapper')
        .count()
      expect(clippyCount, 'Clippy attached to a readme pre on hover').toBeGreaterThanOrEqual(1)
    } finally {
      try {
        await setCopySnippet(extensionPage, false)
      } catch {
        /* best-effort restore */
      }
    }
  })
})
