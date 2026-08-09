import { test, expect } from "@playwright/test"
import { setValidationMode, setInputSource, runAll } from "./utils/helpers"

/**
 * PR-10 Smoke Suite.
 *
 * Design principles (per client review):
 *  1. Never assert specific hardcoded config values (backend URL,
 *     tester name, etc.) — only that a field exists, is reachable,
 *     and its value has a sane format. Defaults can change without
 *     breaking these tests.
 *  2. Never assert localized/translatable UI copy. Read structured
 *     state instead — either the parsed JSON report, or stable
 *     data-testid/id hooks — so tests don't break when interface
 *     text changes or gets translated.
 *  3. Include negative smoke tests: actions attempted before their
 *     preconditions are met (Next/Repeat before a session has
 *     started, Download/Send before a report exists) must fail
 *     safely, not silently succeed or crash.
 *  4. Prefer asserting state/behavior changes over exact visible
 *     text, so tests stay resilient to cosmetic UI changes.
 *
 * These tests use Automatic mode and Interactive mode with Input
 * Source = Inject Action, both fully scriptable without a real
 * microphone (Web Speech API is unavailable/unreliable under
 * automation) — real-mic behavior is covered by manual QA per the
 * PR-9d.2 checklist.
 */

test.describe("Smoke Suite", () => {

    test("1. page loads and the app mounts", async ({ page }) => {
        await page.goto("/")
        // State-based, not text-based: the root app container exists
        // and is non-empty, regardless of what heading text it shows.
        await expect(page.locator("#app")).not.toBeEmpty()
    })

    test("2. Session Panel fields exist, are reachable, and have well-formed values", async ({ page }) => {
        await page.goto("/")
        // PR-10 fix: no longer asserts specific default values
        // (e.g. "Tester-1", "en-US", "ibronevik.ru") — only that each
        // field is present/enabled and its value has a sane shape.
        const tester = page.getByTestId("session-tester")
        await expect(tester).toBeEditable()
        await expect(tester).not.toHaveValue("")

        const uiLanguage = page.getByTestId("session-ui-language")
        await expect(uiLanguage).toBeEnabled()
        expect(await uiLanguage.inputValue()).toMatch(/^[a-z]{2}-[A-Z]{2}$/)

        const voiceLanguage = page.getByTestId("session-voice-language")
        await expect(voiceLanguage).toBeEnabled()
        expect(await voiceLanguage.inputValue()).toMatch(/^[a-z]{2}-[A-Z]{2}$/)

        const backendUrl = page.getByTestId("session-backend-url")
        await expect(backendUrl).toBeEditable()
        expect(await backendUrl.inputValue()).toMatch(/^https?:\/\//)

        const login = page.getByTestId("session-login")
        await expect(login).not.toHaveValue("")

        const password = page.getByTestId("session-password")
        expect(await password.getAttribute("type")).toBe("password")
    })

    test("3. switching to Interactive mode reveals Input Source and Interactive Runner", async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await expect(page.getByTestId("input-source-row")).toBeVisible()
        await expect(page.getByTestId("interactive-runner")).toBeVisible()
    })

    test("4. Input Source toggles Inject/Mic controls correctly", async ({ page }) => {
        await page.goto("/")
        await setValidationMode(page, "interactive")
        await setInputSource(page, "inject")
        await expect(page.getByTestId("inject-controls")).toBeVisible()
        await expect(page.getByTestId("mic-controls")).toBeHidden()

        await setInputSource(page, "mic")
        await expect(page.getByTestId("mic-controls")).toBeVisible()
        await expect(page.getByTestId("inject-controls")).toBeHidden()
    })

    test("5. Run All (Automatic) produces a passing verification and a populated log", async ({ page }) => {
        await page.goto("/")
        await runAll(page)
        const log = await page.getByTestId("execution-log").innerText()
        expect(log.trim().length).toBeGreaterThan(0)

        const report = JSON.parse(await page.getByTestId("json-report").innerText())
        expect(report.Summary.failed).toBe(0)
        expect(report.Summary.passed).toBe(report.Summary.totalScenarios)

        // PR-10 fix (per client review): compare against the scenario
        // count the system itself reports, not a hardcoded number —
        // so this test survives the built-in scenario set growing or
        // shrinking.
        const actionCount = (log.match(/\[Action\]/g) ?? []).length
        expect(actionCount).toBe(report.Summary.totalScenarios)
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
            "speech-text",
            // PR-11: External JSON Scenarios
            "scenario-source-builtin",
            "scenario-source-file",
            "scenario-file-input",
            "scenario-choose-file-button",
            "scenario-file-name",
            "scenario-error"
        ]) {
            await expect(page.getByTestId(testId)).toHaveCount(1)
        }
    })

    test("7. after Run All, the generated report records the current mode configuration", async ({ page }) => {
        await page.goto("/")
        // Capture what THIS test actually selected, so the assertion
        // below compares against real state, not a duplicated literal.
        const selectedMode = await page.getByTestId("validation-mode").inputValue()
        await runAll(page)
        // PR-10 fix: read structured JSON instead of scanning
        // displayed (potentially localized) text in the report box.
        const report = JSON.parse(await page.getByTestId("json-report").innerText())

        // PR-10 fix (per client review): validate against a known set
        // of allowed values AND against what the test itself set,
        // instead of a hardcoded "Automatic" literal that would need
        // manual updates if the mode naming ever changes.
        const validModes = ["Automatic", "Interactive"]
        expect(validModes).toContain(report.ValidationMode)
        expect(report.ValidationMode.toLowerCase()).toBe(selectedMode)

        expect(typeof report.TestConfiguration.inputSource).toBe("string")
        expect(report.TestConfiguration.inputSource.length).toBeGreaterThan(0)
        expect(typeof report.TestConfiguration.recognitionProvider).toBe("string")
        expect(report.TestConfiguration.recognitionProvider.length).toBeGreaterThan(0)
    })

    // ---- Negative smoke tests (per client review, item 3) ----

    test("8. Next Step is unreachable before an Interactive session has started", async ({ page }) => {
        await page.goto("/")
        // Still in Automatic mode: the Interactive Runner (and its
        // Next Step button) must not be usable at all.
        await expect(page.getByTestId("interactive-next-button")).toBeHidden()
    })

    test("9. Repeat Step is unreachable before an Interactive session has started", async ({ page }) => {
        await page.goto("/")
        await expect(page.getByTestId("interactive-repeat-button")).toBeHidden()
    })

    test("10. Download Report before any report exists fails safely, not silently", async ({ page }) => {
        await page.goto("/")
        // PR-10 fix: a synchronous alert() blocks the renderer, so
        // click()'s own promise only resolves once the dialog is
        // dismissed. Racing click() and waitForEvent("dialog") together
        // in Promise.all still deadlocks, because we can't call
        // dialog.dismiss() until AFTER Promise.all resolves — which
        // requires click() to already be done. Registering a
        // fire-and-forget dialog handler BEFORE clicking avoids this:
        // it dismisses the dialog independently, letting click() finish.
        let dialogType: string | null = null
        page.once("dialog", async (dialog) => {
            dialogType = dialog.type()
            await dialog.dismiss()
        })
        await page.getByTestId("download-json-button").click()
        expect(dialogType).toBe("alert")
    })

    test("11. Send Report before any report exists fails safely, not silently", async ({ page }) => {
        await page.goto("/")
        let dialogType: string | null = null
        page.once("dialog", async (dialog) => {
            dialogType = dialog.type()
            await dialog.dismiss()
        })
        await page.getByTestId("send-report-button").click()
        expect(dialogType).toBe("alert")
    })

})