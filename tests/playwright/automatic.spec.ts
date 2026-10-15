import { test, expect } from "@playwright/test"
import {
    runAll,
    runAllWithProgressTracking,
    readSessionConfig,
    readJsonReport,
    downloadJsonReport,
    dismissNextDialog,
    setupBackendMocks,
    assertRequiredReportSections,
    assertSummaryConsistency,
    assertConfigurationMatchesSession,
    assertExecutionLog,
    assertAutomaticProgressSequence,
    waitForAutomaticRunInProgress,
    setSessionLanguage,
    type ValidationReportJson
} from "./utils/helpers"

/**
 * PR-9e.2 — Playwright Automatic Suite.
 *
 * Covers Automatic Runner end-to-end through the public Validation Bench
 * UI and JSON report surface only. Uses Inject Action (no microphone).
 */

test.describe("PR-9e.2 Automatic Suite", () => {

    test.beforeEach(async ({ page }) => {
        await page.goto("/")
        await setSessionLanguage(page, "en-US")
        await expect(page.getByTestId("validation-mode")).toHaveValue("automatic")
    })

    test.describe("1. Scenario execution", () => {

        test("Run All completes every built-in scenario and produces a report", async ({ page }) => {
            const config = await readSessionConfig(page)

            await runAll(page)

            await expect(page.getByTestId("verification-panel")).toContainText(/PASS/)
            const report = await readJsonReport(page)
            expect(report.Summary.totalScenarios).toBeGreaterThan(0)
            expect(report.Summary.passed).toBe(report.Summary.totalScenarios)
            expect(report.Summary.failed).toBe(0)
            expect(report.Session.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
            assertConfigurationMatchesSession(report, config)
        })

    })

    test.describe("2. Progress", () => {

        test("progress moves from idle through running scenarios to Done", async ({ page }) => {
            expect(await page.getByTestId("automatic-progress").innerText()).toBe("—")

            const states = await runAllWithProgressTracking(page)
            assertAutomaticProgressSequence(states)
        })

    })

    test.describe("3. Execution Log", () => {

        test("log is created automatically with ordered Action entries", async ({ page }) => {
            await runAll(page)

            const logText = await page.getByTestId("execution-log").innerText()
            expect(logText.trim().length).toBeGreaterThan(0)

            const report = await readJsonReport(page)
            assertExecutionLog(report, logText)
        })

    })

    test.describe("4. Report sections", () => {

        test("report contains Session, Configuration, Summary, Verification, and Execution Log", async ({ page }) => {
            await runAll(page)

            const report = await readJsonReport(page)
            assertRequiredReportSections(report)

            expect(typeof report.Session.tester).toBe("string")
            expect(typeof report.TestConfiguration.recognitionProvider).toBe("string")
            expect(typeof report.Summary.status).toBe("string")
            expect(typeof report.Verification.totalScenarios).toBe("number")
            expect(report.ExecutionLog.length).toBeGreaterThan(0)
        })

    })

    test.describe("5. Summary consistency", () => {

        test("Summary totals are internally consistent with Verification", async ({ page }) => {
            await runAll(page)

            const report = await readJsonReport(page)
            assertSummaryConsistency(report)
        })

    })

    test.describe("6. Configuration", () => {

        test("report preserves the launch configuration from Session Panel", async ({ page }) => {
            await page.getByTestId("session-voice-language").selectOption("ru-RU")
            await page.getByTestId("session-recognition-provider").selectOption("OpenAI")
            await page.getByTestId("session-speech-provider").selectOption("Azure")
            await page.getByTestId("session-scenario-set").selectOption("upload")

            const config = await readSessionConfig(page)
            await runAll(page)

            const report = await readJsonReport(page)
            assertConfigurationMatchesSession(report, config)
        })

    })

    test.describe("7. Verification", () => {

        test("verification results exist and match the scenario count", async ({ page }) => {
            await runAll(page)

            const report = await readJsonReport(page)
            expect(report.Verification.totalScenarios).toBe(report.Summary.totalScenarios)
            expect(report.Verification.passed + report.Verification.failed).toBe(report.Verification.totalScenarios)
            expect(Array.isArray(report.Verification.errors)).toBe(true)
            expect(report.Verification.errors.length).toBe(0)

            await expect(page.getByTestId("verification-panel")).toContainText(
                new RegExp(`PASS \\(${report.Verification.passed}/${report.Verification.totalScenarios}\\)`)
            )
        })

    })

    test.describe("8. Download JSON", () => {

        test("download produces valid JSON matching the on-screen report structure", async ({ page }) => {
            await runAll(page)

            const uiReport = await readJsonReport(page)
            const downloaded = await downloadJsonReport(page)

            expect(downloaded).toEqual(uiReport)
            assertRequiredReportSections(downloaded)
            assertSummaryConsistency(downloaded)
        })

    })

    test.describe("9. Send Report", () => {

        test("Send Report transmits the same object as Download JSON", async ({ page }) => {
            const capture: { sentReport?: ValidationReportJson } = {}
            await setupBackendMocks(page, capture)

            await page.getByTestId("connect-button").click()
            await expect(page.getByTestId("connection-status")).toContainText("Connected")

            await runAll(page)
            const uiReport = await readJsonReport(page)
            const downloaded = await downloadJsonReport(page)

            const dialogPromise = dismissNextDialog(page)
            await page.getByTestId("send-report-button").click()
            expect(await dialogPromise).toBe("alert")

            expect(capture.sentReport).toBeTruthy()
            expect(capture.sentReport).toEqual(uiReport)
            expect(capture.sentReport).toEqual(downloaded)
        })

    })

    test.describe("10. Second Run All after completion", () => {

        test("second Run All resets progress text while keeping the last completed report visible", async ({ page }) => {
            await runAll(page)

            const firstReport = await readJsonReport(page)
            const firstPreview = await page.getByTestId("last-report").innerText()
            expect(firstPreview.length).toBeGreaterThan(0)
            expect(await page.getByTestId("automatic-progress").innerText()).toBe("Done")

            await page.getByTestId("run-all-button").click()

            await expect.poll(async () => {
                return await page.getByTestId("automatic-progress").innerText()
            }).toMatch(/^Running scenario 1 of \d+$/)

            expect(await page.getByTestId("last-report").innerText()).toBe(firstPreview)

            // NOTE: verification-panel's PASS/FAIL text is never cleared
            // between runs — it's only overwritten when a run finishes.
            // So on a *second* run, `.getByText(/PASS|FAIL/).waitFor()`
            // would resolve immediately against the *first* run's
            // still-present text, before the second run actually
            // finishes (this raced silently with the old, near-instant
            // 3-scenario builtin set; PR-13's 5-scenario set, which
            // includes real `delay` steps, makes the race consistently
            // visible). run-all-button re-enabling is a reliable,
            // non-stale signal that a run has actually completed.
            await expect(page.getByTestId("run-all-button")).toBeEnabled({ timeout: 30_000 })
            expect(await page.getByTestId("automatic-progress").innerText()).toBe("Done")

            const secondReport = await readJsonReport(page)
            const secondLogText = await page.getByTestId("execution-log").innerText()
            assertExecutionLog(secondReport, secondLogText)
            assertSummaryConsistency(secondReport)
            expect(secondReport.Summary.totalScenarios).toBe(firstReport.Summary.totalScenarios)
            await expect(page.getByTestId("last-report")).not.toBeEmpty()
        })

    })

    test.describe("11. Negative scenarios", () => {

        test("blocks a second Run All while the first automatic cycle is still running", async ({ page }) => {
            const started = page.getByTestId("run-all-button").click()
            await waitForAutomaticRunInProgress(page)

            await expect(page.getByTestId("run-all-button")).toBeDisabled()
            await expect(page.getByTestId("start-button")).toBeDisabled()
            await expect(page.getByTestId("stop-button")).toBeDisabled()
            await expect(page.getByTestId("inject-send-button")).toBeDisabled()

            // Simulates a rapid second click reaching the handler while locked.
            await page.getByTestId("run-all-button").dispatchEvent("click")

            await started
            await page.getByTestId("verification-panel").getByText(/PASS|FAIL/).waitFor({ timeout: 30_000 })

            await expect(page.getByTestId("run-all-button")).toBeEnabled()
            await expect(page.getByTestId("start-button")).toBeEnabled()
            await expect(page.getByTestId("stop-button")).toBeEnabled()
            await expect(page.getByTestId("inject-send-button")).toBeEnabled()

            const report = await readJsonReport(page)
            const logText = await page.getByTestId("execution-log").innerText()
            assertExecutionLog(report, logText)
            assertSummaryConsistency(report)
        })

        test("Start remains disabled while Run All is in progress", async ({ page }) => {
            await page.getByTestId("run-all-button").click()
            await waitForAutomaticRunInProgress(page)
            await expect(page.getByTestId("start-button")).toBeDisabled()
            await page.getByTestId("verification-panel").getByText(/PASS|FAIL/).waitFor({ timeout: 30_000 })
        })

        test("Stop remains disabled while Run All is in progress", async ({ page }) => {
            await page.getByTestId("run-all-button").click()
            await waitForAutomaticRunInProgress(page)
            await expect(page.getByTestId("stop-button")).toBeDisabled()
            await page.getByTestId("verification-panel").getByText(/PASS|FAIL/).waitFor({ timeout: 30_000 })
        })

        test("Download Report before any report exists fails safely", async ({ page }) => {
            const dialogPromise = dismissNextDialog(page)
            await page.getByTestId("download-json-button").click()
            expect(await dialogPromise).toBe("alert")
            await expect(page.getByTestId("json-report")).toBeEmpty()
        })

        test("Send Report before any report exists fails safely", async ({ page }) => {
            const dialogPromise = dismissNextDialog(page)
            await page.getByTestId("send-report-button").click()
            expect(await dialogPromise).toBe("alert")
            await expect(page.getByTestId("json-report")).toBeEmpty()
        })

    })

})
