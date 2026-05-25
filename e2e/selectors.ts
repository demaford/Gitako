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
    searchInput: '.gitako-side-bar input[aria-label="Search files"]',
    toggleButton: '.gitako-toggle-show-button',
    collapsedBodyWrapper: '.gitako-side-bar-body-wrapper.collapsed',
    bodyWrapperFloatMode: '.gitako-side-bar-body-wrapper.toggle-mode-float',
    bodyWrapperPersistentMode: '.gitako-side-bar-body-wrapper.toggle-mode-persistent',
    accessDeniedHeader: '.gitako-side-bar h2',
    // Settings UI — centralised here because labels live in visually-
    // hidden <label>s with React-Aria-generated `for` ids (Math.random()
    // strings). Specs find inputs/checkboxes by walking from the label
    // text to its for-target. Buttons are scoped to .gitako-side-bar so
    // we don't grab GitHub's own "Save"/"Clear" buttons elsewhere.
    settings: {
      openButton: '[aria-label="Settings"]',
      closeButton: '[aria-label="Close settings"]',
      // Visible labels matched by text content; resolve to input ids
      // via DOM walking in test helpers.
      autoExpandLabel: 'Auto expand',
      copySnippetLabel: 'Copy snippet button',
      shortcutToggleSidebarLabel: 'Keyboard shortcut for toggle sidebar',
      shortcutFocusSearchLabel: 'Keyboard shortcut for focus search input',
      togglePinMode: '[aria-label="Toggle sidebar dock mode between float and persistent"]',
      // Buttons scoped to the sidebar so we don't accidentally grab
      // GitHub's chrome.
      saveButton: '.gitako-side-bar button:has-text("Save"):not([disabled])',
      saveOrClearButton:
        '.gitako-side-bar button:has-text("Save"), .gitako-side-bar button:has-text("Clear")',
    },
  },
}
