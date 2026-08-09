import { expect, type Page } from "@playwright/test"
import fs from "node:fs/promises"

/**
 * Shared Playwright helpers for Validation Bench specs.
 * Tests interact only through the public UI and JSON report surface.
 */

export interface SessionConfig {
    tester: string
    uiLanguage: string
    voiceLanguage: string
    recognitionProvider: string
    speechProvider: string
    scenarioSet: string
    validationMode: string
}

export interface ValidationReportJson {
    Session: {
        tester: string
        language: string
        uiLanguage?: string
        startedAt: string
    }
    TestConfiguration: {
        recognitionProvider: string
        speechProvider: string
        scenarioSet: string
        inputSource: string
    }
    ValidationMode: string
    // PR-11: External JSON Scenarios
    ScenarioSource?: "builtin" | "file"
    ScenarioId?: string
    ScenarioName?: string
    ScenarioFile?: string | null
    Verification: {
        totalScenarios: number
        passed: number
        failed: number
        errors: unknown[]
    }
    ExecutionLog: Array<{ kind: string; payload: unknown }>
    Summary: {
        status: string
        totalScenarios: number
        passed: number
        failed: number
        skippedSteps: number
        durationMs: number
    }
}

// PR-13: builtin.json is now the Driver Standard Trip scenario set
// (5 scenarios, in this fixed order). Update this if builtin.json changes.
const SCENARIO_TRIGGERS = [
    "voice.accept-order",
    "voice.arrived",
    "voice.start-trip",
    "voice.finish-trip",
    "voice.available"
]

/** Switches the top-level Validation Mode dropdown. */
export async function setValidationMode(page: Page, mode: "automatic" | "interactive") {
    await page.getByTestId("validation-mode").selectOption(mode)
}

/** Switches Input Source (only visible in Interactive mode). */
export async function setInputSource(page: Page, source: "mic" | "inject") {
    await page.getByTestId("input-source").selectOption(source)
}

/** Switches Session Panel UI language (BCP-47 tag). */
export async function setUiLanguage(page: Page, language: string) {
    await page.getByTestId("session-ui-language").selectOption(language)
}

/** Switches Session Panel voice language (STT/TTS/prompts). */
export async function setVoiceLanguage(page: Page, language: string) {
    await page.getByTestId("session-voice-language").selectOption(language)
}

/** @deprecated Use setVoiceLanguage for voice or setUiLanguage for UI. */
export async function setSessionLanguage(page: Page, language: string) {
    await setVoiceLanguage(page, language)
    await setUiLanguage(page, language)
}

/** Reads the current Session Panel configuration from the UI. */
export async function readSessionConfig(page: Page): Promise<SessionConfig> {
    return {
        tester: await page.getByTestId("session-tester").inputValue(),
        uiLanguage: await page.getByTestId("session-ui-language").inputValue(),
        voiceLanguage: await page.getByTestId("session-voice-language").inputValue(),
        recognitionProvider: await page.getByTestId("session-recognition-provider").inputValue(),
        speechProvider: await page.getByTestId("session-speech-provider").inputValue(),
        scenarioSet: await page.getByTestId("session-scenario-set").inputValue(),
        validationMode: await page.getByTestId("validation-mode").inputValue()
    }
}

/** Parses a public Automatic-mode progress label, if present. */
export function parseRunningScenarioProgress(text: string): { current: number; total: number } | null {
    const match = text.match(/^Running scenario (\d+) of (\d+)$/)
    if (!match) return null
    return { current: Number(match[1]), total: Number(match[2]) }
}

/**
 * Runs Automatic "Run All" and waits until verification completes.
 *
 * Uses run-all-button re-enabling as the completion signal, not
 * verification-panel's PASS/FAIL text — that text is never cleared
 * between runs, so on a *second* call within the same test it would
 * otherwise match the *previous* run's leftover text immediately,
 * before the new run has actually finished.
 */
