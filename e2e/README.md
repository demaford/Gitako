# Gitako e2e strategy

This file is the single place to learn how the e2e suite is meant to work,
and what it does and does not cover. Read it before adding or debugging a
spec. The companion nightly runner lives in `../../gitako-e2e/`.

## How a spec runs

- Tests use Playwright's **persistent Chromium context** with the built
  extension loaded from `../dist` (see `fixtures.ts`). There is no headless
  mode — the extension needs a real browser.
- The context is launched against a **profile directory** resolved by
  `resolveProfilePath()`: `PLAYWRIGHT_PROFILE` env > `e2e/.profile` > none.
  `e2e/.profile` is a checked-in profile signed in as the bot account.
- **Signed-in vs anonymous.** Specs that only make sense signed in must gate
  themselves with `test.skip(!resolveProfilePath(), '…')` so they no-op when
  no profile is configured (e.g. `feature.pr-diff-summaries.signed-in.spec.ts`,
  `signed-in.spec.ts`). The DOM differs between signed-in and anonymous
  GitHub, so a selector verified in one may not hold in the other — note
  which you relied on.
- **Serial only.** Persistent contexts share one profile dir and take a
  filesystem lock; parallel workers race on it (`createContext` in
  `fixtures.ts`). The nightly runner forces `--workers=1`. A flaky
  "createContext" failure under default workers is this, not a real bug.

## Provisioning the profile's access token

