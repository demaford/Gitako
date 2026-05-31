import { findMapFirst } from '../../utils/findMapFirst'

/**
 * Resolved from response header `link`
 *
 * Example:
 * <https://api.github.com/repositories/112069171/commits/7de4488d7f00630512e0d494bab209004f2d4a58?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/112069171/commits/7de4488d7f00630512e0d494bab209004f2d4a58?per_page=100&page=2>; rel="last"
 *
 * `rel` existence
 *
 * rel  | first page | middle page | last page
 * next |     ✔      |      ✔      |
 * last |     ✔      |      ✔      |
 * prev |            |      ✔      |     ✔
 * first|            |      ✔      |     ✔
 *
 * If there is only 1 page, no `link` header is returned.
 */
type Rels = {
  next?: string
  last?: string
  prev?: string
  first?: string
}

export function resolveHeaderLink(raw: string) {
  const rels: Rels = {}
  raw
    .split(',')
    .map(part => part.match(/<(.*?)>; *rel="(.*?)"/))
    .filter((link: RegExpMatchArray | null): link is RegExpMatchArray => !!link)
    .forEach(([, url, rel]) => {
      // It's 2022, is there a smarter way to do this in TS?
      switch (rel) {
        case 'next':
          rels.next = url
          break
        case 'last':
          rels.last = url
          break
        case 'prev':
          rels.prev = url
          break
        case 'first':
          rels.first = url
          break
      }
    })

  if (rels.next && rels.last && !rels.prev && !rels.first) {
    // first page
    return {
      next: rels.next,
      last: rels.last,
      position: 'first' as const,
    }
  } else if (rels.next && rels.last && rels.prev && rels.first) {
    // middle page
    return {
      next: rels.next,
      last: rels.last,
      prev: rels.prev,
      first: rels.first,
      position: 'middle' as const,
    }
  } else if (!rels.next && !rels.last && rels.prev && rels.first) {
    // last page
    return {
      prev: rels.prev,
      first: rels.first,
      position: 'last' as const,
    }
  } else {
    // unexpected link header content
    return
  }
}

async function getDOM(url: string) {
  const res = await fetch(url)
  const content = await res.text()
  return [res.url, new DOMParser().parseFromString(content, 'text/html')] as const
}

export async function continuousLoadFragmentedPages(
  url: string,
  doc: Document,
  docs: Document[] = [],
): Promise<[string, Document[]]> {
  docs.push(doc)

  // const data = resolveEmbeddedPullRequestData(doc)

  /**
   *  <include-fragment
   *    src="..."
   *    class="diff-progressive-loader js-diff-progressive-loader mb-4 d-flex flex-items-center flex-justify-center"
   *    data-targets="diff-file-filter.progressiveLoaders"
   *    data-action="include-fragment-replace:diff-file-filter#refilterAfterAsyncLoad"
   *  >
   */
  const fragmentSelectors = [
    'include-fragment[data-targets="diff-file-filter.progressiveLoaders"]',
    '.js-diff-progressive-container include-fragment[src]', // legacy support
  ]

  const fragment = findMapFirst(fragmentSelectors, selector => doc.querySelector(selector))
  if (fragment instanceof HTMLElement) {
    const src = fragment.getAttribute('src')
    if (src) {
      // Using `src` without origin below would fail in Firefox if the src is an absolute path
      // do NOT return here because we need to preserve the first `url` for the final return value
      await continuousLoadFragmentedPagesFromUrl(src, docs)
    }
  }
  return [new URL(url).pathname, docs]
}

export async function continuousLoadFragmentedPagesFromUrl(url: string, docs: Document[] = []) {
  const [finalUrl, dom] = await getDOM(new URL(url, window.location.origin).href)
  return continuousLoadFragmentedPages(finalUrl, dom, docs)
}

export function getCommentsMap(commentData: GitHubAPI.PullComments) {
  const commentsMap = new Map<
    string,
    {
      active: number
      resolved: number
    }
  >()
  commentData.forEach(comment => {
    let stat = commentsMap.get(comment.path)
    if (!stat) {
      stat = {
        active: 0,
        resolved: 0,
      }
      commentsMap.set(comment.path, stat)
    }

    // `line` is null once the comment goes outdated (the line it was on no
    // longer exists in the current diff); a live in-diff comment keeps a
    // numeric `line`. `position` is unreliable for this — under GitHub's
    // line-based review API outdated comments still report a non-null
    // `position`, so bucketing on it counts every current comment as resolved.
    if (comment.line === null) stat.resolved++
    else stat.active++
  })
  return commentsMap
}
