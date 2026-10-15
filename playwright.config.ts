import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Match only the canonical suite locations. Nested copied `tests/` trees are intentionally excluded.
  testMatch: [
    /(?:^|[/\\\\])tests[/\\\\](?:contract[/\\\\](?:integration|platform|scenarios)|e2e(?:[/\\\\](?:platform|scenarios))?)[/\\\\][^/\\\\]+\\.spec\\.ts$/,
  ],
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
