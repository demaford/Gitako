import React from 'react'
import { resolveDiffGraphMeta } from 'utils/general'

export function DiffStatGraph({ diff }: { diff: Required<TreeNode>['diff'] }) {
  const { changes, additions, deletions } = diff
  const { g, r, w } = resolveDiffGraphMeta(additions, deletions, changes)

  const children: React.ReactNode[] = []
  for (let i = 0; i < g; i++)
    children.push(<span key={`g-${i}`} className="diff-stat-graph-addition" />)
  for (let i = 0; i < r; i++)
    children.push(<span key={`r-${i}`} className="diff-stat-graph-deletion" />)
  for (let i = 0; i < w; i++)
    children.push(<span key={`w-${i}`} className="diff-stat-graph-no-change" />)

  return <span className={'diff-stat-graph'}>{children}</span>
}
