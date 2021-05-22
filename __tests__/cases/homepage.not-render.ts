import { expectToNotFind } from '../utils'

describe(`in GitHub homepage`, () => {
  beforeAll(() => page.goto('https://github.com'))

  it('should not render Gitako', async () => {
    await expectToNotFind('.gitako-side-bar .gitako-side-bar-body-wrapper')
  })
})