Signed-in specs need Gitako to hold a GitHub access token (it lives only in
the profile's `chrome.storage`, never in a URL/env/artifact). Two ways to put
it there:

- **Manual PAT** — paste a least-privilege token into Settings → Access Token
  → "Or input here manually". Simple, no infra.
- **OAuth bootstrap (preferred for setup)** — drive Gitako's real OAuth flow so
  you never hand-handle a secret. Two entry points share the same flow:

  - **Interactive (headed, recommended for first/expired setup):**

    ```sh
    node e2e/scripts/oauth-bootstrap.mjs
    ```

    Opens a headed browser on the profile and pauses on GitHub's authorize
    page so a human can satisfy the one-time **sudo gate** ("Confirm access" /
    "Verify via email") that the headless spec can't. It then auto-detects the
    minted token. This core script lives in the gitako repo.

  - **Headless (opt-in maintenance spec, for when sudo is already satisfied):**

    ```sh
    GITAKO_OAUTH_BOOTSTRAP=1 npx playwright test maint.oauth-bootstrap --workers=1
    ```

    Same flow, but it **skips cleanly** if GitHub demands sudo (can't re-auth
    headlessly). Use it once the profile's sudo window is open.

  Both clear any existing token, click "Create with OAuth (recommended)", let
  GitHub's authorize step redirect back (the profile's session approves it),
  and let Gitako exchange the `?code` for a token via `gitako.enix.one`.

  **Build dependency:** the OAuth `client_id` is baked into `dist` at build
  time from `GITHUB_OAUTH_CLIENT_ID` (`src/env.ts` → `getOAuthLink`). A `dist`
  built without it sends `client_id=` and GitHub serves a 404 — the spec
  guards for this and fails with a clear message. Build with the OAuth env (the
  nightly runner's `.env` carries it) before bootstrapping.

  **It is destructive** (clears the token first) and depends on live external
  state, so it is double-gated (`resolveProfilePath()` **and**
  `GITAKO_OAUTH_BOOTSTRAP=1`) and never runs in the normal/nightly suite. To
  try it without risking a working token, point `PLAYWRIGHT_PROFILE` at a
  **copy** of `e2e/.profile` and run against that.

The OAuth *entry point* (the UI that starts this) is covered non-destructively
by `feature.oauth.spec.ts`, which uses its own token-less context — no
secrets, no server, safe for every run.

## The two-pass Feature Preview matrix (important — easy to forget)

GitHub ships per-account opt-in features via avatar → "Feature preview".
Different accounts see different DOM. Gitako breaks when a preview changes a
surface it scrapes (PR files, code view, etc.).

To cover both extremes, the nightly runner (`GITAKO_FEATURE_MATRIX=1` in
`../../gitako-e2e/run.sh`) runs the **whole suite twice**:

1. `GITAKO_PREVIEW_TARGET=off` — `globalSetup.ts` turns **every** known
   preview flag OFF, then runs all specs.
2. `GITAKO_PREVIEW_TARGET=on` — same, all flags ON.

`globalSetup.ts` normalizes the flags listed in `github-feature-preview.ts`
before each pass. This is the canonical way both PR experiences get covered:

- all-OFF → classic PR files DOM (checkbox-based viewed state)
- all-ON  → "New Files Changed Experience" (embedded `diffSummaries` JSON)

### Consequence for writing specs

**Do not pin a spec to a feature state with `withFeatureState` just to cover
both experiences** — the matrix already sets global state per pass, and
pinning fights it. Write a plain assertion; let the two passes multiply it.

**Caveat — the matrix only multiplies assertions that already exist.** If a
feature has no assertion, both passes pass vacuously and a regression in
either experience is invisible. This is exactly how review-marker breakage
went unnoticed: there was no `.node-item-reviewed` assertion at all until
`feature.pr-diff-summaries.signed-in.spec.ts` was added. **Coverage = assertions ×
matrix, and a missing assertion zeroes the product.** Keep the coverage map
below honest.

`withFeatureState` / `withFeatureStates` (in `featurePreview.ts`) still have a
place: toggling a *single* feature mid-test when a spec specifically needs to
observe the transition, not to substitute for the matrix.

## Spec families

- `drift.*` — tripwires for GitHub changing out from under us. They assert
  structure (selector presence, page shape, CSS vars, the Feature Preview
  tracker membership), not Gitako behavior. When GitHub ships a change these
  go red first, pointing at what to re-verify.
- `pjax.*` — soft-navigation (pjax/turbo) transitions keep Gitako mounted and
  correct.
- `feature.*` — a specific Gitako feature end to end.
- `nav.*`, `state.*`, `ui.*`, `lifecycle.*`, `theme.*`, `error.*`,
  `keyboard.*` — the remaining surfaces, grouped by area.
- `maint.*` — maintenance helpers (e.g. capture a CSS baseline), not asserts.
- `*.signed-in.*` — requires the bot profile; skips without it.
- `baseline` and `signed-in` are the two intentional family-less anchors:
  the anonymous and signed-in "sidebar mounts at all" smoke checks. Every
  other spec carries a `<family>.` prefix.

`selectors.ts` centralizes selectors with a comment per entry explaining why
it is stable. Prefer adding there over inlining a selector in a spec.

## Feature → coverage map

Keep this current when adding specs or Gitako features. "Covered" means a
spec actively asserts the behavior — not merely that the page renders.

| Gitako feature / surface        | Spec                                   | Status |
| ------------------------------- | -------------------------------------- | ------ |
| Sidebar mounts on repo          | `baseline`, `signed-in`                | ✅ |
| Absent on github.com home       | `nav.homepage-absent`                  | ✅ |
| Empty repo handling             | `feature.empty-project`                | ✅ |
| Branch name resolution / switch | `feature.branch-switch`, `nav.branch-content` | ✅ |
| Auto-expand to current file     | `feature.expand-to-target`             | ✅ |
| File search                     | `ui.search`                            | ✅ |
| Copy-snippet button             | `feature.copy-snippet`                 | ✅ |
| Keyboard shortcuts              | `keyboard.shortcut`                    | ✅ |
| Dock mode (float/persistent)    | `state.toggle-mode-persistence`        | ✅ |
| Theme mount                     | `theme.mount`                          | ✅ |
| pjax/turbo navigation           | `pjax.*`                               | ✅ |
| Rate-limit error UI             | `error.api-rate-limit`                 | ✅ |
| PR page mount + file tree       | `nav.pull-request-page`                | ✅ |
| PR per-file viewed markers (initial render) | `feature.pr-diff-summaries.signed-in` | ✅ (both experiences via matrix) |
| **PR viewed markers — live update on toggle** | —                    | ❌ gap (`useGitHubReviewStatus` click + change handlers are untested) |
| **PR per-file comment counts** (`node.comments`) | —                 | ❌ gap |
| **PR per-file diff stats** (`.node-item-diff`)   | —                 | ❌ gap (rendered, never asserted) |
| OAuth token entry point         | `feature.oauth`                        | ✅ token-less context asserts the OAuth link + manual fallback render |
| OAuth full round-trip (bootstrap) | `maint.oauth-bootstrap`              | ⚙️ opt-in only (`GITAKO_OAUTH_BOOTSTRAP=1`); provisions the token, needs prod build + server |
| Code folding in blob view       | `feature.code-fold`                    | ✅ disabled on github.com (native gutter folding covers it; legacy DOM gone), preserved for GHE; spec asserts it stays inert |
| **PR file virtualization DOM**  | —                                      | ❌ gap (`pull_request_files_virtualization`, affectsGitako: yes) |

When you close a gap, move its row up and cite the spec. When you find a new
one, add a ❌ row immediately — a written gap is a future test; a silent gap
is a future incident.
