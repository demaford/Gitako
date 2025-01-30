export const waitForNextDocumentEvent = <K extends keyof DocumentEventMap>(
  type: EnumString<K>,
  options?: boolean | AddEventListenerOptions,
) =>
  new Promise(resolve => {
    const listener = (ev: DocumentEventMap[K] | Event) => {
      document.removeEventListener(type, listener, options)
      resolve(ev)
    }
    document.addEventListener(type, listener, options)
  })

export const waitForNextWindowEvent = <K extends keyof WindowEventMap>(
  type: EnumString<K>,
  options?: boolean | AddEventListenerOptions,
) =>
  new Promise(resolve => {
    const listener = (ev: WindowEventMap[K] | Event) => {
      window.removeEventListener(type, listener, options)
      resolve(ev)
    }
    window.addEventListener(type, listener, options)
  })

export const waitForNext = {
  documentEvent: waitForNextDocumentEvent,
  windowEvent: waitForNextWindowEvent,
}
