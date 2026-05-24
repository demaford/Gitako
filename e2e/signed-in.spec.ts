import { expect, resolveProfilePath, test } from './fixtures'

test.describe('signed-in profile sanity check', () => {
  test.skip(
    !resolveProfilePath(),
    'no persistent profile configured; signed-in check is irrelevant in anonymous runs',
  )

  test('bot account should be signed in to GitHub', async ({ extensionPage }) => {
    await extensionPage.goto('https://github.com/')
    const userLogin = await extensionPage.evaluate(
      () => document.querySelector('meta[name="user-login"]')?.getAttribute('content') ?? null,
    )
    expect(userLogin, 'meta[name="user-login"] must be present and non-empty').toBeTruthy()
  })
})