export async function runAll(page: Page) {
    await page.getByTestId("run-all-button").click()
    // PR-13's 5-scenario builtin set includes real `delay` steps, so a
    // full Automatic run can take longer than Playwright's default 5s
    // expect() timeout — matches the 30s timeout already used elsewhere
    // in this file for the same kind of wait.
    await expect(page.getByTestId("run-all-button")).toBeEnabled({ timeout: 30_000 })
}

/**
 * Runs "Run All" while recording the public #obs-progress text states.
 */
export async function runAllWithProgressTracking(page: Page): Promise<string[]> {
    const snapshots: string[] = []

    const record = async () => {
        const text = await page.getByTestId("automatic-progress").innerText()
        if (snapshots[snapshots.length - 1] !== text) {
            snapshots.push(text)
        }
    }

    await record()
    await page.getByTestId("run-all-button").click()

    await expect.poll(async () => {
        await record()
        return await page.getByTestId("automatic-progress").innerText()
    }, { timeout: 30_000 }).toBe("Done")

    await record()
    return snapshots
}

/** Asserts Automatic-mode progress follows the public UI state sequence. */
export function assertAutomaticProgressSequence(states: string[]) {
    expect(states[0]).toBe("—")
    expect(states[states.length - 1]).toBe("Done")
    expect(states).toContain("Done")

    const runningStates = states.filter((state) => parseRunningScenarioProgress(state) !== null)
    expect(runningStates.length).toBeGreaterThan(0)

    const scenarioNumbers = runningStates.map((state) => parseRunningScenarioProgress(state)!.current)
    for (let i = 1; i < scenarioNumbers.length; i++) {
        expect(scenarioNumbers[i]).toBeGreaterThanOrEqual(scenarioNumbers[i - 1])
    }
}

/** Waits until Automatic Run All shows an in-progress public progress state. */
export async function waitForAutomaticRunInProgress(page: Page) {
    await expect.poll(async () => {
        return await page.getByTestId("automatic-progress").innerText()
    }).toMatch(/^Running scenario \d+ of \d+$/)
}

/** Counts Action entries currently visible in the Execution Log panel. */
export async function countActionLogEntries(page: Page): Promise<number> {
    const logText = await page.getByTestId("execution-log").innerText()
    return (logText.match(/\[Action\]/g) ?? []).length
}

/** Reads the structured JSON report rendered in the public report panel. */
export async function readJsonReport(page: Page): Promise<ValidationReportJson> {
    const text = await page.getByTestId("json-report").innerText()
    expect(text.trim().length).toBeGreaterThan(0)
    return JSON.parse(text) as ValidationReportJson
}

/** Downloads the JSON report through the public Download button. */
export async function downloadJsonReport(page: Page): Promise<ValidationReportJson> {
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("download-json-button").click()
    ])
    expect(download.suggestedFilename()).toMatch(/validation-report-.*\.json$/)
    const filePath = await download.path()
    expect(filePath).toBeTruthy()
    const content = await fs.readFile(filePath!, "utf-8")
    return JSON.parse(content) as ValidationReportJson
}

/** Registers a one-shot handler that dismisses the next browser dialog. */
export function dismissNextDialog(page: Page): Promise<string | null> {
    return new Promise((resolve) => {
        page.once("dialog", async (dialog) => {
            const type = dialog.type()
            await dialog.dismiss()
            resolve(type)
        })
    })
}

/**
 * Mocks backend endpoints so Send Report can be exercised in CI without
 * real network credentials. Captures the report payload from the send call.
 */
export async function setupBackendMocks(page: Page, capture: { sentReport?: ValidationReportJson }) {
    await page.route("**/api/v1/auth", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ auth_hash: "test-auth-hash" })
        })
    })

    await page.route("**/api/v1/token", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: { token: "test-token", u_hash: "test-u-hash" } })
        })
    })

    await page.route("**/api/v1/data/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: { data: { site_emails: { "email-1": {} } } } })
        })
    })

    await page.route("**/api/v1/mail/**/send/**", async (route) => {
        const postData = route.request().postData() ?? ""
        const params = new URLSearchParams(postData)
        const fileParam = params.get("file")

        if (fileParam) {
            const files = JSON.parse(fileParam) as Array<{ base64: string; name: string }>
            const base64 = files[0]?.base64?.replace(/^data:.*?;base64,/, "")
            if (base64) {
                capture.sentReport = JSON.parse(
                    Buffer.from(base64, "base64").toString("utf-8")
                ) as ValidationReportJson
            }
        }

        await route.fulfill({ status: 200, body: "{}" })
    })
}

