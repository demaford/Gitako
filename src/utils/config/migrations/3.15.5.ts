import { storageHelper } from 'utils/storageHelper'
import { Migration, onConfigOutdated } from '.'
import { disableGitHubCodeFolding } from './disableGitHubCodeFolding'

export const migration: Migration = {
  version: '3.15.5',
  async migrate(version) {
    await onConfigOutdated(version, async configs => {
      const key = 'platform_github.com'
      const migrated = disableGitHubCodeFolding(configs[key])
      if (migrated) await storageHelper.set({ [key]: migrated })
    })
  },
}
