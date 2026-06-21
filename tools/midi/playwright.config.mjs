import { defineConfig } from '@playwright/test'

const PORT = 7390

export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1100, height: 800 },
  },
  // Boot `opl serve` against the bundled fixture folder for the test run.
  webServer: {
    command: `node opl.mjs serve ./tests/fixtures --http ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
