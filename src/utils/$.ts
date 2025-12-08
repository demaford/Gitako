export interface $ {
  <E extends HTMLElement>(selector: string): E | null
  <R1>(selector: string, existCallback: (element: HTMLElement) => R1): R1 | null
  <R1, R2>(selector: string, existCallback: (element: HTMLElement) => R1, otherwise: () => R2):
    | R1
    | R2
  <E extends HTMLElement, R2>(
    selector: string,
    existCallback: undefined | null,
    otherwise: () => R2,
  ): E | R2
}

export const make$ =
  (root?: Document | HTMLElement): $ =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (selector: string, existCallback?: any, otherwise?: any) => {
    const element = (root ?? document).querySelector(selector)
    if (element) {
      return existCallback ? existCallback(element) : element
    }
    return otherwise ? otherwise() : null
  }

export const $: $ = make$()
