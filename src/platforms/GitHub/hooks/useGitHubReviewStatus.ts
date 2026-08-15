import React from 'react'
import { VisibleNodesGenerator } from 'utils/VisibleNodesGenerator'
import { normalizeGitHubPath } from '../utils'

export function useGitHubReviewStatus(visibleNodesGenerator: VisibleNodesGenerator | null) {
  React.useEffect(() => {
    if (!visibleNodesGenerator) return

    const clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const markReviewedButton = target.closest('[class*="MarkAsViewedButton-"]')
      const rawFilePath = markReviewedButton
        ?.closest('[id^="diff-"]')
        ?.querySelector('a[href^="#diff-"]')
        ?.textContent?.trim()

      if (!markReviewedButton) return
      if (!rawFilePath) return
      const filePath = normalizeGitHubPath(rawFilePath)
      visibleNodesGenerator.updateNode(filePath, node => {
        node.reviewed = markReviewedButton.getAttribute('aria-label') === 'Viewed'
      })
    }

    // Classic ("New Files Changed Experience" off) uses a checkbox instead
    // of the React MarkAsViewedButton. It fires `change` (via its label), so
    // mirror the new state onto the matching node.
    const changeHandler = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      if (target.name !== 'viewed' || !target.classList.contains('js-reviewed-checkbox')) return

      const rawFilePath = target
        .closest('[id^="diff-"]')
        ?.querySelector('[data-path]')
        ?.getAttribute('data-path')

      if (!rawFilePath) return
      const filePath = normalizeGitHubPath(rawFilePath)
      visibleNodesGenerator.updateNode(filePath, node => {
        node.reviewed = target.checked
      })
    }

    window.addEventListener('click', clickHandler)
    window.addEventListener('change', changeHandler, true)
    return () => {
      window.removeEventListener('click', clickHandler)
      window.removeEventListener('change', changeHandler, true)
    }
  }, [visibleNodesGenerator])
}
