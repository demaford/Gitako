import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

if (process.arch === 'arm64' && process.platform === 'darwin') {
  dotenv.config()
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_PATH = path.resolve(__dirname, 'dist')

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/globalSetup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 3 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'html',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    trace: 'on-first-retry',
    // Default: only record on retry. Set GITAKO_VIDEO=1 to record every
    // test (useful for debugging timing/visual issues or producing demo
    // material). Videos land in test-results/<spec>/<test>/video.webm.
    video: process.env.GITAKO_VIDEO === '1' ? 'on' : 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Load the extension
        launchOptions: {
          args: [
            `--no-sandbox`,
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
          ],
          headless: false,
        },
      },
    },
  ],
})
