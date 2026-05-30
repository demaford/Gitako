import React from 'react'
import { VisibleNodesGenerator } from 'utils/VisibleNodesGenerator'

export function useGitHubReviewStatus(visibleNodesGenerator: VisibleNodesGenerator | null) {
  React.useEffect(() => {
    if (!visibleNodesGenerator) return

    const clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const markReviewedButton = target.closest('[class*="MarkAsViewedButton-"]')
      const filePath = markReviewedButton
        ?.closest('[id^="diff-"]')
        ?.querySelector('a[href^="#diff-"]')
        ?.textContent?.trim()
        // remove Unicode control characters that GitHub adds for RTL support
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')

      if (!markReviewedButton) return
      if (!filePath) return
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

      const filePath = target
        .closest('[id^="diff-"]')
        ?.querySelector('[data-path]')
        ?.getAttribute('data-path')
        // remove Unicode control characters that GitHub adds for RTL support
        ?.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')

      if (!filePath) return
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
