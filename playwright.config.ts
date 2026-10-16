import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Match only the canonical suite locations. Nested copied `tests/` trees are intentionally excluded.
  testMatch: ['**/*.spec.ts'],
  // Playwright matches absolute paths; exclude any copied nested tests tree.
  testIgnore: [/(?:^|\/)(?:contract|e2e)\/.*\/tests\//],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'playwright-report-platform-012.json' }]
  ],
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'cd apps/voice-demo && ../../node_modules/.bin/vite --port 3000 --host 0.0.0.0',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
