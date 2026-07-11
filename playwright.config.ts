import { defineConfig, devices } from "@playwright/test"

/**
 * PR-10: Playwright integration for Validation Bench.
 *
 * Starts the voice-demo Vite dev server automatically before running
 * tests (webServer), and reuses it locally to speed up repeated runs.
 * On CI, always starts a fresh server.
 */
export default defineConfig({
    testDir: "./tests/playwright",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: [
        ["html", { open: "never" }],
        ["list"]
    ],

    use: {
        baseURL: "http://localhost:5173",
        // PR-10 requirement: save artifacts automatically on failure.
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },

    // PR-10 requirement: support Chromium, Firefox, WebKit.
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } }
    ],

    // PR-10 requirement: automatically start the demo and wait for it
    // to be ready before running tests.
    webServer: {
        command: "npm run dev --prefix apps/voice-demo",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    }
})