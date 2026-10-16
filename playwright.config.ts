import { defineConfig, devices } from '@playwright/test';

// Use the local app in CI unless a target URL is explicitly provided.
process.env.APP_URL ??= 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  // Exclude copied nested test trees; only canonical suites should be discovered.
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
    command: 'npm run start',
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
