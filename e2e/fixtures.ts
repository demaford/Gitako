import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test'
import * as fs from 'fs'
import path from 'path'

const EXTENSION_PATH = path.resolve(__dirname, '..', 'dist')
const DEFAULT_PROFILE_PATH = path.resolve(__dirname, '.profile')

export function resolveProfilePath() {
  if (process.env.PLAYWRIGHT_PROFILE) return process.env.PLAYWRIGHT_PROFILE
  if (fs.existsSync(DEFAULT_PROFILE_PATH)) return DEFAULT_PROFILE_PATH
  return ''
}

export type PageError = { message: string; stack?: string }

// Per-page error buffer, attached to the Page instance via a symbol so
// tests can opt in to strict checking without making the fixture always
// fail (existing tests aren't audited for pre-existing console noise).
const errorBufferKey = Symbol('gitakoPageErrors')

function attachErrorBuffer(page: Page): PageError[] {
  const buf: PageError[] = []
  ;(page as unknown as Record<symbol, PageError[]>)[errorBufferKey] = buf
  page.on('pageerror', err => buf.push({ message: err.message, stack: err.stack }))
  return buf
}

export function getPageErrors(page: Page): PageError[] {
  return (page as unknown as Record<symbol, PageError[]>)[errorBufferKey] ?? []
}

/**
 * Opt-in strict check: fail the test if any uncaught exception was thrown
 * during the test that traces back to the extension (or to Gitako-named
 * code in the bundle). Uses pageerror only, not console.error — there's
 * no reliable way to filter GitHub's own console noise.
 */
export function expectNoGitakoPageErrors(page: Page) {
  const errors = getPageErrors(page).filter(
    e =>
      /chrome-extension:\/\//.test(e.stack ?? '') ||
      /gitako/i.test(e.stack ?? '') ||
      /gitako/i.test(e.message),
  )
  if (errors.length > 0) {
    const detail = errors.map(e => `- ${e.message}\n${e.stack ?? ''}`).join('\n')
    throw new Error(`Gitako page errors:\n${detail}`)
  }
}

async function createContext(): Promise<BrowserContext> {
  // Persistent contexts don't honor playwright.config's `video` option —
  // we have to set recordVideo on the launch directly. GITAKO_VIDEO=1
  // turns on always-record; otherwise no video (matches config's
  // 'on-first-retry' default, since persistent-context tests don't retry).
  const recordVideo =
    process.env.GITAKO_VIDEO === '1'
      ? { dir: path.resolve(__dirname, '..', 'test-results', 'videos') }
      : undefined
  return chromium.launchPersistentContext(resolveProfilePath(), {
    headless: false,
    args: [
      `--no-sandbox`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
    recordVideo,
  })
}

export const test = base.extend<{
  context: BrowserContext
  extensionPage: Page
  freshContext: () => Promise<{ context: BrowserContext; page: Page }>
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await createContext()
    await use(context)
    await context.close()
  },
  extensionPage: async ({ context }, use) => {
    const page = await context.newPage()
    attachErrorBuffer(page)
    await use(page)
  },
  // For state-persistence tests: close the shared context and open a new
  // persistent context against the same profile. Caller is responsible
  // for closing the new context.
  // eslint-disable-next-line no-empty-pattern
  freshContext: async ({}, use) => {
    const opened: BrowserContext[] = []
    await use(async () => {
      const context = await createContext()
      const page = await context.newPage()
      attachErrorBuffer(page)
      opened.push(context)
      return { context, page }
    })
    for (const c of opened) await c.close()
  },
})

export const expect = test.expect
