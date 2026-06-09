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

const VIDEO_DIR = path.resolve(__dirname, '..', 'test-results', 'videos')

// When to record. Persistent contexts don't honor playwright.config's `video`
// option (we set recordVideo on the launch directly), so we reproduce the two
// useful modes here:
//   - GITAKO_VIDEO=1            → record EVERY test (manual debugging / demos)
//   - testInfo.retry > 0        → record only RETRY attempts, i.e. the
//                                 'on-first-retry' equivalent. The nightly runs
//                                 with retries, so a flaky or failing test gets
//                                 its retry recorded while the ~160 first-try
//                                 passes record nothing.
function shouldRecordVideo(testInfo: { retry: number }): boolean {
  return process.env.GITAKO_VIDEO === '1' || testInfo.retry > 0
}

async function createContext(record: boolean): Promise<BrowserContext> {
  const recordVideo = record ? { dir: VIDEO_DIR } : undefined
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

function videoFilename(testTitle: string, testPath: string, retry: number, index: number): string {
  const safe = (s: string) =>
    s
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
  const spec = safe(path.basename(testPath, path.extname(testPath)))
  const title = safe(testTitle) || 'untitled'
  // retry suffix disambiguates a flaky test's successive attempts (and flags
  // that this video is from a retry, not a clean first run).
  return `${spec}__${title}${retry > 0 ? `__retry${retry}` : ''}${
    index > 0 ? `__page${index}` : ''
  }.webm`
}

// Capture video file paths BEFORE the context closes (saveAs/path
// need a live page). The actual file isn't flushed to disk until
// context.close() — `flushAndRenameVideos` does the rename after.
function captureVideoPaths(pages: Page[], record: boolean): Promise<string | null>[] {
  if (!record) return []
  return pages.map(p => {
    const v = p.video()
    return v ? v.path().catch(() => null) : Promise.resolve(null)
  })
}

async function flushAndRenameVideos(
  paths: Promise<string | null>[],
  testInfo: { title: string; file: string; retry: number },
) {
  if (paths.length === 0) return
  const resolved = await Promise.all(paths)
  let i = 0
  for (const src of resolved) {
    if (!src) continue
    try {
      const dest = path.join(
        VIDEO_DIR,
        videoFilename(testInfo.title, testInfo.file, testInfo.retry, i++),
      )
      await fs.promises.rename(src, dest)
    } catch (e) {
      console.warn(`[video] rename failed for "${testInfo.title}":`, (e as Error).message)
    }
  }
}

export const test = base.extend<{
  context: BrowserContext
  extensionPage: Page
  freshContext: () => Promise<{ context: BrowserContext; page: Page }>
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use, testInfo) => {
    const record = shouldRecordVideo(testInfo)
    const context = await createContext(record)
    await use(context)
    const videoPaths = captureVideoPaths(context.pages(), record)
    await context.close()
    await flushAndRenameVideos(videoPaths, testInfo)
  },
  extensionPage: async ({ context }, use) => {
    // Persistent context already opens one about:blank page on launch.
    // Reuse it instead of context.newPage() — otherwise the original
    // sits unused and produces a white-frame video file alongside the
    // real one.
    const page = context.pages()[0] ?? (await context.newPage())
    attachErrorBuffer(page)
    await use(page)
  },
  // For state-persistence tests: close the shared context and open a new
  // persistent context against the same profile. Caller is responsible
  // for closing the new context.
  // eslint-disable-next-line no-empty-pattern
  freshContext: async ({}, use, testInfo) => {
    const record = shouldRecordVideo(testInfo)
    const opened: BrowserContext[] = []
    await use(async () => {
      const context = await createContext(record)
      const page = context.pages()[0] ?? (await context.newPage())
      attachErrorBuffer(page)
      opened.push(context)
      return { context, page }
    })
    for (const c of opened) {
      const videoPaths = captureVideoPaths(c.pages(), record)
      await c.close()
      await flushAndRenameVideos(videoPaths, testInfo)
    }
  },
})

export const expect = test.expect
