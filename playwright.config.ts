import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Match only canonical suite files one directory below each suite root.
  testMatch: [
    'contract/integration/*.spec.ts',
    'contract/platform/*.spec.ts',
    'contract/scenarios/*.spec.ts',
    'e2e/*.spec.ts',
    'e2e/platform/*.spec.ts',
    'e2e/scenarios/*.spec.ts',
  ],
  reporter: [['list'], ['json', { outputFile: 'playwright-report-platform-012.json' }]],
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
