import { map } from 'utils/map'
import { sanitizedLocation } from 'utils/URLHelper'
import * as API from './API'
import {
  getPRDiffTotalStat,
  getPullRequestFilesCount,
  resolveEmbeddedPullRequestData,
} from './DOMHelper'
import { isInPullFilesPage } from './URLHelper'
import { DiffSummary } from './embeddedDataStructures'
import { processTree } from './index'
import { getCommentsMap } from './utils'

function checkShouldSafeGet() {
  const FAST_GET_DIFF_THRESHOLD = 10000
  const FAST_GET_FILES_THRESHOLD = 200
  const { added, removed } = getPRDiffTotalStat()
  const filesCount = getPullRequestFilesCount()
  return (
    added === null ||
    removed === null ||
    filesCount === null ||
    (added + removed < FAST_GET_DIFF_THRESHOLD && filesCount < FAST_GET_FILES_THRESHOLD)
  )
}

export async function getPullRequestTreeData(
  metaData: Pick<MetaData, 'userName' | 'repoName' | 'branchName'>,
  pullId: string,
  accessToken?: string,
  shouldSafeGet = checkShouldSafeGet(),
) {
  const { userName, repoName } = metaData
  const [treeData, commentData] = await Promise.all([
    shouldSafeGet
      ? safeGetPullRequestTreeData(metaData, pullId, accessToken)
      : fastGetPullRequestTreeData(metaData, pullId, accessToken),
    API.getPullComments(userName, repoName, pullId, accessToken),
  ])

  const [fileChangesPagePath, docs] = await API.getPullPageDocuments(
    userName,
    repoName,
    pullId,
    isInPullFilesPage()
      ? {
          url: window.location.href,
          document,
        }
      : undefined,
  )

  const diffSummaryMap = resolveDiffSummaryMap(docs)

  // The embedded `diffSummaries` JSON only ships with the "New Files
  // Changed Experience". On the classic experience (feature preview off)
  // it's absent, so the per-file viewed state lives in the rendered diff
  // DOM instead. Recover it from there when the embedded data is missing.
  const classicReviewedMap = diffSummaryMap.size > 0 ? null : resolveClassicReviewedMap(docs)

  const fileHashMap =
    diffSummaryMap.size > 0
      ? new Map(map(diffSummaryMap, ([, { path, pathDigest }]) => [path, `diff-${pathDigest}`]))
      : resolveFileHashMap(docs)

  const url = new URL(sanitizedLocation.href)
  url.pathname = fileChangesPagePath
  const commentsMap = getCommentsMap(commentData)
  const nodes: TreeNode[] = treeData.map(
    ({
      filename,
      sha,
      additions,
      deletions,
      changes,
      status,
      raw_url: rawLink,
      blob_url: permalink,
    }) => {
      url.hash = fileHashMap.get(filename) || ''
      return {
        path: filename || '',
        type: 'blob',
        name: filename?.split('/').pop() || '',
        url: `${url}`,
        permalink,
        rawLink,
        sha,
        reviewed:
          diffSummaryMap.get(filename)?.markedAsViewed ?? classicReviewedMap?.get(filename || ''),
        comments: commentsMap.get(filename),
        diff: {
          status,
          additions,
          deletions,
          changes,
        },
      }
    },
  )

  const root = processTree(nodes)
  return { root }
}

const GITHUB_API_RESPONSE_LENGTH_LIMIT = 3000
const GITHUB_API_RESPONSE_MAX_SIZE_PER_PAGE = 100
const MAX_PAGE = Math.ceil(GITHUB_API_RESPONSE_LENGTH_LIMIT / GITHUB_API_RESPONSE_MAX_SIZE_PER_PAGE)

function resolveFileHashMap(docs: Document[]) {
  // query all elements at once to make getFileElementHash run faster
  const elementsHavePath = docs.map(doc => doc.querySelectorAll(`[data-path]`))
  const fileHashMap = new Map<string, string>()
  for (const group of elementsHavePath) {
    for (let i = 0; i < group.length; i++) {
      const element = group[i]
      const id = element.parentElement?.id
      if (id) {
        const path = element.getAttribute('data-path')
        if (path) fileHashMap.set(path, id)
      }
    }
  }

  return fileHashMap
}

// Classic ("New Files Changed Experience" off) viewed-state reader. Each
// file's diff block (`#diff-<digest>`) contains a `[data-path]` element and
// a per-file `input[name="viewed"]` whose `checked` attribute reflects the
// signed-in user's viewed state as server-rendered. Returns path -> viewed.
function resolveClassicReviewedMap(docs: Document[]) {
  const reviewedMap = new Map<string, boolean>()
  for (const doc of docs) {
    const pathElements = doc.querySelectorAll('[data-path]')
    for (let i = 0; i < pathElements.length; i++) {
      const path = pathElements[i].getAttribute('data-path')
      if (!path) continue
      const block = pathElements[i].closest('[id^="diff-"]')
      const checkbox = block?.querySelector('input[name="viewed"]')
      if (checkbox instanceof HTMLInputElement) {
        reviewedMap.set(path, checkbox.hasAttribute('checked'))
      }
    }
  }
  return reviewedMap
}

function resolveDiffSummaryMap(docs: Document[]) {
  return docs
    .map(resolveEmbeddedPullRequestData)
    .map(json => {
      const payload = json?.payload
      if (!payload) return null
      if ('pullRequestsFilesRoute' in payload) {
        return payload.pullRequestsFilesRoute
      } else if ('pullRequestsChangesRoute' in payload) {
        return payload.pullRequestsChangesRoute
      }
    })
    .map(pullRequests => pullRequests?.diffSummaries)
    .reduce((map, curr) => {
      curr?.forEach(record => {
        map.set(record.path, record)
      })
      return map
    }, new Map<DiffSummary['path'], DiffSummary>())
}

async function safeGetPullRequestTreeData(
  { userName, repoName }: Pick<MetaData, 'userName' | 'repoName' | 'branchName'>,
  pullId: string,
  accessToken?: string,
) {
  return (
    await API.getPaginatedData<GitHubAPI.PullTreeData>(page =>
      API.requestPullTreeData(
        userName,
        repoName,
        pullId,
        page,
        GITHUB_API_RESPONSE_MAX_SIZE_PER_PAGE,
        accessToken,
      ),
    )
  ).flat()
}

async function fastGetPullRequestTreeData(
  { userName, repoName }: Pick<MetaData, 'userName' | 'repoName' | 'branchName'>,
  pullId: string,
  accessToken?: string,
) {
  const treeData = await API.getPullTreeData(
    userName,
    repoName,
    pullId,
    1,
    GITHUB_API_RESPONSE_MAX_SIZE_PER_PAGE,
    accessToken,
  )

  const count = getPullRequestFilesCount()
  if (count !== null && treeData.length < count) {
    let page = 1
    const restPages = []
    while (page * GITHUB_API_RESPONSE_MAX_SIZE_PER_PAGE < count) {
      restPages.push(++page)
    }
    if (page > MAX_PAGE) {
      // TODO: hint
    }
    const moreFiles = await Promise.all(
      restPages.map(page =>
        API.getPullTreeData(
          userName,
          repoName,
          pullId,
          page,
          GITHUB_API_RESPONSE_MAX_SIZE_PER_PAGE,
          accessToken,
        ),
      ),
    )
    treeData.push(...moreFiles.flat())
  }

  return treeData
}
