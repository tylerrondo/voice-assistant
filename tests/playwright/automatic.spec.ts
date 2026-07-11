import { test, expect } from "@playwright/test"
import { runAll } from "./utils/helpers"

/**
 * PR-10: Automatic mode regression tests. Covers the "Run All" /
 * Inject Action path in more depth than the Smoke Suite.
 */

test.describe("Automatic mode", () => {

    test("Run All completes all 3 built-in scenarios", async ({ page }) => {
        await page.goto("/")
        await runAll(page)
        await expect(page.locator("#verification-result")).toContainText("PASS (3/3)")
    })

    test("Execution Log contains the full Action/Event/Speak chain for every scenario", async ({ page }) => {
        await page.goto("/")
        await runAll(page)
        const log = await page.getByTestId("execution-log").innerText()
        for (const trigger of ["voice.recognized", "interaction.echo", "interaction.delayed"]) {
            expect(log).toContain(trigger)
        }
        expect((log.match(/\[Action\]/g) ?? []).length).toBe(3)
        expect((log.match(/\[Event\]/g) ?? []).length).toBe(3)
        expect((log.match(/\[Speak\]/g) ?? []).length).toBe(3)
    })

    test("Download JSON produces a file after Run All", async ({ page }) => {
        await page.goto("/")
        await runAll(page)
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.locator("#btn-download").click()
        ])
        expect(download.suggestedFilename()).toMatch(/validation-report-.*\.json$/)
    })

})