/** Asserts the canonical report sections required by the PR-9e.2 spec. */
export function assertRequiredReportSections(report: ValidationReportJson) {
    expect(report.Session).toBeTruthy()
    expect(report.TestConfiguration).toBeTruthy()
    expect(report.Summary).toBeTruthy()
    expect(report.Verification).toBeTruthy()
    expect(Array.isArray(report.ExecutionLog)).toBe(true)
}

/** Asserts Summary and Verification numbers are internally consistent. */
export function assertSummaryConsistency(report: ValidationReportJson) {
    const { Summary, Verification } = report

    expect(Summary.totalScenarios).toBe(Verification.totalScenarios)
    expect(Summary.passed).toBe(Verification.passed)
    expect(Summary.failed).toBe(Verification.failed)
    expect(Summary.passed + Summary.failed + Summary.skippedSteps).toBe(Summary.totalScenarios)
    expect(Summary.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof Summary.status).toBe("string")
    expect(Summary.status.length).toBeGreaterThan(0)
}

/** Asserts Session configuration values were copied into the report. */
export function assertConfigurationMatchesSession(
    report: ValidationReportJson,
    config: SessionConfig
) {
    expect(report.Session.language).toBe(config.voiceLanguage)
    expect(report.Session.uiLanguage).toBe(config.uiLanguage)
    expect(report.TestConfiguration.recognitionProvider).toBe(config.recognitionProvider)
    expect(report.TestConfiguration.speechProvider).toBe(config.speechProvider)
    expect(report.TestConfiguration.scenarioSet).toBe(config.scenarioSet)
    expect(report.ValidationMode.toLowerCase()).toBe(config.validationMode)
    expect(report.TestConfiguration.inputSource).toBe("inject")
}

/** Asserts Execution Log ordering and cardinality for Automatic mode. */
export function assertExecutionLog(report: ValidationReportJson, logText: string) {
    expect(report.ExecutionLog.length).toBeGreaterThan(0)

    const lines = logText.split("\n").filter((line) => line.trim().length > 0)
    const actionLines = lines.filter((line) => line.includes("[Action]"))
    expect(actionLines.length).toBe(report.Summary.totalScenarios)

    for (const trigger of SCENARIO_TRIGGERS.slice(0, report.Summary.totalScenarios)) {
        expect(logText).toContain(trigger)

        const matchingActions = actionLines.filter((line) => line.includes(trigger))
        expect(matchingActions.length).toBe(1)
    }

    let lastActionIndex = -1
    for (const trigger of SCENARIO_TRIGGERS.slice(0, report.Summary.totalScenarios)) {
        const actionIndex = lines.findIndex((line) => line.includes("[Action]") && line.includes(trigger))
        expect(actionIndex).toBeGreaterThan(lastActionIndex)
        lastActionIndex = actionIndex

        const eventIndex = lines.findIndex(
            (line, index) => index > actionIndex && line.includes("[Event]")
        )
        expect(eventIndex).toBeGreaterThan(actionIndex)

        const speakIndex = lines.findIndex(
            (line, index) => index > eventIndex && line.includes("[Speak]")
        )
        expect(speakIndex).toBeGreaterThan(eventIndex)
    }
}

/**
 * Drives an entire Interactive session (Input Source = Inject Action)
 * with the correct click pattern for the Runner state machine.
 */
export async function completeInteractiveSessionWithInject(page: Page, steps = 5) {
    await page.getByTestId("interactive-next-button").click()

    for (let i = 0; i < steps; i++) {
        await page.getByTestId("manual-recognized-yes-button").waitFor()
        await page.getByTestId("manual-recognized-yes-button").click()
        await page.getByTestId("manual-heard-yes-button").click()
        await page.getByTestId("interactive-next-button").click()
    }
}
