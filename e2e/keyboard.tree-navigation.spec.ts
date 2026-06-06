import { Page } from '@playwright/test'
import { expect, resolveProfilePath, test } from './fixtures'
import { selectors } from './selectors'
import { sleep } from './utils'

// Gitako's file tree is keyboard-navigable: with `.file-explorer` focused,
// ArrowUp/Down move the highlight and Enter opens the focused file. The bug this
// guards is keyboard CONTINUITY across opening a file — focus must stay in the
// tree so the user can keep arrowing. It silently died after one file because
// the destination auto-collapsed the pinned bar, and collapsing runs
// document.body.focus().
//
// This is a matrix: MODE × SOURCE-PAGE × METHOD.
//   - mode:   persistent | float                 (sidebarToggleMode)
//   - source: the page the open starts FROM. The destination is always
//             "open a file from the tree", which navigates to a /blob/ page.
//   - method: keyboard (Enter) | mouse (click). Mouse is the negative control —
//             it must NOT inherit keyboard focus-retention (the keyboard-nav flag
//             is cleared on mousedown).
//
// The `issue` source is the same-shape but harder case: an issue page renders the
// default-branch repo tree, and opening a file there is a CROSS-CONTEXT
// navigation (the committed repo meta changes), which makes RepoContextWrapper
// flash its `disabled` state and remount the whole sidebar. The fix keeps the
// keyboard-nav intent alive across that remount (keyboardNavRef is a module
// singleton, and SideBar re-seeds expand/focus from it on mount), so the same
// focus-retention assertions apply unchanged.
//
// The PR *diff* tree (a pull request's changed-files list) is a different shape —
// opening a leaf is a same-page hash scroll to the diff, not a navigation — so it
// has its own describe block below rather than a matrix cell.
//
// Assertions:
//   - keyboard ⇒ focus STAYS in `.file-explorer`; persistent ⇒ bar stays
//     expanded; one more ArrowDown still moves the highlight (continuity).
//   - mouse ⇒ in persistent + native tree the bar auto-collapses and focus is
//     released (document.body.focus()), exactly as before the fix. In float (no
//     collapse) nothing dispatches focus away, so the only invariant is that the
//     open navigated — a smoke check, not a focus-release claim.
//
// Preview / native-tree factor: whether GitHub renders its own file tree (the
// auto-collapse trigger) is detected at RUNTIME and asserted accordingly —
// matching the convention in feature.auto-collapse-hint and the feature-preview
// drift tracker (no account mutation here). The nightly run flips GitHub's
// Feature Preview externally and re-runs; these specs read whatever is live.
//
// Signed-in only: Gitako needs the profile token to fetch the tree and GitHub
// only renders its native tree when signed in. Config is forced via the
// URL-config channel, which also disables persistence so the shared profile
// isn't polluted.

type Mode = 'persistent' | 'float'
type Method = 'keyboard' | 'mouse'

const REPO = 'https://github.com/EnixCoda/Gitako'
const sources = [
  { name: 'repo-root', path: 'tree/develop' },
  { name: 'blob', path: 'blob/develop/README.md' },
  { name: 'subfolder', path: 'tree/develop/src' },
  // Issue page: renders the default-branch tree; opening a file is a
  // cross-context navigation that remounts the sidebar (see header note).
  { name: 'issue', path: 'issues/318' },
]

const urlFor = (path: string, mode: Mode) =>
  `${REPO}/${path}?gitako-config-sidebarToggleMode=%22${mode}%22&gitako-config-intelligentToggle=null`

const isCollapsed = (page: Page) =>
  page.evaluate(
    sel => !!document.querySelector(sel)?.className.includes('collapsed'),
    selectors.gitako.bodyWrapper,
  )

const focusInTree = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('.file-explorer'))

// GitHub's own code-view file tree — its presence is what makes auto-expand
// collapse the pinned bar. Decides whether the collapse assertions apply.
const nativeTreeShown = (page: Page) =>
  page.evaluate(() => !!document.querySelector('#repos-file-tree'))

