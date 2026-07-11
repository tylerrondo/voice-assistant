import { test, expect } from "@playwright/test"
import { setValidationMode, setInputSource, driveInteractiveStepWithInject } from "./utils/helpers"

/**
 * PR-10: Interactive mode regression tests.
 *
 * Uses Input Source = Inject Action so the full Interactive Runner
 * flow (Start/Next Step, confirmation buttons, Session Summary,
 * Restart) can be driven deterministically in CI, without depending
 * on a real microphone or Web Speech API availability.
 */

test.describe("Interactive mode (Inject Action)", () => {

    test.beforeEach(async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")
    })

    test("completes all 3 steps and shows a finished session", async ({ page }) => {
        for (let i = 0; i < 3; i++) {
            await driveInteractiveStepWithInject(page)
        }
        await expect(page.getByTestId("session-state")).toHaveText("finished")
        await expect(page.getByTestId("current-step")).toHaveText("3 / 3")
        await expect(page.getByTestId("progress-value")).toHaveText("100%")
    })

    test("Session Summary shows 3 fully confirmed scenarios with no repeats/skips", async ({ page }) => {
        for (let i = 0; i < 3; i++) {
            await driveInteractiveStepWithInject(page)
        }
        const summary = page.locator("#int-summary-content")
        await expect(summary).toContainText("Подтверждено полностью: 3")
        await expect(summary).toContainText("Повторов: 0")
        await expect(summary).toContainText("Пропущено: 0")
    })

    test("Start New Session resets the Runner back to step 1", async ({ page }) => {
        for (let i = 0; i < 3; i++) {
            await driveInteractiveStepWithInject(page)
        }
        await page.locator("#int-btn-restart").click()
        await expect(page.getByTestId("current-step")).toHaveText("1 / 3")
        await expect(page.getByTestId("session-state")).not.toHaveText("finished")
    })

    test("Skip Step marks the step as skipped in the summary", async ({ page }) => {
        await page.locator("#int-btn-skip").click()
        await page.locator("#int-btn-skip").click()
        await page.locator("#int-btn-skip").click()
        const summary = page.locator("#int-summary-content")
        await expect(summary).toContainText("Пропущено: 3")
    })

})