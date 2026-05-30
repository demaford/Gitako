// String-template passthrough for test URLs.
//
// It deliberately does NOT inject any access token. The token lives only
// in the persistent profile's Gitako settings (chrome.storage) — never in
// the URL, where it would leak into github.com request logs, the address
// bar, and Playwright video/trace/screenshot artifacts. Specs that need an
// authenticated tree gate on resolveProfilePath() instead.
export function testURL(strings: TemplateStringsArray, ...values: unknown[]) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '')
}
