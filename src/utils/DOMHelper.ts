/**
 * this helper helps manipulating DOM
 */

import { platformName } from 'platforms'
import { $ } from './$'
import { Config } from './config/helper'

export const rootElementID = 'gitako-root'
export const gitakoDescriptionTarget = document.documentElement

// Some custom attributes added to GitHub html would be removed by GitHub when some events happen
function attachStickyAttribute(
  target: Node,
  shouldAttach: (mutation: MutationRecord) => boolean,
  attach: (mutation: MutationRecord) => void,
  mutationOptions?: MutationObserverInit,
) {
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) if (shouldAttach(mutation)) attach(mutation)
  })

  observer.observe(target, {
    attributeOldValue: true,
    attributes: true,
    ...mutationOptions,
  })

  return () => observer.disconnect()
}

export const attachStickyDataAttribute = (
  target: HTMLElement,
  attributeName: string,
  attach: (mutation: MutationRecord) => void,
) =>
  attachStickyAttribute(target, () => !target.getAttribute(attributeName), attach, {
    attributeFilter: [attributeName],
  })

export const attachStickyStyle = (
  target: HTMLElement,
  styleName: string,
  attach: (mutation: MutationRecord) => void,
) =>
  attachStickyAttribute(
    target,
    () => !target.style.getPropertyValue(styleName), // `''` if not exist
    attach,
    { attributeFilter: ['style'] },
  )

/**
 * when gitako is ready, attach attribute to activate CSS selectors
 * e.g. make page's header narrower on pin sidebar
 */
const readyDataAttributeName = 'data-gitako-ready'
export const attachStickyGitakoReadyState = () =>
  attachStickyDataAttribute(gitakoDescriptionTarget, readyDataAttributeName, ({ oldValue }) =>
    markGitakoReadyState(oldValue === 'true'),
  )
export function markGitakoReadyState(ready: boolean) {
  return gitakoDescriptionTarget.setAttribute(readyDataAttributeName, `${ready}`)
}

/**
 * indicate current platform to activate specific CSS styles
 */
const platformDataAttributeName = 'data-gitako-platform'
export const attachStickyGitakoPlatform = () =>
  attachStickyDataAttribute(gitakoDescriptionTarget, platformDataAttributeName, () =>
    markGitakoPlatform(),
  )
export function markGitakoPlatform() {
  if (platformName)
    return gitakoDescriptionTarget.setAttribute(platformDataAttributeName, platformName)
}

/**
 * if should show gitako, then move body right to make space for showing gitako
 * otherwise, hide the space
 */
const spacingAttributeName = 'data-with-gitako-spacing'
export const attachStickyBodyIndent = () =>
  attachStickyDataAttribute(gitakoDescriptionTarget, spacingAttributeName, ({ oldValue }) =>
    setBodyIndent(
      (oldValue &&
        (
          {
            left: 'left',
            right: 'right',
          } as const
        )[oldValue]) ||
        'left',
    ),
  )
export function setBodyIndent(placement: Config['sidebarPlacement'] | false) {
  gitakoDescriptionTarget.setAttribute(spacingAttributeName, `${placement}`)
}

/**
 * DOM Structure after calling the `insert*MountPoint` functions
 *
 *  <html>
 *    <body>
 *    </body>
 *    <div id={rootElementID}>
 *      <div id={sidebarMountPointID}>
 *      </div>
 *      <div id={logoMountPointID}>
 *      </div>
 *    </div>
 *  </html>
 */

// Cache the gitako-root JS reference across the page's lifetime. Turbo
// navigations replace the whole <body>, detaching the previous root and
// everything inside it (sidebar/logo mount points, plus styled-components'
// own <style> tags). Re-using the same JS object — and re-attaching it to
// the current body on each call — keeps every long-lived consumer happy
// without anyone needing to refresh their reference:
//   • Gitako.tsx caches the root for styled-components' StyleSheetManager
//     target via useMemo; this way that reference stays current.
//   • styled-components' dynamic <style> tags ride inside the root and
//     come back to the live document when it's re-attached.
//   • Sidebar / logo mount points (and the React tree rendered into the
//     sidebar one) are children of the root and travel with it.
let cachedRoot: HTMLDivElement | null = null

