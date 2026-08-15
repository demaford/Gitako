import { disableGitHubCodeFolding } from './disableGitHubCodeFolding'

test('turns off the obsolete persisted github.com code-fold default', () => {
  expect(disableGitHubCodeFolding({ codeFolding: true, searchMode: 'fuzzy' })).toEqual({
    codeFolding: false,
    searchMode: 'fuzzy',
  })
})

test('does not rewrite an already-disabled or missing setting', () => {
  expect(disableGitHubCodeFolding({ codeFolding: false })).toBeNull()
  expect(disableGitHubCodeFolding({ searchMode: 'fuzzy' })).toBeNull()
})
