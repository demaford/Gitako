import * as s from 'superstruct'

const repo = s.type({
  id: s.number(),
  defaultBranch: s.string(),
  name: s.string(),
  ownerLogin: s.string(),
  currentUserCanPush: s.boolean(),
  isFork: s.boolean(),
  isEmpty: s.boolean(),
  createdAt: s.string(),
  ownerAvatar: s.string(),
  public: s.boolean(),
  private: s.boolean(),
  isOrgOwned: s.boolean(),
})

const user = s.type({
  id: s.number(),
  login: s.string(),
  userEmail: s.string(),
})

const rel = s.type({
  name: s.string(),
  listCacheKey: s.string(),
  canEdit: s.boolean(),
  refType: s.string(),
  currentOid: s.string(),
})

const treeItem = s.type({
  name: s.string(),
  path: s.string(),
  contentType: s.string(),
})

const tree = s.type({
  items: s.array(treeItem),
  templateDirectorySuggestionUrl: s.nullable(s.never()),
  readme: s.nullable(s.never()),
  totalCount: s.number(),
  showBranchInfobar: s.boolean(),
})

const repoPayload = s.type({
  allShortcutsEnabled: s.boolean(),
  path: s.string(),
  repo: repo,
  currentUser: user,
  refInfo: rel,
  tree: tree,
  fileTree: s.nullable(s.never()),
  fileTreeProcessingTime: s.nullable(s.never()),
  foldersToFetch: s.array(s.unknown()),
  treeExpanded: s.boolean(),
  symbolsExpanded: s.boolean(),
  isOverview: s.boolean(),
  overview: s.unknown(),
})

const reposOverview = s.type({
  props: s.type({
    initialPayload: repoPayload,
    appPayload: s.unknown(),
  }),
})

const app = s.type({
  payload: repoPayload,
})

const codeViewRefInfo = s.type({
  name: s.string(),
})

const commitsApp = s.type({
  payload: s.type({
    commit: s.type({
      // shortMessageMarkdown is HTML (rendered markdown of the subject
      // line) — strip tags at the call site
      shortMessageMarkdown: s.string(),
    }),
  }),
})

// Signed-in users see refInfo nested under codeViewTreeRoute /
// codeViewLayoutRoute; anonymous users get it directly on payload.
const codeViewApp = s.type({
  payload: s.union([
    s.type({ refInfo: codeViewRefInfo }),
    s.type({ codeViewTreeRoute: s.type({ refInfo: codeViewRefInfo }) }),
    s.type({ codeViewLayoutRoute: s.type({ refInfo: codeViewRefInfo }) }),
  ]),
})

const diffSummary = s.type({
  changeType: s.string(),
  highestAnnotationLevel: s.nullable(s.string()),
  isCodeowner: s.nullable(s.boolean()),
  isManifestFile: s.boolean(),
  isSymlink: s.boolean(),
  isVendored: s.boolean(),
  linesAdded: s.number(),
  linesChanged: s.number(),
  linesDeleted: s.number(),
  markedAsViewed: s.boolean(),
  path: s.string(),
  pathDigest: s.string(),
})

export type DiffSummary = s.Infer<typeof diffSummary>

const pullRequest = s.type({
  payload: s.type({
    pullRequestsFilesRoute: s.optional(
      s.type({
        diffSummaries: s.array(diffSummary),
      }),
    ),
    pullRequestsChangesRoute: s.optional(
      s.type({
        diffSummaries: s.array(diffSummary),
      }),
    ),
  }),
})

export const embeddedDataStruct = {
  repo,
  user,
  rel,
  treeItem,
  tree,
  repoPayload,
  reposOverview,
  app,
  codeViewApp,
  commitsApp,
  pullRequest,
}
