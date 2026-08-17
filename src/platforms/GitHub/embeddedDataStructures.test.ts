import { resolveCommitShortMessageMarkdown } from './embeddedDataStructures'

describe('resolveCommitShortMessageMarkdown', () => {
  const shortMessageMarkdown = '<div>test: keep the commit subject</div>'

  test.each([
    [
      'legacy payload used by older GitHub and GitHub Enterprise layouts',
      { payload: { commit: { shortMessageMarkdown } } },
    ],
    [
      'current GitHub.com commitRoute payload',
      { payload: { commitRoute: { commit: { shortMessageMarkdown } } } },
    ],
  ])('reads the %s', (_name, payload) => {
    expect(resolveCommitShortMessageMarkdown(payload)).toBe(shortMessageMarkdown)
  })

  test.each([
    {},
    { payload: {} },
    { payload: { commit: {} } },
    { payload: { commitRoute: { commit: {} } } },
  ])('rejects an unsupported payload %#', payload => {
    expect(resolveCommitShortMessageMarkdown(payload)).toBeUndefined()
  })
})
