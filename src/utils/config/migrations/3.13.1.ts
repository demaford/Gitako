import { storageHelper } from 'utils/storageHelper'
import { Migration, onConfigOutdated } from '.'

export const migration: Migration = {
  version: '3.13.1',
  async migrate(version) {
    // disable copy snippet button for github.com
    type ConfigBeforeMigrate = {
      toggleButtonVerticalDistance: number
    }
    type ConfigAfterMigrate = {
      toggleButtonVerticalDistance: number
    }

    await onConfigOutdated(version, async configs => {
      const key = 'platform_github.com'
      const config = configs[key]
      if (
        typeof config === 'object' &&
        config !== null &&
        'toggleButtonVerticalDistance' in config
      ) {
        const configBeforeMigrate = config as ConfigBeforeMigrate
        const { toggleButtonVerticalDistance, ...rest } = configBeforeMigrate
        const previousDefaultToggleButtonVerticalDistance = 124
        const newDefaultToggleButtonVerticalDistance = 64
        if (toggleButtonVerticalDistance === previousDefaultToggleButtonVerticalDistance) {
          const configAfterMigrate: ConfigAfterMigrate = {
            ...rest,
            toggleButtonVerticalDistance: newDefaultToggleButtonVerticalDistance,
          }
          await storageHelper.set({
            [key]: configAfterMigrate,
          })
        }
      }
    })
  },
}