const hasTreeNodes = (page: Page) =>
  page.evaluate(sel => !!document.querySelector(sel), `${selectors.gitako.files} .node-item`)

// Expand the bar if collapsed. Persistent opens via the toggle's click; float
// opens on HOVER (its onClick would toggle back off after onHover expanded it),
// and we leave the mouse on the toggle — outside the body wrapper — so float's
// mouse-leave collapse never fires. Returns whether the bar ended up expanded.
async function ensureExpanded(page: Page, mode: Mode) {
  if (!(await isCollapsed(page))) return true
  const toggle = page.locator(selectors.gitako.toggleButton)
  if (mode === 'float') await toggle.hover()
  else await toggle.click({ force: true })
  await sleep(800)
  return !(await isCollapsed(page))
}

// Focus the tree and ArrowDown until the highlight lands on a leaf file (a
// /blob/ href), so a following Enter performs a real open. Returns its title.
async function arrowToFile(page: Page, exclude: string[]) {
  await page.locator('.file-explorer').evaluate(el => (el as HTMLElement).focus())
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('ArrowDown')
    await sleep(120)
    const node = await page.evaluate(sel => {
      const el = document.querySelector(sel)
      return el ? { title: el.getAttribute('title'), href: el.getAttribute('href') } : null
    }, `${selectors.gitako.files} .node-item.focused`)
    if (node?.title && !exclude.includes(node.title) && node.href?.includes('/blob/')) {
      return node.title
    }
  }
  return null
}

test.describe('keyboard: file tree navigation matrix (mode × source × method)', () => {
  test.skip(
    !resolveProfilePath(),
    'no persistent profile; Gitako cannot fetch the tree to navigate',
  )

  for (const mode of ['persistent', 'float'] as Mode[]) {
    for (const source of sources) {
      for (const method of ['keyboard', 'mouse'] as Method[]) {
        test(`${mode} · ${source.name} · ${method}`, async ({ extensionPage }) => {
          await extensionPage.setViewportSize({ width: 1920, height: 1080 })
          await extensionPage.goto(urlFor(source.path, mode))
          await sleep(3000)

          test.skip(
            !(await ensureExpanded(extensionPage, mode)),
            'could not expand the bar (native tree drift?)',
          )
          test.skip(
            !(await hasTreeNodes(extensionPage)),
            'no tree nodes to navigate (page/tree drift?)',
          )

          const target = await arrowToFile(extensionPage, ['README.md'])
          test.skip(!target, 'could not find a leaf file to open from this source')

          if (method === 'keyboard') {
            await extensionPage.keyboard.press('Enter')
          } else {
            await extensionPage.locator(selectors.gitako.fileItemOf(target!)).click()
          }
          await extensionPage.waitForURL(`**/${target}`, { timeout: 15000 })
          // Let every redirect event one navigation emits (turbo:load + the
          // polling tick) land — the regression collapsed on a LATER tick.
          await sleep(2500)

          const collapsed = await isCollapsed(extensionPage)
          const inTree = await focusInTree(extensionPage)

          if (method === 'keyboard') {
            // The fix: keyboard nav keeps focus in the tree...
            expect(inTree, 'focus stayed in the tree after keyboard open').toBe(true)
            // ...and in persistent mode the bar must not collapse out from under it.
            if (mode === 'persistent') {
              expect(collapsed, 'pinned bar stayed expanded during keyboard nav').toBe(false)
            }
            // Continuity: one more ArrowDown moves the highlight off the opened
            // file. A no-op here would mean focus was silently lost.
            const focused = extensionPage.locator(`${selectors.gitako.files} .node-item.focused`)
            await extensionPage.keyboard.press('ArrowDown')
            await expect(focused).not.toHaveAttribute('title', target!, { timeout: 10000 })
          } else if (mode === 'persistent' && (await nativeTreeShown(extensionPage))) {
            // Negative control (only observable where a collapse can release
            // focus): a mouse open clears the keyboard-nav flag, so the bar
            // auto-collapses and document.body.focus() pulls focus out — exactly
            // as before the fix existed (proof the fix isn't sticky).
            expect(collapsed, 'mouse-opened file auto-collapsed the bar').toBe(true)
            expect(inTree, 'focus left the tree after mouse open').toBe(false)
          } else {
            // Float (or no native tree): nothing dispatches focus away, so there
            // is no focus-release to assert — just confirm the open navigated.
            expect(extensionPage.url(), 'mouse open navigated to the file').toContain(target!)
          }
        })
      }
    }
  }
})

