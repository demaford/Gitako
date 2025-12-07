export const map = <K, R>(
  iterable: Iterable<K>,
  callback: (item: K, index: number, iterable: Iterable<K>) => R,
): R[] => {
  const result: R[] = []
  let index = 0
  for (const item of iterable) {
    result.push(callback(item, index++, iterable))
  }
  return result
}
