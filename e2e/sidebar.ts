import type { Page } from '@playwright/test'
import { selectors } from './selectors'
import { sleep } from './utils'

/**
 * Common sidebar interaction helpers used by multiple specs. Centralised
 * here so the "open settings / reveal body / find input by label" plumbing
 * lives in one place — when GitHub or Gitako restructures the UI, only
 * this module needs updating.
 */

/**
 * Reveal the sidebar body wrapper, whether the sidebar is in float
 * (hover-to-show) or persistent+collapsed (click-to-show) mode. After
 * this returns, controls inside the body wrapper are reachable.
 */
export async function revealSidebarBody(page: Page) {
  await page.locator(selectors.gitako.toggleButton).hover()
  await sleep(200)
  if (await page.locator(selectors.gitako.collapsedBodyWrapper).count()) {
    await page.locator(selectors.gitako.toggleButton).click({ force: true })
    await sleep(400)
  }
}

/**
 * Reveal the body, then click the Settings button in the footer.
 */
export async function openSettings(page: Page) {
  await revealSidebarBody(page)
  await page.locator(selectors.gitako.settings.openButton).click()
  await sleep(600)
}

export async function closeSettings(page: Page) {
  await page
    .locator(selectors.gitako.settings.closeButton)
    .click({ timeout: 5000 })
    .catch(() => {})
  await sleep(300)
}

/**
 * Find the input/control bound to a visually-hidden settings label.
 * The labels carry the `for` attribute pointing at a React-Aria-
 * generated id (a Math.random() string). Returns the bare id string,
 * suitable for use in an `[id="..."]` attribute selector (don't use a
 * `#${id}` selector — the dot in the id parses as a class).
 */
export async function findSettingsControlIdByLabel(page: Page, labelText: string) {
  return page.evaluate(text => {
    const label = Array.from(document.querySelectorAll('label')).find(l =>
      l.textContent?.includes(text),
    )
    return label?.getAttribute('for') ?? null
  }, labelText)
}
