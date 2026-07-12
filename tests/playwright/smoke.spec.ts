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
        const tester = page.locator("#s-tester")
        await expect(tester).toBeEditable()
        await expect(tester).not.toHaveValue("")

        const language = page.locator("#s-language")
        await expect(language).toBeEnabled()
        expect(await language.inputValue()).toMatch(/^[a-z]{2}-[A-Z]{2}$/)

        const backendUrl = page.locator("#s-backend-url")
        await expect(backendUrl).toBeEditable()
        expect(await backendUrl.inputValue()).toMatch(/^https?:\/\//)

        const login = page.locator("#s-login")
        await expect(login).not.toHaveValue("")

        const password = page.locator("#s-password")
        expect(await password.getAttribute("type")).toBe("password")
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

    test("5. Run All (Automatic) produces a passing verification and a populated log", async ({ page }) => {
        await page.goto("/")
        await runAll(page)
        // State-based: count structural log entries rather than
        // matching localized status words.
        const log = await page.getByTestId("execution-log").innerText()
        expect((log.match(/\[Action\]/g) ?? []).length).toBe(3)

        const report = JSON.parse(await page.locator("#json-report").innerText())
        expect(report.Summary.failed).toBe(0)
        expect(report.Summary.passed).toBe(report.Summary.totalScenarios)
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

    test("7. after Run All, the generated report records Automatic mode configuration", async ({ page }) => {
        await page.goto("/")
        await runAll(page)
        // PR-10 fix: read structured JSON instead of scanning
        // displayed (potentially localized) text in the report box.
        const report = JSON.parse(await page.locator("#json-report").innerText())
        expect(report.ValidationMode).toBe("Automatic")
        expect(report.TestConfiguration.inputSource).toBe("inject")
        expect(typeof report.TestConfiguration.recognitionProvider).toBe("string")
        expect(report.TestConfiguration.recognitionProvider.length).toBeGreaterThan(0)
    })

    // ---- Negative smoke tests (per client review, item 3) ----

    test("8. Next Step is unreachable before an Interactive session has started", async ({ page }) => {
        await page.goto("/")
        // Still in Automatic mode: the Interactive Runner (and its
        // Next Step button) must not be usable at all.
        await expect(page.locator("#int-btn-next")).toBeHidden()
    })

    test("9. Repeat Step is unreachable before an Interactive session has started", async ({ page }) => {
        await page.goto("/")
        await expect(page.locator("#int-btn-repeat")).toBeHidden()
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
        await page.locator("#btn-download").click()
        expect(dialogType).toBe("alert")
    })

    test("11. Send Report before any report exists fails safely, not silently", async ({ page }) => {
        await page.goto("/")
        let dialogType: string | null = null
        page.once("dialog", async (dialog) => {
            dialogType = dialog.type()
            await dialog.dismiss()
        })
        await page.locator("#btn-send").click()
        expect(dialogType).toBe("alert")
    })

})