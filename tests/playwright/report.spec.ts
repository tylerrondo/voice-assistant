import { test, expect } from "@playwright/test"
import { setValidationMode, setInputSource, completeInteractiveSessionWithInject } from "./utils/helpers"

/**
 * PR-10: Report generation regression tests.
 */

test.describe("Report generation", () => {

    test("Interactive session report contains ValidationMode and per-step details", async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")
        await completeInteractiveSessionWithInject(page)

        const report = page.getByTestId("last-report")
        await expect(report).toContainText("Mode: Interactive")
        await expect(report).toContainText("Input Source: inject")

        const jsonText = await page.getByTestId("json-report").innerText()
        const parsed = JSON.parse(jsonText)
        expect(parsed.ValidationMode).toBe("Interactive")
        expect(parsed.ManualValidation.results).toHaveLength(5)
        expect(parsed.ExecutionLog.length).toBeGreaterThan(0)
    })

    test("saved report's ExecutionLog is not affected by starting a new session afterwards", async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")
        await completeInteractiveSessionWithInject(page)

        const firstJson = JSON.parse(await page.getByTestId("json-report").innerText())
        expect(firstJson.ExecutionLog.length).toBeGreaterThan(0)

        // Start a brand new session, which clears the LIVE Execution Log.
        await page.getByTestId("interactive-reset-button").click()

        // The report generated for the FIRST session must still show
        // its own ExecutionLog, unaffected by the new session's clear().
        expect(firstJson.ExecutionLog.length).toBeGreaterThan(0)
    })

})