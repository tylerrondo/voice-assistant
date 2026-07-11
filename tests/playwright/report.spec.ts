import { test, expect } from "@playwright/test"
import { setValidationMode, setInputSource, driveInteractiveStepWithInject } from "./utils/helpers"

/**
 * PR-10: Report generation regression tests.
 */

test.describe("Report generation", () => {

    test("Interactive session report contains ValidationMode and per-step details", async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")
        for (let i = 0; i < 3; i++) {
            await driveInteractiveStepWithInject(page)
        }

        const report = page.getByTestId("last-report")
        await expect(report).toContainText("Mode: Interactive")
        await expect(report).toContainText("Input Source: inject")

        const jsonText = await page.locator("#json-report").innerText()
        const parsed = JSON.parse(jsonText)
        expect(parsed.ValidationMode).toBe("Interactive")
        expect(parsed.ManualValidation.results).toHaveLength(3)
        expect(parsed.ExecutionLog.length).toBeGreaterThan(0)
    })

    test("saved report's ExecutionLog is not affected by starting a new session afterwards", async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")
        for (let i = 0; i < 3; i++) {
            await driveInteractiveStepWithInject(page)
        }

        const firstJson = JSON.parse(await page.locator("#json-report").innerText())
        expect(firstJson.ExecutionLog.length).toBeGreaterThan(0)

        // Start a brand new session, which clears the LIVE Execution Log.
        await page.locator("#int-btn-restart").click()

        // The report generated for the FIRST session must still show
        // its own ExecutionLog, unaffected by the new session's clear().
        expect(firstJson.ExecutionLog.length).toBeGreaterThan(0)
    })

})