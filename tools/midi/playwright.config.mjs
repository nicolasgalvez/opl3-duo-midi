import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs/,
  timeout: 15000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    viewport: { width: 1100, height: 800 },
  },
  // Each spec boots its own `opl serve` instance (own port + isolated state).
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
