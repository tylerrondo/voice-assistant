import type { Page } from "@playwright/test"

/**
 * PR-10 test utils: shared helpers used across Validation Bench
 * Playwright specs, so individual test files stay short and readable.
 */

/** Switches the top-level Validation Mode dropdown. */
export async function setValidationMode(page: Page, mode: "automatic" | "interactive") {
    await page.locator("#mode-select").selectOption(mode)
}

/** Switches Input Source (only visible in Interactive mode). */
export async function setInputSource(page: Page, source: "mic" | "inject") {
    await page.locator("#input-source-select").selectOption(source)
}

/** Runs the Automatic "Run All" flow and waits for it to complete. */
export async function runAll(page: Page) {
    await page.locator("#btn-run-all").click()
    await page.locator("#verification-result").getByText(/PASS|FAIL/).waitFor()
}

/**
 * Drives one full Interactive step using Inject Action as the input
 * source (no real microphone required — suitable for CI). Clicks
 * Start/Next, confirms Recognized/Heard as "Верно"/"Услышал", and
 * waits for the confirmation UI to appear before doing so.
 */
export async function driveInteractiveStepWithInject(page: Page) {
    await page.locator("#int-btn-next").click()
    await page.locator("#int-btn-recognized-yes").waitFor()
    await page.locator("#int-btn-recognized-yes").click()
    await page.locator("#int-btn-heard-yes").click()
    await page.locator("#int-btn-next").click()
}