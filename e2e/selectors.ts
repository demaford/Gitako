export const selectors = {
  github: {
    breadcrumbFileName: `[data-testid="breadcrumbs-filename"]`,
    fileContent: 'textarea[aria-label="file content"]',
    commitLinks: [
      `li[data-testid="commit-row-item"] [data-testid="list-view-item-title-container"] a[href*="/commit/"]`,
      `li[data-testid="commit-row-item"] h4 a[href*="/commit/"]`,
    ].join(),
    // assume title contains `.` is file item
    fileListItemFileLinks: `table[aria-labelledby="folders-and-files"] tr.react-directory-row td.react-directory-row-name-cell-large-screen .react-directory-filename-column .react-directory-truncate a[aria-label$="(File)"]`,
    fileListItemLinkOf: (name: string) =>
      `table[aria-labelledby="folders-and-files"] tr.react-directory-row td.react-directory-row-name-cell-large-screen .react-directory-filename-column .react-directory-truncate a[title="${name}"]`,
    commitPage: ['div.commit', '#diff-content-parent'].join(),
    // Repo-level Issues/PRs nav tabs. `data-turbo-frame` is the attribute
    // GitHub puts on every link whose click should turbo-swap the repo
    // content frame — which is exactly what the repo nav tabs do, and
    // nothing else. Combined with the href suffix it uniquely identifies
    // the Issues/Pulls tab without baking in the owner/repo, the locale,
    // or fragile React-generated ids/classes. Verified count=1 on tree,
    // blob, repo overview, and the Issues/Pulls index pages themselves,
    // in both signed-in and anonymous DOMs.
    navBarItemIssues: '[data-turbo-frame="repo-content-turbo-frame"][href$="/issues"]',
    navBarItemPulls: '[data-turbo-frame="repo-content-turbo-frame"][href$="/pulls"]',
  },
  gitako: {
    fileItem: '.gitako-side-bar .files .node-item',
    fileItemOf: (path: string) => `.gitako-side-bar .files .node-item[title="${path}"]`,
    errorMessage: '#gitako-logo-mount-point .error-message',
    files: '.gitako-side-bar .files',
    bodyWrapper: '.gitako-side-bar .gitako-side-bar-body-wrapper',
    branchName: '.gitako-side-bar .branch-name',
  },
}
