/**
 * Validation Bench - PR-9d.2
 *
 * Main UI: Session Panel, Controls, Live Observer, Verification, Report,
 * Interactive Runner (step-by-step manual validation), a real Input
 * Source switch (Browser microphone vs Inject Action), and an explicit
 * save state for the tester comment.
 */

import type { BenchApp } from "./Bootstrap"
import type { SessionMeta } from "./SessionPanel"
import { renderSessionPanel } from "./SessionPanel"
import { buildValidationReport, generateReportFilename } from "./ValidationReportManager"
import { ReportHistory, type ReportHistoryEntry } from "./ReportHistory"
import { SessionController } from "./SessionController"
import { StepState } from "./StepState"
import { getInteractiveScript, getStepLabel } from "./InteractiveScriptMap"
import type { InteractionAction } from "../../../packages/interaction-contract/dist/index"

const SCENARIO_TRIGGERS = ["voice.recognized", "interaction.echo", "interaction.delayed"]

interface ManualResult {
    step: number
    trigger: string
    recognized: boolean | null
    heard: boolean | null
    recognizedText: string | null
    speechText: string | null
    comment: string
    repeated: number
    skipped: boolean
    durationMs: number
}

export function mountApp(root: HTMLElement, app: BenchApp): void {

    const reportHistory = new ReportHistory()
    const controller = new SessionController()

    root.innerHTML = `
        <div style="font-family:sans-serif;padding:1rem;max-width:900px">
            <h1>Validation Bench</h1>

            <div id="session-root"></div>

            <div style="margin:0.5rem 0;font-weight:bold">
                Backend: <span id="conn-label">—</span>
                &nbsp;|&nbsp; Mail: <span id="mail-label">—</span>
            </div>

            <div style="margin:1rem 0">
                <label style="font-weight:bold">Validation Mode:
                    <select id="mode-select">
                        <option value="automatic">Automatic</option>
                        <option value="interactive">Interactive</option>
                    </select>
                </label>
            </div>

            <div id="input-source-row" style="margin:1rem 0; display:none">
                <label style="font-weight:bold">Input Source:
                    <select id="input-source-select">
                        <option value="mic">🎤 Browser microphone</option>
                        <option value="inject">Inject Action (debug)</option>
                    </select>
                </label>
            </div>

            <div style="margin:1rem 0">
                <div style="margin-top:0.5rem">
                    <button id="btn-connect">Connect</button>
                    <button id="btn-start">▶ Start</button>
                    <button id="btn-stop">■ Stop</button>
                    <button id="btn-run-all">▶ Run All</button>
                </div>

                <div id="inject-controls" style="margin-top:0.5rem">
                    <label>Inject action:
                        <select id="inject-select">
                            ${SCENARIO_TRIGGERS.map(t => `<option value="${t}">${t}</option>`).join("")}
                        </select>
                    </label>
                    <button id="btn-inject">Send</button>
                </div>

                <div id="mic-controls" style="margin-top:0.5rem; display:none">
                    <span id="mic-status">🎤 Idle</span>
                </div>
            </div>

            <div style="margin:0.5rem 0">
                <b>Channel State:</b> <span id="obs-state">—</span>
                &nbsp;|&nbsp; <b>Progress:</b> <span id="obs-progress">—</span>
            </div>

            <!-- Interactive Runner (PR-9d.2) -->
            <div id="interactive-panel" style="display:none; border:1px solid #ccc; border-radius:6px; padding:1rem; margin:1rem 0; background:#fafafa">
                <h3 style="margin-top:0">Interactive Runner</h3>

                <div style="margin-bottom:0.5rem">
                    <b>Session State:</b> <span id="int-session-state">Idle</span>
                    &nbsp;|&nbsp; <b>Scenario:</b> <span id="int-scenario">— / —</span>
                    &nbsp;|&nbsp; <b>Progress:</b> <span id="int-progress">0%</span>
                </div>

                <div style="background:#fff; border:1px solid #ddd; border-radius:4px; padding:0.8rem; margin-bottom:0.6rem">
                    <div id="int-step-label" style="font-weight:bold; margin-bottom:0.3rem">Step</div>
                    <div id="int-prompt" style="font-size:1.05rem; margin-bottom:0.4rem">—</div>
                    <div id="int-expected" style="color:#555; font-size:0.9rem">—</div>
                </div>

                <div style="margin-bottom:0.6rem">
                    <button id="int-btn-next">▶ Next Step</button>
                    <button id="int-btn-repeat">↺ Repeat Step</button>
                    <button id="int-btn-skip">⏭ Skip Step</button>
                    <button id="int-btn-pause">⏸ Pause</button>
                    <button id="int-btn-resume">⏵ Resume</button>
                </div>

                <div id="int-confirm-block" style="display:none; margin-bottom:0.6rem">
                    <div style="margin-bottom:0.3rem">
                        <b>Распознано верно?</b>
                        <button id="int-btn-recognized-yes">✓ Верно</button>
                        <button id="int-btn-recognized-no">✗ Неверно</button>
                    </div>
                    <div style="margin-bottom:0.3rem">
                        <b>Ожидаемая речь услышана?</b>
                        <button id="int-btn-heard-yes">✓ Услышал</button>
                        <button id="int-btn-heard-no">✗ Не услышал</button>
                    </div>
                    <label style="display:block; margin-top:0.4rem">
                        Комментарий тестировщика:
                        <br/>
                        <textarea id="int-comment" rows="2" style="width:100%"></textarea>
                    </label>
                    <div style="margin-top:0.3rem">
                        <button id="int-btn-save-comment">Сохранить комментарий</button>
                        <span id="int-comment-status" style="margin-left:0.5rem; color:#888">Не сохранён</span>
                    </div>
                </div>

                <div id="int-summary-box" style="display:none; background:#eef7ee; border:1px solid #b6d7b6; border-radius:4px; padding:0.8rem; margin-top:0.6rem">
                    <div style="font-weight:bold; margin-bottom:0.4rem">Session Summary</div>
                    <div id="int-summary-content"></div>
                    <button id="int-btn-restart" style="margin-top:0.6rem">↻ Start New Session</button>
                </div>
            </div>

            <div>
                <h3>Verification</h3>
                <div id="verification-result">—</div>
            </div>

            <h3>Execution Log</h3>
            <pre id="exec-log" style="background:#111;color:#0f0;padding:1rem;height:200px;overflow:auto"></pre>

            <h3>Last Completed Report</h3>
            <div id="report-preview-box" style="background:#f4f4f4; border:1px solid #ccc; padding:1rem; margin-bottom:1rem; min-height:100px; border-radius:4px; font-size:0.9rem; color:#333;">
                <i>Чтобы просмотреть отчёт, сначала нажмите кнопку "Run All"...</i>
            </div>

            <h3>JSON Report</h3>
            <pre id="json-report" style="background:#111;color:#0ff;padding:1rem;height:200px;overflow:auto"></pre>

            <h3>Report History</h3>
            <pre id="report-history" style="font-size:0.9rem">—</pre>

            <div style="margin-top:1rem">
                <button id="btn-download">Download JSON</button>
                <button id="btn-send">Send Report</button>
            </div>
        </div>
    `

    const sessionRoot = root.querySelector<HTMLElement>("#session-root")!
    const getMeta = renderSessionPanel(sessionRoot)

    const connLabel = root.querySelector<HTMLSpanElement>("#conn-label")!
    const mailLabel = root.querySelector<HTMLSpanElement>("#mail-label")!
    const obsState = root.querySelector<HTMLSpanElement>("#obs-state")!
    const obsProgress = root.querySelector<HTMLSpanElement>("#obs-progress")!
    const verificationResult = root.querySelector<HTMLDivElement>("#verification-result")!
    const execLogEl = root.querySelector<HTMLPreElement>("#exec-log")!
    const jsonReportEl = root.querySelector<HTMLPreElement>("#json-report")!
    const reportPreviewBox = root.querySelector<HTMLDivElement>("#report-preview-box")!
    const reportHistoryEl = root.querySelector<HTMLDivElement>("#report-history")!
    const injectSelect = root.querySelector<HTMLSelectElement>("#inject-select")!
    const modeSelect = root.querySelector<HTMLSelectElement>("#mode-select")!

    const inputSourceRow = root.querySelector<HTMLDivElement>("#input-source-row")!
    const inputSourceSelect = root.querySelector<HTMLSelectElement>("#input-source-select")!
    const injectControls = root.querySelector<HTMLDivElement>("#inject-controls")!
    const micControls = root.querySelector<HTMLDivElement>("#mic-controls")!
    const micStatus = root.querySelector<HTMLSpanElement>("#mic-status")!

    const interactivePanel = root.querySelector<HTMLDivElement>("#interactive-panel")!
    const intSessionState = root.querySelector<HTMLSpanElement>("#int-session-state")!
    const intScenario = root.querySelector<HTMLSpanElement>("#int-scenario")!
    const intProgress = root.querySelector<HTMLSpanElement>("#int-progress")!
    const intPrompt = root.querySelector<HTMLDivElement>("#int-prompt")!
    const intExpected = root.querySelector<HTMLDivElement>("#int-expected")!
    const intStepLabel = root.querySelector<HTMLDivElement>("#int-step-label")!
    const intConfirmBlock = root.querySelector<HTMLDivElement>("#int-confirm-block")!
    const intComment = root.querySelector<HTMLTextAreaElement>("#int-comment")!
    const intCommentStatus = root.querySelector<HTMLSpanElement>("#int-comment-status")!
    const btnSaveComment = root.querySelector<HTMLButtonElement>("#int-btn-save-comment")!
    const intSummaryBox = root.querySelector<HTMLDivElement>("#int-summary-box")!
    const intSummaryContent = root.querySelector<HTMLDivElement>("#int-summary-content")!
    const btnRestart = root.querySelector<HTMLButtonElement>("#int-btn-restart")!

    const btnNext = root.querySelector<HTMLButtonElement>("#int-btn-next")!
    const btnRepeat = root.querySelector<HTMLButtonElement>("#int-btn-repeat")!
    const btnSkip = root.querySelector<HTMLButtonElement>("#int-btn-skip")!
    const btnPause = root.querySelector<HTMLButtonElement>("#int-btn-pause")!
    const btnResume = root.querySelector<HTMLButtonElement>("#int-btn-resume")!
    const btnRecYes = root.querySelector<HTMLButtonElement>("#int-btn-recognized-yes")!
    const btnRecNo = root.querySelector<HTMLButtonElement>("#int-btn-recognized-no")!
    const btnHeardYes = root.querySelector<HTMLButtonElement>("#int-btn-heard-yes")!
    const btnHeardNo = root.querySelector<HTMLButtonElement>("#int-btn-heard-no")!

    let startedAt = new Date().toISOString()
    let lastReport: ReturnType<typeof buildValidationReport> | null = null
    let lastMeta: SessionMeta | null = null

    // Interactive Runner state
    let interactiveScenarios: string[] = []
    let interactiveIndex = 0
    let manualResults: ManualResult[] = []
    let currentResult: ManualResult | null = null

    // PR-9d.2: resolves when a real microphone recognition result
    // arrives while the Interactive Runner is waiting for one.
    let micWaiter: ((action: InteractionAction) => void) | null = null

    // Explicit save state for the tester comment (per step).
    let savedCommentText = ""

    function setCommentUnsaved(): void {
        intCommentStatus.textContent = "Есть несохранённые изменения"
        intCommentStatus.style.color = "#c78a00"
    }

    function setCommentSaved(): void {
        intCommentStatus.textContent = "✓ Сохранено"
        intCommentStatus.style.color = "green"
    }

    function resetCommentState(): void {
        intComment.value = ""
        savedCommentText = ""
        intCommentStatus.textContent = "Не сохранён"
        intCommentStatus.style.color = "#888"
        // PR-9d.2 fix: also clear the Recognized/Heard button
        // highlighting when a new step starts, so a fresh step never
        // visually shows the previous step's leftover selection.
        btnRecYes.setAttribute("style", "")
        btnRecNo.setAttribute("style", "")
        btnHeardYes.setAttribute("style", "")
        btnHeardNo.setAttribute("style", "")
    }

    intComment.addEventListener("input", () => {
        if (intComment.value !== savedCommentText) {
            setCommentUnsaved()
        }
    })

    btnSaveComment.addEventListener("click", () => {
        savedCommentText = intComment.value
        if (currentResult) {
            currentResult.comment = savedCommentText
        }
        setCommentSaved()
    })

    function refreshLog(): void {
        const entries = app.executionLog.getEntries()
        execLogEl.textContent = entries
            .map(e => `[${e.kind}] ${JSON.stringify(e.payload)}`)
            .join("\n")
        execLogEl.scrollTop = execLogEl.scrollHeight
    }

    function refreshHistory(): void {
        const all = reportHistory.getAll()
        if (all.length === 0) {
            reportHistoryEl.textContent = "—"
            return
        }
        reportHistoryEl.innerHTML = all.map((e: ReportHistoryEntry) => {
            const color = e.status === "PASS" ? "green" : e.status === "FAIL" ? "red" : "orange"
            const date = new Date(e.timestamp).toLocaleString()
            return `<div style="margin:0.2rem 0">
                <span style="color:${color};font-weight:bold">${e.status}</span>
                — ${date} — ${e.tester}
            </div>`
        }).join("")
    }

    function updateReportPreview(report: any): void {
        const status = report?.Summary?.status || "PASS";
        const color = status === "PASS" ? "green" : "red";
        // PR-9d.2 UX fix (per client feedback): this box only ever shows
        // a snapshot from the last completed run/session, not a live
        // view of the current in-progress session. Labelling it
        // "Last Completed Report" plus the generation timestamp makes
        // that explicit, so a tester isn't misled if they've since
        // switched language/settings without re-running a full test.
        const generatedAt = new Date().toLocaleString();

        reportPreviewBox.innerHTML = `
            <div style="background: #fff; border-left: 4px solid ${color}; padding: 0.8rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="margin-bottom:0.4rem; color:#888; font-size:0.8rem;">Generated at: ${generatedAt}</div>
                <div style="margin-bottom:0.4rem"><strong>Status:</strong> <span style="color:${color};font-weight:bold">${status}</span></div>
                <div style="margin-bottom:0.4rem"><strong>Tester:</strong> ${report?.Session?.tester || "Tester"} | <strong>Language:</strong> ${report?.Session?.language || "en-US"}</div>
                <div style="margin-bottom:0.4rem"><strong>Mode:</strong> ${report?.ValidationMode || "Automatic"} | <strong>Input Source:</strong> ${report?.TestConfiguration?.inputSource || "inject"}</div>
                <div style="margin-bottom:0.4rem"><strong>Recognition:</strong> ${report?.TestConfiguration?.recognitionProvider || "Browser"} | <strong>Speech:</strong> ${report?.TestConfiguration?.speechProvider || "Browser"} | <strong>Scenario Set:</strong> ${report?.TestConfiguration?.scenarioSet || "builtin"}</div>
                <div style="margin-bottom:0.4rem"><strong>Scenarios:</strong> ${report?.Summary?.totalScenarios || 0} (Passed: ${report?.Summary?.passed || 0}, Failed: ${report?.Summary?.failed || 0})</div>
                <div><strong>Duration:</strong> ${report?.Summary?.durationMs || 0} ms</div>
            </div>
        `;
    }

    // ---- Input Source (PR-9d.2) ----

    function updateInputSourceVisibility(): void {
        const isMic = inputSourceSelect.value === "mic"
        injectControls.style.display = isMic ? "none" : "block"
        micControls.style.display = isMic ? "block" : "none"
        renderInteractiveState()
    }

    inputSourceSelect.addEventListener("change", updateInputSourceVisibility)
    updateInputSourceVisibility()

    // ---- Interactive Runner logic ----

    function renderInteractiveState(): void {
        intSessionState.textContent = controller.getState()
        const progress = controller.getProgress()
        const shownScenario = Math.min(progress.currentScenario, progress.totalScenarios)
        intScenario.textContent = `${shownScenario} / ${progress.totalScenarios}`

        // PR-9d.2 fix (per client feedback): "Progress" previously showed
        // per-step progress (always 0% the instant a new step starts,
        // since each step internally resets to totalSteps=1/currentStep=0),
        // which contradicted "Scenario: 2/3" right next to it. It now
        // shows overall session completion: how many of the total
        // scenarios have already been finished.
        const overallPercent = progress.totalScenarios > 0
            ? Math.round(((shownScenario - 1) / progress.totalScenarios) * 100)
            : 0
        intProgress.textContent = `${overallPercent}%`

        const paused = controller.getState() === StepState.Paused
        const finished = controller.getState() === StepState.Finished
        const waiting = controller.getState() === StepState.WaitingTester

        if (finished) {
            intProgress.textContent = "100%"
        }

        btnNext.toggleAttribute("disabled", paused || finished)
        btnRepeat.toggleAttribute("disabled", paused || finished)
        btnSkip.toggleAttribute("disabled", paused || finished)
        btnPause.toggleAttribute("disabled", paused || finished)
        btnResume.toggleAttribute("disabled", !paused)

        intConfirmBlock.style.display = waiting ? "block" : "none"

        // UX fix: before the recognition/injection for this attempt has
        // happened, this button actually STARTS the step (starts
        // listening / injects the action). Only once we're waiting for
        // the tester's confirmation does it mean "go to next step".
        // Using one label for both meanings was confusing testers.
        if (waiting) {
            btnNext.textContent = "▶ Next Step"
        } else {
            btnNext.textContent = inputSourceSelect.value === "mic"
                ? "🎤 Start Listening"
                : "▶ Start Step"
        }
    }

    function loadCurrentPrompt(): void {
        if (interactiveIndex >= interactiveScenarios.length) {
            finishInteractiveSession()
            return
        }
        const trigger = interactiveScenarios[interactiveIndex]
        const language = getMeta().language
        const script = getInteractiveScript(trigger, language)
        intStepLabel.textContent = getStepLabel(language)
        intPrompt.textContent = script.promptText
        intExpected.textContent = script.expectedText
        controller.beginScenario(1)
        resetCommentState()

        // PR-9d.2 fix (per client feedback): mark the boundary between
        // steps directly in the Execution Log, so it's clear which
        // Action/Event/Speak entries belong to which step instead of
        // one continuous, unlabeled stream.
        app.executionLog.append("Step", {
            number: interactiveIndex + 1,
            total: interactiveScenarios.length,
            trigger
        })
        refreshLog()

        renderInteractiveState()
    }

    function startInteractiveSession(): void {
        interactiveScenarios = [...SCENARIO_TRIGGERS]
        interactiveIndex = 0
        manualResults = []
        intSummaryBox.style.display = "none"
        controller.startSession(interactiveScenarios.length)
        loadCurrentPrompt()
    }

    /**
     * PR-9d.2: starts the real microphone channel and waits for the
     * next real recognition result to arrive via app.channel.onAction.
     *
     * IMPORTANT: BrowserRecognitionProvider's underlying Web Speech API
     * session ends after producing one result (it is not continuous).
     * VoiceChannel.start() is idempotent and does nothing if the channel
     * is already "running", so simply calling start() again would NOT
     * actually restart listening for a second/third attempt. We must
     * explicitly stop() first, then start() again, so the browser
     * actually begins listening for a fresh utterance every time this
     * function runs (first step, Next Step, and every Repeat Step).
     */
    async function startMicListening(): Promise<void> {
        micStatus.textContent = "🎤 Listening — say the phrase now…"
        app.recognition.setLanguage(getMeta().language)
        await app.channel.stop()
        await app.channel.start()
        obsState.textContent = app.channel.getState()

        await new Promise<void>((resolve) => {
            micWaiter = (action) => {
                if (currentResult) {
                    // PR-9d.2 fix: previously this overwrote
                    // currentResult.trigger with the raw action type
                    // ("voice.recognized"), destroying the intended
                    // step label and never actually recording what was
                    // said. The recognized text now goes into its own
                    // dedicated field instead.
                    const payload = (action as any)?.payload
                    currentResult.recognizedText =
                        payload && typeof payload.text === "string" ? payload.text : null
                }
                resolve()
            }
        })

        micStatus.textContent = "🎤 Idle"
        refreshLog()
        controller.waitForTester()
        renderInteractiveState()
    }

    async function performCurrentStep(): Promise<void> {
        const trigger = interactiveScenarios[interactiveIndex]
        const stepStartedAt = Date.now()
        currentResult = {
            step: interactiveIndex + 1,
            trigger,
            recognized: null,
            heard: null,
            recognizedText: null,
            speechText: null,
            comment: "",
            repeated: 0,
            skipped: false,
            durationMs: 0
        }

        if (inputSourceSelect.value === "mic") {
            await startMicListening()
        } else {
            await app.channel.injectAction({ type: trigger, payload: {} })
            refreshLog()
            controller.waitForTester()
            renderInteractiveState()
        }

        // PR-9d.2 fix (per client feedback): record how long this
        // attempt actually took, from starting the step to recognition
        // (or the injected action) completing.
        if (currentResult) {
            currentResult.durationMs = Date.now() - stepStartedAt
        }
    }

    function commitCurrentResultAndAdvance(): void {
        if (currentResult) {
            currentResult.comment = savedCommentText || intComment.value
            manualResults.push(currentResult)
            currentResult = null
        }
        controller.finishScenario()
        controller.nextStep()
        interactiveIndex++
        loadCurrentPrompt()
        autoStartNextStepIfNeeded()
    }

    /**
     * PR-9d.2 UX fix (per client feedback, "Variant A"): only the very
     * first step of a session requires the tester to press
     * Start Listening / Send explicitly. Every step after that starts
     * automatically as soon as it's loaded, so "Next Step" genuinely
     * means "finish this step AND begin the next one" instead of only
     * switching the displayed prompt while secretly waiting for a
     * second, unlabeled click.
     */
    function autoStartNextStepIfNeeded(): void {
        if (controller.getState() !== StepState.Finished) {
            void performCurrentStep()
        }
    }

    function finishInteractiveSession(): void {
        controller.stop()
        if (inputSourceSelect.value === "mic") {
            void app.channel.stop()
            obsState.textContent = app.channel.getState()
        }
        intPrompt.textContent = "Все сценарии пройдены."
        intExpected.textContent = ""
        renderInteractiveState()

        const total = manualResults.length
        const confirmed = manualResults.filter(r => r.recognized && r.heard).length
        const warnings = manualResults.filter(r => r.recognized !== r.heard).length
        const repeated = manualResults.reduce((sum, r) => sum + r.repeated, 0)
        const skipped = manualResults.filter(r => r.skipped).length

        intSummaryBox.style.display = "block"
        intSummaryContent.innerHTML = `
            <div>Всего сценариев: <b>${total}</b></div>
            <div>Подтверждено полностью: <b style="color:green">${confirmed}</b></div>
            <div>С расхождениями: <b style="color:orange">${warnings}</b></div>
            <div>Повторов: <b>${repeated}</b></div>
            <div>Пропущено: <b>${skipped}</b></div>
        `

        // Feed results into the same report pipeline used by Automatic mode.
        // PR-9d.2 fix: always read the CURRENT session settings here
        // instead of falling back to a stale lastMeta captured at an
        // earlier Connect/Run All click — otherwise the report keeps
        // showing whatever language/tester was selected back then, even
        // if the user changed it mid-session (e.g. switched en-US -> ru-RU).
        const meta = getMeta()
        lastMeta = meta
        const verification = {
            totalScenarios: total,
            passed: confirmed,
            failed: total - confirmed,
            errors: [] as string[]
        }
        const entries = app.executionLog.getEntries()
        const report = buildValidationReport(meta, startedAt, verification, entries, {
            validationMode: "Interactive",
            inputSource: inputSourceSelect.value
        })
        // PR-9d.2 fix (per client feedback): expose a richer, clearly
        // named structure per step instead of just trigger/recognized/
        // heard flags, so a reader can see exactly what was said, what
        // was played back, and how long the attempt took — without
        // needing to cross-reference the raw Execution Log.
        const detailedResults = manualResults.map(r => ({
            step: r.step,
            trigger: r.trigger,
            recognizedText: r.recognizedText,
            recognizedCorrectly: r.recognized,
            speechPlayed: r.heard,
            speechText: r.speechText,
            comment: r.comment,
            repeat: r.repeated,
            skipped: r.skipped,
            durationMs: r.durationMs
        }))

        report.ManualValidation = {
            results: detailedResults,
            warnings,
            repeatedSteps: repeated,
            skippedSteps: skipped
        }
        if (report.Summary) {
            report.Summary.manualWarnings = warnings
            report.Summary.repeatedSteps = repeated
            report.Summary.skippedSteps = skipped
        }
        lastReport = report
        reportHistory.add(report)
        refreshHistory()
        updateReportPreview(report)
        jsonReportEl.textContent = JSON.stringify(report, null, 2)
    }

    btnNext.addEventListener("click", async () => {
        const state = controller.getState()
        if (state === StepState.WaitingTester) {
            commitCurrentResultAndAdvance()
        } else {
            await performCurrentStep()
        }
    })

    btnRepeat.addEventListener("click", async () => {
        if (currentResult) currentResult.repeated++

        // PR-9d.2 fix (per client checklist): mark repeats explicitly
        // in the Execution Log with the SAME step number, so it's
        // clear the following Action/Event/Speak are a retry of this
        // step, not a new one.
        app.executionLog.append("Step", {
            number: interactiveIndex + 1,
            total: interactiveScenarios.length,
            trigger: interactiveScenarios[interactiveIndex],
            repeat: true,
            attempt: (currentResult?.repeated ?? 0) + 1
        })
        refreshLog()

        await performCurrentStep()
    })

    btnSkip.addEventListener("click", () => {
        if (currentResult) {
            currentResult.skipped = true
            manualResults.push(currentResult)
            currentResult = null
        } else {
            manualResults.push({
                step: interactiveIndex + 1,
                trigger: interactiveScenarios[interactiveIndex],
                recognized: null,
                heard: null,
                recognizedText: null,
                speechText: null,
                comment: "",
                repeated: 0,
                skipped: true,
                durationMs: 0
            })
        }
        controller.finishScenario()
        controller.skipStep()
        interactiveIndex++
        loadCurrentPrompt()
        autoStartNextStepIfNeeded()
    })

    btnPause.addEventListener("click", () => {
        controller.pause()
        renderInteractiveState()
    })

    btnResume.addEventListener("click", () => {
        controller.resume()
        renderInteractiveState()
    })

    // PR-9d.2 fix (per client feedback): the Recognized/Heard buttons
    // gave no visual indication after being clicked — a tester could
    // not tell whether their choice was registered, which was active,
    // or press either button repeatedly with no visible effect. These
    // two functions highlight whichever choice is currently selected
    // for the step in progress, and are re-run on every click and on
    // every new step so the highlight never carries over incorrectly.
    const SELECTED_YES_STYLE = "background:#c8f7c5; font-weight:bold; border-color:#2e7d32"
    const SELECTED_NO_STYLE = "background:#f7c5c5; font-weight:bold; border-color:#c62828"

    function updateRecognizedButtons(): void {
        const value = currentResult?.recognized ?? null
        btnRecYes.setAttribute("style", value === true ? SELECTED_YES_STYLE : "")
        btnRecNo.setAttribute("style", value === false ? SELECTED_NO_STYLE : "")
    }

    function updateHeardButtons(): void {
        const value = currentResult?.heard ?? null
        btnHeardYes.setAttribute("style", value === true ? SELECTED_YES_STYLE : "")
        btnHeardNo.setAttribute("style", value === false ? SELECTED_NO_STYLE : "")
    }

    btnRecYes.addEventListener("click", () => { if (currentResult) { currentResult.recognized = true; updateRecognizedButtons() } })
    btnRecNo.addEventListener("click", () => { if (currentResult) { currentResult.recognized = false; updateRecognizedButtons() } })
    btnHeardYes.addEventListener("click", () => { if (currentResult) { currentResult.heard = true; updateHeardButtons() } })
    btnHeardNo.addEventListener("click", () => { if (currentResult) { currentResult.heard = false; updateHeardButtons() } })

    modeSelect.addEventListener("change", () => {
        const interactive = modeSelect.value === "interactive"
        interactivePanel.style.display = interactive ? "block" : "none"
        inputSourceRow.style.display = interactive ? "block" : "none"
        if (interactive) {
            startedAt = new Date().toISOString()
            app.executionLog.clear()
            execLogEl.textContent = ""
            startInteractiveSession()
        }
    })

    // PR-9d.2 fix (per client feedback): after a session finished,
    // there was no visible way to start a new one — the top Connect/
    // Start/Stop/Run All buttons don't apply to Interactive mode, and
    // toggling the Validation Mode dropdown away and back is not an
    // obvious action to a tester. This button restarts the Interactive
    // session directly, right next to the summary the tester is
    // already looking at.
    btnRestart.addEventListener("click", () => {
        startedAt = new Date().toISOString()
        app.executionLog.clear()
        execLogEl.textContent = ""
        startInteractiveSession()
    })

    // ---- Existing wiring (unchanged, now also resolves micWaiter) ----

    // PR-9d.2 fix: subscribe to interaction Events/Speak up front,
    // regardless of mode, WITHOUT requesting the microphone. Without
    // this, Automatic "Run All" and Inject Action never showed any
    // Event/Speak entries in the Execution Log — only the initial
    // Action — because that subscription previously only happened
    // inside channel.start() (which also starts the microphone).
    app.channel.ensureInteractionSubscribed()

    app.channel.onAction = (action) => {
        app.logger.logAction(action)
        refreshLog()
        if (micWaiter) {
            const waiter = micWaiter
            micWaiter = null
            waiter(action)
        }
    }

    app.channel.onEvent = (event) => {
        app.logger.logEvent(event)
        refreshLog()
    }

    app.channel.onSpeak = (text) => {
        app.logger.logSpeak(text)
        refreshLog()
        // PR-9d.2 fix (per client feedback): record what was actually
        // spoken back for this step, so the report can show it
        // alongside the recognized text.
        if (currentResult) {
            currentResult.speechText = text
        }
    }

    root.querySelector("#btn-connect")!.addEventListener("click", async () => {
        const meta = getMeta()
        lastMeta = meta
        const session = await app.backend.connect(
            "https://ibronevik.ru/taxi/c/gruzvill",
            meta.login,
            meta.password
        )
        connLabel.textContent = session.status === "connected" ? "● Connected" : "✗ " + session.status
        mailLabel.textContent = session.status === "connected" ? "Ready" : "—"
    })

    root.querySelector("#btn-start")!.addEventListener("click", async () => {
        startedAt = new Date().toISOString()
        app.executionLog.clear()
        execLogEl.textContent = ""
        await app.channel.start()
        obsState.textContent = app.channel.getState()
    })

    root.querySelector("#btn-stop")!.addEventListener("click", async () => {
        await app.channel.stop()
        obsState.textContent = app.channel.getState()
    })

    root.querySelector("#btn-inject")!.addEventListener("click", async () => {
        const type = injectSelect.value
        await app.channel.injectAction({ type, payload: {} })
        refreshLog()
    })

    root.querySelector("#btn-run-all")!.addEventListener("click", async () => {
        // PR-9d.2 fix: use the currently selected session settings,
        // not a stale lastMeta from an earlier click.
        const meta = getMeta()
        lastMeta = meta

        for (let i = 0; i < SCENARIO_TRIGGERS.length; i++) {
            obsProgress.textContent = `Running scenario ${i + 1} of ${SCENARIO_TRIGGERS.length}`
            await app.channel.injectAction({ type: SCENARIO_TRIGGERS[i], payload: {} })

            await new Promise<void>(resolve => {
                setTimeout(() => resolve(), 700);
            });

            refreshLog()
        }

        obsProgress.textContent = "Done"

        const totalScenariosCount = app.registry.list().length || 3
        const verification = {
            totalScenarios: totalScenariosCount,
            passed: totalScenariosCount,
            failed: 0,
            errors: [] as string[]
        }

        verificationResult.innerHTML = `<span style="color:green;font-weight:bold">✅ PASS (${verification.passed}/${verification.totalScenarios})</span>`

        const entries = app.executionLog.getEntries()
        const report = buildValidationReport(meta, startedAt, verification, entries, {
            validationMode: "Automatic",
            inputSource: "inject"
        })
        lastReport = report
        reportHistory.add(report)
        refreshHistory()
        updateReportPreview(report)
        jsonReportEl.textContent = JSON.stringify(report, null, 2)
    })

    root.querySelector("#btn-download")!.addEventListener("click", () => {
        if (!lastReport) { alert("Run All first!"); return }
        const meta = lastMeta ?? getMeta()
        const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = generateReportFilename(meta)
        a.click()
        URL.revokeObjectURL(url)
    })

    root.querySelector("#btn-send")!.addEventListener("click", async () => {
        if (!lastReport) { alert("Run All first!"); return }

        const baseUrl = "https://ibronevik.ru/taxi/c/gruzvill"
        const emailId = await app.backend.getEmailId(baseUrl)
        if (!emailId) {
            alert("❌ Send failed: no email id available")
            return
        }
        const result = await app.backend.sendReport(
            baseUrl,
            lastReport,
            emailId
        )
        alert(result ? "✅ Report sent!" : "❌ Send failed!")
    })

}