// The PR diff tree is the changed-files list Gitako shows on a pull request's
// Files-changed page. It differs from the repo tree in two ways that matter
// here: (1) its leaves are diff anchors (href ends in `#diff-<hash>`), and (2)
// opening one is a SAME-PAGE hash scroll, not a navigation — so there's no
// redirect, no auto-collapse, and the URL only gains a fragment. GitHub moves
// focus to <body> on that scroll, so without the focusout-guard the user's
// keyboard position is lost after one file. This asserts focus stays in the
// tree so arrowing continues. Persistent mode only — the bar never collapses on
// a hash scroll, so the float/mouse axes add no signal here.
test.describe('keyboard: PR diff-tree navigation (same-page hash scroll)', () => {
  test.skip(!resolveProfilePath(), 'no persistent profile; Gitako cannot fetch the PR diff tree')

  // pull/311 is a large multi-file PR, so the diff tree always has several
  // leaves to arrow through for the continuity check.
  test('pull/311 changes · keyboard open retains focus in the diff tree', async ({
    extensionPage,
  }) => {
    const page = extensionPage
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(urlFor('pull/311/changes', 'persistent'))
    await sleep(4000)

    test.skip(!(await ensureExpanded(page, 'persistent')), 'could not expand the bar')
    test.skip(!(await hasTreeNodes(page)), 'no diff-tree nodes (PR/experience drift?)')

    await page.locator('.file-explorer').evaluate(el => (el as HTMLElement).focus())
    let target: string | null = null
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowDown')
      await sleep(100)
      const node = await page.evaluate(sel => {
        const el = document.querySelector(sel)
        return el ? { title: el.getAttribute('title'), href: el.getAttribute('href') } : null
      }, `${selectors.gitako.files} .node-item.focused`)
      if (node?.title && node.href?.includes('#diff-')) {
        target = node.title
        break
      }
    }
    test.skip(!target, 'could not focus a diff-tree leaf to open')

    await page.keyboard.press('Enter')
    // The open is a hash scroll, not a navigation; give the focusout-guard's
    // requestAnimationFrame restore (and any settling) time to run.
    await sleep(1500)

    // The user's requirement: opening a changed file keeps focus in the tree so
    // they can keep arrowing. Without the focusout-guard the diff scroll drops
    // focus to <body> and the next ArrowDown does nothing.
    expect(await focusInTree(page), 'focus stayed in the diff tree after keyboard open').toBe(true)

    // Continuity: arrowing is still live. Note the highlighted node may reset
    // here — the `#diff-<hash>` the open adds to the URL re-fires the
    // after-redirect path, which recomputes the current path (empty on a PR
    // changes page) and can clear the highlight. That's fine; ArrowDown then
    // re-anchors to the first node. What must hold is that ArrowDown still moves
    // focus to a node-item and never escapes the tree.
    const focused = page.locator(`${selectors.gitako.files} .node-item.focused`)
    await page.keyboard.press('ArrowDown')
    await expect(focused, 'ArrowDown re-highlights a node in the diff tree').toHaveCount(1, {
      timeout: 10000,
    })
    expect(await focusInTree(page), 'focus stayed in the tree while arrowing').toBe(true)
  })
})
