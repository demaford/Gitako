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

    window.addEventListener('click', clickHandler)
    return () => {
      window.removeEventListener('click', clickHandler)
    }
  }, [visibleNodesGenerator])
}
