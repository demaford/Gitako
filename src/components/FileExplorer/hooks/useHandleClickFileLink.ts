import { useCallback, useRef } from 'react'
import { useEvent } from 'react-use'
import { useAfterRedirect } from 'utils/hooks/useFastRedirect'

export function useHandleClickFileLink(ref: React.MutableRefObject<HTMLElement | null>) {
  const toGoRef = useRef<string | null>(null)
  const onClickCaptureSaveHrefWithHash = useCallback(
    (e: Event) => {
      const target = e.target
      if (target instanceof HTMLElement && ref.current?.contains(target)) {
        let e: HTMLElement | null = target
        while (e && e !== ref.current) {
          if (e instanceof HTMLAnchorElement) {
            const hash = e.href.split('#')[1]
            if (hash) {
              toGoRef.current = e.href
            }
          }
          e = e.parentElement
        }
      }
    },
    [ref],
  )
  useEvent('click', onClickCaptureSaveHrefWithHash, document, true)

  const redirectToSavedHrefWithHash = useCallback(() => {
    const toGo = toGoRef.current
    if (toGo) {
      toGoRef.current = null
      if (toGo.startsWith(location.href)) {
        window.location.replace(toGo)
      }
    }
  }, [])
  useAfterRedirect(redirectToSavedHrefWithHash)
}
