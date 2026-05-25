import { expect, type Page } from '@playwright/test'

/**
 * Lifecycle invariant helpers. Use these at every nav checkpoint so
 * the structural assumptions Gitako depends on (single root, attached
 * to live document, no orphan with stale state) are continuously
 * verified — they're the failure mode that has slipped past every
 * other bug-catching channel.
 */

type GitakoDomSnapshot = {
  rootCount: number
  sidebarMPCount: number
  logoMPCount: number
  sideBarCount: number
  rootConnected: boolean
  rootInBody: boolean
}

async function snapshot(page: Page): Promise<GitakoDomSnapshot> {
  return page.evaluate(() => {
    const root = document.querySelector('#gitako-root')
    return {
      rootCount: document.querySelectorAll('#gitako-root').length,
      sidebarMPCount: document.querySelectorAll('#gitako-sidebar-mount-point').length,
      logoMPCount: document.querySelectorAll('#gitako-logo-mount-point').length,
      sideBarCount: document.querySelectorAll('.gitako-side-bar').length,
      rootConnected: root?.isConnected ?? false,
      rootInBody: !!document.body.querySelector('#gitako-root'),
    }
  })
}

/**
 * Structural invariants that should hold whenever the content script has
 * run, regardless of whether the SideBar is currently rendered.
 */
async function assertStructuralInvariants(page: Page, label: string) {
  const s = await snapshot(page)
  expect(s.rootCount, `[${label}] #gitako-root count`).toBe(1)
  expect(s.sidebarMPCount, `[${label}] sidebar-mount-point count`).toBe(1)
  // logo mount point is created lazily (only on settings open) — no assertion
  expect(s.rootConnected, `[${label}] #gitako-root.isConnected`).toBe(true)
  expect(s.rootInBody, `[${label}] #gitako-root under document.body`).toBe(true)
}

/**
 * Use on pages where Gitako should be VISIBLE — i.e. the SideBar React
 * component is rendered. Distinct from structural presence: content.tsx
 * always inserts the mount-point divs into every github.com page,
 * RepoContextWrapper conditionally renders SideBar based on whether the
 * page is a recognised repo page.
 */
export async function assertGitakoMounted(page: Page, label: string) {
  await assertStructuralInvariants(page, label)
  const s = await snapshot(page)
  expect(s.sideBarCount, `[${label}] .gitako-side-bar rendered`).toBeGreaterThanOrEqual(1)
}

/**
 * Use on pages where Gitako should NOT be visible. Asserts the SideBar
 * isn't rendered; intentionally does NOT assert the structural mount
 * points are absent because the content script inserts them everywhere.
 */
export async function assertGitakoAbsent(page: Page, label: string) {
  const s = await snapshot(page)
  expect(s.sideBarCount, `[${label}] .gitako-side-bar not rendered`).toBe(0)
}

/**
 * Stamp a JS reference to the current #gitako-root onto window so
 * later assertions can verify the same DOM object survives Turbo
 * body-swaps. Stamps via __gitakoRootStamp.
 */
export async function stampRootIdentity(page: Page) {
  await page.evaluate(() => {
    const r = document.querySelector('#gitako-root')
    if (r) (window as unknown as { __gitakoRootStamp: Element }).__gitakoRootStamp = r
  })
}

/**
 * Verify the stamped root reference still equals the live root and
 * is still connected. Catches the bug class where Turbo swaps body,
 * a fresh #gitako-root is created in the new body, and the original
 * (the one any React/styled-components reference was bound to) is
 * left orphaned.
 */
export async function assertRootIdentityPreserved(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const w = window as unknown as { __gitakoRootStamp?: Element }
    const stamped = w.__gitakoRootStamp
    const live = document.querySelector('#gitako-root')
    return {
      stampedExists: !!stamped,
      stampedConnected: stamped?.isConnected ?? false,
      sameAsLive: stamped === live,
      liveExists: !!live,
    }
  })
  expect(result.stampedExists, `[${label}] root was stamped`).toBe(true)
  expect(result.stampedConnected, `[${label}] stamped root still connected`).toBe(true)
  expect(result.sameAsLive, `[${label}] stamped is same as live #gitako-root`).toBe(true)
}

/**
 * Negative invariant: if a #gitako-root was stamped earlier, it must
 * still be the only one and must still be live. Catches the orphan
 * failure mode (e.g., the styled-components target left detached
 * after Turbo body swap).
 */
export async function assertNoOrphanRoot(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const w = window as unknown as { __gitakoRootStamp?: Element }
    const stamped = w.__gitakoRootStamp
    const live = document.querySelector('#gitako-root')
    return {
      stampedConnected: stamped == null ? null : stamped.isConnected,
      sameAsLive: stamped == null ? null : stamped === live,
      liveCount: document.querySelectorAll('#gitako-root').length,
    }
  })
  expect(result.liveCount, `[${label}] live #gitako-root count`).toBeLessThanOrEqual(1)
  if (result.stampedConnected !== null) {
    expect(result.stampedConnected, `[${label}] stamped root not orphan`).toBe(true)
    expect(result.sameAsLive, `[${label}] stamped is the live root`).toBe(true)
  }
}
