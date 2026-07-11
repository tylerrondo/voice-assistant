import { test, expect } from "@playwright/test"
import { setValidationMode, setInputSource, runAll } from "./utils/helpers"

/**
 * PR-10 Smoke Suite.
 *
 * These 7 tests check that the Validation Bench loads and its core
 * controls work, WITHOUT requiring a real microphone (Playwright has
 * no physical mic and the Web Speech API is unreliable/unavailable
 * under automation) — that is covered separately by manual QA per
 * PR-9d.2's checklist. Smoke tests use Automatic mode and Interactive
 * mode with Input Source = Inject Action, both of which are fully
 * scriptable.
 */

test.describe("Smoke Suite", () => {

    test("1. page loads and shows Validation Bench", async ({ page }) => {
        await page.goto("/")
        await expect(page.getByRole("heading", { name: "Validation Bench" })).toBeVisible()
    })

    test("2. Session Panel has sensible default values", async ({ page }) => {
        await page.goto("/")
        await expect(page.locator("#s-tester")).toHaveValue("Tester-1")
        await expect(page.locator("#s-language")).toHaveValue("en-US")
        await expect(page.locator("#s-backend-url")).toHaveValue(/ibronevik\.ru/)
        await expect(page.locator("#s-login")).not.toHaveValue("")
    })

    test("3. switching to Interactive mode reveals Input Source and Interactive Runner", async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await expect(page.locator("#input-source-row")).toBeVisible()
        await expect(page.getByTestId("interactive-runner")).toBeVisible()
    })

    test("4. Input Source toggles Inject/Mic controls correctly", async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")
        await expect(page.locator("#inject-controls")).toBeVisible()
        await expect(page.locator("#mic-controls")).toBeHidden()

        await setInputSource(page, "mic")
        await expect(page.locator("#mic-controls")).toBeVisible()
        await expect(page.locator("#inject-controls")).toBeHidden()
    })

    test("5. Run All (Automatic) passes and populates the Execution Log", async ({ page }) => {
        await page.goto("/")
        await runAll(page)
        await expect(page.locator("#verification-result")).toContainText("PASS")
        await expect(page.getByTestId("execution-log")).toContainText("voice.recognized")
    })

    test("6. required data-testid hooks exist for automated testing", async ({ page }) => {
        await page.goto("/")
        for (const testId of [
            "interactive-runner",
            "execution-log",
            "last-report",
            "manual-comment",
            "session-state",
            "current-step",
            "progress-value",
            "recognized-text",
            "speech-text"
        ]) {
            await expect(page.getByTestId(testId)).toHaveCount(1)
        }
    })

    test("7. after Run All, Last Completed Report shows Automatic mode config", async ({ page }) => {
        await page.goto("/")
        await runAll(page)
        const report = page.getByTestId("last-report")
        await expect(report).toContainText("Mode: Automatic")
        await expect(report).toContainText("Input Source: inject")
        await expect(report).toContainText("Recognition: Browser")
    })

})