import React from 'react'

export function DiffStatText({ diff }: { diff: Required<TreeNode>['diff'] }) {
  const { additions, deletions } = diff
  return (
    <span className={'diff-stat-text'}>
      {additions > 0 && <span className={'additions'}>{additions}</span>}
      {additions > 0 && deletions > 0 && '/'}
      {deletions > 0 && <span className={'deletions'}>{deletions}</span>}
    </span>
  )
}
