import { getCommentsMap, normalizeGitHubPath } from './utils'

function comment(
  path: string,
  line: number | null,
  subject_type: GitHubAPI.PullComment['subject_type'],
): GitHubAPI.PullComment {
  return {
    path,
    line,
    subject_type,
    position: null,
    pull_request_review_id: 1,
    id: 1,
    node_id: 'node',
    diff_hunk: '',
    body: '',
    html_url: '',
    author_association: 'NONE',
  }
}

test('classifies current line and file review comments as active', () => {
  const comments = [comment('file.ts', 12, 'line'), comment('file.ts', null, 'file')]

  expect(getCommentsMap(comments).get('file.ts')).toEqual({ active: 2, resolved: 0 })
})

test('classifies an outdated line review comment as resolved', () => {
  const comments = [comment('file.ts', null, 'line')]

  expect(getCommentsMap(comments).get('file.ts')).toEqual({ active: 0, resolved: 1 })
})

test('normalizes direction-control characters from DOM-derived GitHub paths', () => {
  expect(normalizeGitHubPath('\u2066src/\u202Eexample.ts\u2069')).toBe('src/example.ts')
})
