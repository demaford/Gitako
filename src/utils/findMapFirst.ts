export const findMapFirst = <T, R>(array: T[], map: (item: T) => R): R | null => {
  for (const item of array) {
    const result = map(item)
    if (result) return result
  }
  return null
}