export function insertMountPoint(): HTMLDivElement {
  if (cachedRoot === null) {
    const existing = document.querySelector<HTMLDivElement>(formatID(rootElementID))
    if (existing) {
      cachedRoot = existing
    } else {
      cachedRoot = document.createElement('div')
      cachedRoot.setAttribute('id', rootElementID)
    }
  }
  if (!cachedRoot.isConnected) {
    document.body.appendChild(cachedRoot)
  }
  return cachedRoot
}

function ensureChildMountPoint(id: string): HTMLDivElement {
  // Always look up the child WITHIN the live root, not against the document.
  // After Turbo swap, a stale child can exist in the orphaned old root with
  // the same id — querying the document would return null (or worse, find
  // an unrelated element), so we'd create a duplicate.
  const root = insertMountPoint()
  let child = root.querySelector<HTMLDivElement>(formatID(id))
  if (!child) {
    child = document.createElement('div')
    child.setAttribute('id', id)
    root.appendChild(child)
  }
  return child
}

export function insertSideBarMountPoint() {
  return ensureChildMountPoint('gitako-sidebar-mount-point')
}

export function insertLogoMountPoint() {
  return ensureChildMountPoint('gitako-logo-mount-point')
}

/**
 * content above the file navigation bar is same for all pages of the repo
 * use this function to scroll down a bit to hide them
 */
export function scrollToRepoContent() {
  const repositoryContentSelector = '.repository-content'
  // do NOT use behavior: smooth here as it will scroll horizontally
  $(repositoryContentSelector, repositoryContentElement =>
    repositoryContentElement.scrollIntoView(),
  )
}

/**
 * copy content of a DOM element to clipboard
 */
export function copyElementContent(element: Element, trimLeadingSpace?: boolean): boolean {
  window.getSelection()?.removeAllRanges()

  const range = document.createRange()
  if (trimLeadingSpace) {
    // Leading spaces can be produced by embedded DOM structures
    let realWrapper: Element | null = element
    while (realWrapper?.childElementCount === 1) realWrapper = realWrapper?.firstElementChild
    if (realWrapper?.childElementCount && realWrapper.childElementCount > 1) {
      const first = realWrapper.firstElementChild
      const last = realWrapper.lastElementChild
      if (first && last) {
        range.selectNode(first)
        range.setEndAfter(last)
      }
    }
  } else {
    range.selectNode(element)
  }

  window.getSelection()?.addRange(range)
  const isCopySuccessful = document.execCommand('copy')
  window.getSelection()?.removeAllRanges()
  return isCopySuccessful
}

export function findNodeElement(node: TreeNode, rootElement: HTMLElement): HTMLElement | null {
  const nodeElement = rootElement.querySelector(`a[href="${node.url}"]`)
  if (nodeElement instanceof HTMLElement) return nodeElement
  return null
}

export function setCSSVariable(name: string, value: string | undefined, element: HTMLElement) {
  if (value === undefined) element.style.removeProperty(name)
  else element.style.setProperty(name, value)
}

const gitakoWidthVariable = '--gitako-width'
export const attachStickyGitakoWidthCSSVariable = (getLatestSize: () => number) =>
  attachStickyStyle(gitakoDescriptionTarget, gitakoWidthVariable, () => {
    setGitakoWidthCSSVariable(getLatestSize())
  })
export const setGitakoWidthCSSVariable = (size: number) => {
  setCSSVariable(gitakoWidthVariable, `${size}px`, gitakoDescriptionTarget)
}

export function formatID(id: string) {
  return `#${id}`
}

export function formatClass(className: string) {
  return `.${className}`
}

export function parseIntFromElement(e: HTMLElement): number {
  return parseInt((e.innerText || '').replace(/[^0-9]/g, ''))
}

export function cancelEvent(e: Event | React.BaseSyntheticEvent): void {
  e.stopPropagation()
  e.preventDefault()
}

export function onEnterKeyDown<E extends HTMLElement>(
  e: React.KeyboardEvent<E>,
  callback: (e: React.KeyboardEvent<E>) => void,
) {
  if (e.key === 'Enter') callback(e)
}
