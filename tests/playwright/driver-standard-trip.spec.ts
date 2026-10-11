import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { test, expect } from "@playwright/test"
import {
    setValidationMode,
    setInputSource,
    setSessionLanguage,
    runAll,
    readJsonReport,
    assertExecutionLog,
    assertRequiredReportSections
} from "./utils/helpers"

/**
 * PR-13: Playwright coverage for the "Driver Standard Trip" scenario
 * (Platform Scenario Specification v2.0), which is the built-in
 * scenario set as of PR-13 (packages/scenario-engine/src/scenarios/builtin.json).
 *
 * This is the first test that verifies scenario *execution*
 * end-to-end, not just interface state. It does not test STT, TTS,
 * recognition quality, the microphone, or the Browser Speech API —
 * only that Validation Bench runs the scenario correctly and reports
 * on it correctly.
 *
 * All assertions use page.getByTestId(...) exclusively (PR-12 contract).
 *
 * Per review: this test does NOT hardcode the step count, the trigger
 * list, or the scenario id/name — it reads builtin.json directly and
 * derives everything from it, so it keeps passing if
 * driver-standard-trip.json legitimately grows/shrinks, and only
 * breaks if the app's actual behavior stops matching the file it is
 * supposed to be running.
 *
 * Per review: state assertions use the `data-state` attribute (the
 * literal StepState value: idle/running/waiting-tester/finished),
 * not visible text — that text isn't currently localized either, but
 * asserting the attribute is the deliberate, stable contract rather
 * than something that merely happens not to be translated today.
 * "PASS"/"FAIL" are asserted from the JSON report's Summary.status
 * field, not the rendered panel text, for the same reason.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILTIN_SCENARIO_PATH = path.join(
    __dirname, "..", "..", "packages", "scenario-engine", "src", "scenarios", "builtin.json"
)

interface ScenarioSetEntryLike {
    id?: string
    name: string
    trigger?: string
    activation?: { type: string; value: string }
}
interface ScenarioSetLike {
    id: string
    name: string
    scenarios: ScenarioSetEntryLike[]
}

function triggerOf(entry: ScenarioSetEntryLike): string {
    return entry.activation?.value ?? entry.trigger ?? ""
}

function loadBuiltinScenarioSet(): ScenarioSetLike {
    const raw = readFileSync(BUILTIN_SCENARIO_PATH, "utf-8")
    return JSON.parse(raw)
}

// Ground truth for every assertion below — read from the actual file
// the app ships, not duplicated as literals in this test.
const BUILTIN_SET = loadBuiltinScenarioSet()
const TRIGGERS_IN_ORDER = BUILTIN_SET.scenarios.map(triggerOf)
const TOTAL = TRIGGERS_IN_ORDER.length

test.describe("PR-13: Driver Standard Trip scenario coverage", () => {

    test.describe("Automatic", () => {

        test("runs the full scenario end to end and produces a correct report", async ({ page }) => {
            await page.goto("/")
            await setSessionLanguage(page, "en-US")

            // Precondition: Scenario Source = Built-in, active set = Driver Standard Trip.
            await expect(page.getByTestId("scenario-source-builtin")).toBeChecked()
            await expect(page.getByTestId("scenario-file-name")).toHaveText("builtin.json")
            await expect(page.getByTestId("validation-mode")).toHaveValue("automatic")

            await runAll(page)

            // Run All button re-enabling is a stable, non-text signal
            // that the run has finished (no "Done" text dependency).
            await expect(page.getByTestId("run-all-button")).toBeEnabled()

            const report = await readJsonReport(page)
            assertRequiredReportSections(report)

            // Cross-check: the report's scenario count actually matches
            // what's in builtin.json — not just an internally-consistent
            // number the app made up.
            expect(report.Summary.totalScenarios).toBe(TOTAL)

            const logText = await page.getByTestId("execution-log").innerText()
            assertExecutionLog(report, logText)
            assertStrictTriggerOrder(logText, TRIGGERS_IN_ORDER)

            // JSON Report metadata — compared against the file's own
            // id/name, not literal strings.
            expect(report.ScenarioSource).toBe("builtin")
            expect(report.ScenarioId).toBe(BUILTIN_SET.id)
            expect(report.ScenarioName).toBe(BUILTIN_SET.name)
            expect(report.ScenarioFile).toBeNull()

            // PASS for the whole set — from the JSON field, not rendered text.
            expect(report.Summary.status).toBe("PASS")
            expect(report.Summary.passed).toBe(TOTAL)
            expect(report.Summary.failed).toBe(0)
        })

    })

    test.describe("Interactive", () => {

        test("runs the full scenario end to end, updating state after every step", async ({ page }) => {
            await page.goto("/")
            await setSessionLanguage(page, "en-US")
            await setValidationMode(page, "interactive")
            await setInputSource(page, "inject")

            // Selecting Interactive starts the session immediately (no
            // separate "idle" state to wait through): step 1 is loaded
            // and the controller is already "running".
            await expect(page.getByTestId("session-state")).toHaveAttribute("data-state", "running")
            await expect(page.getByTestId("current-step")).toHaveText(`1 / ${TOTAL}`)
            await expect(page.getByTestId("progress-value")).toHaveText("0%")

            // First "Next Step" click performs step 1 (injects its
            // action) and moves the controller to "waiting-tester".
            await page.getByTestId("interactive-next-button").click()
            await page.getByTestId("manual-recognized-yes-button").waitFor()
            await expect(page.getByTestId("session-state")).toHaveAttribute("data-state", "waiting-tester")
            await expect(page.getByTestId("current-step")).toHaveText(`1 / ${TOTAL}`)

            let logText = await page.getByTestId("execution-log").innerText()
            expect(logText).toContain(TRIGGERS_IN_ORDER[0])
            let previousLogLength = countNonEmptyLines(logText)

            for (let i = 0; i < TOTAL; i++) {
                await page.getByTestId("manual-recognized-yes-button").click()
                await page.getByTestId("manual-heard-yes-button").click()
                await page.getByTestId("interactive-next-button").click()

                const isLast = i === TOTAL - 1

                if (isLast) {
                    // Committing the last scenario finishes the session.
                    await expect(page.getByTestId("session-state")).toHaveAttribute("data-state", "finished")
                    await expect(page.getByTestId("current-step")).toHaveText(`${TOTAL} / ${TOTAL}`)
                    await expect(page.getByTestId("progress-value")).toHaveText("100%")
                } else {
                    // Every non-final "Next Step" both commits the
                    // current scenario AND auto-starts the next one, so
                    // confirmation buttons for the next step appear
                    // without an extra click.
                    await page.getByTestId("manual-recognized-yes-button").waitFor()
                    await expect(page.getByTestId("session-state")).toHaveAttribute("data-state", "waiting-tester")
                    await expect(page.getByTestId("current-step")).toHaveText(`${i + 2} / ${TOTAL}`)
                    await expect(page.getByTestId("progress-value")).toHaveText(`${Math.round((i + 1) / TOTAL * 100)}%`)
                }

                // Execution Log grew and now contains this step's trigger.
                logText = await page.getByTestId("execution-log").innerText()
                const currentLogLength = countNonEmptyLines(logText)
                expect(currentLogLength).toBeGreaterThan(previousLogLength)
                expect(logText).toContain(TRIGGERS_IN_ORDER[i])
                previousLogLength = currentLogLength
            }

            const report = await readJsonReport(page)
            expect(report.ScenarioSource).toBe("builtin")
            expect(report.ScenarioId).toBe(BUILTIN_SET.id)
            expect(report.ScenarioName).toBe(BUILTIN_SET.name)
            expect(report.ScenarioFile).toBeNull()
        })

    })

    test("Execution Log preserves strict scenario order in both modes", async ({ page }) => {
        await page.goto("/")
        await setSessionLanguage(page, "en-US")

        await runAll(page)
        const automaticLog = await page.getByTestId("execution-log").innerText()
        assertStrictTriggerOrder(automaticLog, TRIGGERS_IN_ORDER)

        await page.goto("/")
        await setSessionLanguage(page, "en-US")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")

        for (let i = 0; i < TOTAL; i++) {
            await page.getByTestId("interactive-next-button").click()
            await page.getByTestId("manual-recognized-yes-button").waitFor()
            await page.getByTestId("manual-recognized-yes-button").click()
            await page.getByTestId("manual-heard-yes-button").click()
        }
        await page.getByTestId("interactive-next-button").click()

        const interactiveLog = await page.getByTestId("execution-log").innerText()
        assertStrictTriggerOrder(interactiveLog, TRIGGERS_IN_ORDER)
    })

    test("running the scenario twice does not leak Execution Log state between runs", async ({ page }) => {
        await page.goto("/")
        await setSessionLanguage(page, "en-US")

        await runAll(page)
        const firstReport = await readJsonReport(page)

        await runAll(page)
        const secondReport = await readJsonReport(page)
        const secondLog = await page.getByTestId("execution-log").innerText()

        // Results are consistent across runs.
        expect(secondReport.Summary.status).toBe(firstReport.Summary.status)
        expect(secondReport.Summary.totalScenarios).toBe(firstReport.Summary.totalScenarios)
        expect(secondReport.ScenarioId).toBe(firstReport.ScenarioId)

        // The second run's live Execution Log is a fresh log with
        // exactly TOTAL actions, not the first run's entries plus new ones.
        const secondActionLines = secondLog.split("\n").filter(l => l.includes("[Action]"))
        expect(secondActionLines.length).toBe(TOTAL)
        assertStrictTriggerOrder(secondLog, TRIGGERS_IN_ORDER)
    })

    test("Reset clears Interactive session state completely and restarts from the first scenario", async ({ page }) => {
        await page.goto("/")
        await setSessionLanguage(page, "en-US")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")

        for (let i = 0; i < TOTAL; i++) {
            await page.getByTestId("interactive-next-button").click()
            await page.getByTestId("manual-recognized-yes-button").waitFor()
            await page.getByTestId("manual-recognized-yes-button").click()
            await page.getByTestId("manual-heard-yes-button").click()
        }
        await page.getByTestId("interactive-next-button").click()
        await expect(page.getByTestId("session-state")).toHaveAttribute("data-state", "finished")

        await page.getByTestId("interactive-reset-button").click()

        // Reset restarts the session immediately — it re-enters the same
        // state a fresh "switch to Interactive" produces (see the test
        // above), not a separate idle state.
        await expect(page.getByTestId("session-state")).not.toHaveAttribute("data-state", "finished")
        await expect(page.getByTestId("session-state")).toHaveAttribute("data-state", "running")
        await expect(page.getByTestId("current-step")).toHaveText(`1 / ${TOTAL}`)
        await expect(page.getByTestId("progress-value")).toHaveText("0%")

        // Execution Log was cleared and now only has the marker for the
        // freshly loaded first scenario — no [Action] entries yet (step 1
        // hasn't been performed again), and nothing from the finished run.
        const logAfterReset = await page.getByTestId("execution-log").innerText()
        expect(logAfterReset).not.toContain("[Action]")
        expect(logAfterReset).toContain(TRIGGERS_IN_ORDER[0])
        expect(logAfterReset).not.toContain(TRIGGERS_IN_ORDER[TOTAL - 1])

        // A new run starts from the first scenario again.
        await page.getByTestId("interactive-next-button").click()
        await page.getByTestId("manual-recognized-yes-button").waitFor()
        await expect(page.getByTestId("current-step")).toHaveText(`1 / ${TOTAL}`)
        const logText = await page.getByTestId("execution-log").innerText()
        expect(logText).toContain("[Action]")
        expect(logText).toContain(TRIGGERS_IN_ORDER[0])
        expect(logText).not.toContain(TRIGGERS_IN_ORDER[TOTAL - 1])
    })

    // --- Negative-path coverage: NOT implemented, see docs/rfc/PR-13.md ---
    //
    // Per review, a negative test ("one step is broken -> FAIL is
    // reported -> execution stops correctly") was requested. This is
    // intentionally NOT written here: Validation Bench's Automatic
    // verification currently has no real per-scenario pass/fail
    // evaluation at all. `verification.passed` is unconditionally set
    // to `totalScenarios` and `failed` to `0` (see App.ts, the Run All
    // handler) — there is no code path that ever produces FAIL. Writing
    // a test that asserts "FAIL is reported" against that code would
    // either be a no-op that can never fail, or would require silently
    // adding fake failure-detection logic as a side effect of a test
    // file, which would misrepresent what this PR actually covers.
    // A real negative test needs a prerequisite change to the
    // Automatic verification pipeline (an actual pass/fail check per
    // scenario) — flagged as follow-up, not implemented here.

})

/** Asserts that each trigger's [Action] entry appears in the given order in the log text. */
function assertStrictTriggerOrder(logText: string, triggersInOrder: string[]) {
    const lines = logText.split("\n").filter(l => l.trim().length > 0)
    let lastIndex = -1
    for (const trigger of triggersInOrder) {
        const index = lines.findIndex(line => line.includes("[Action]") && line.includes(trigger))
        expect(index).toBeGreaterThan(lastIndex)
        lastIndex = index
    }
}

function countNonEmptyLines(text: string): number {
    return text.split("\n").filter(l => l.trim().length > 0).length
}
