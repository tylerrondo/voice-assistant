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
import {
    applySessionPanelLabels,
    formatRunningScenario,
    formatValidationModeLabel,
    getBenchUiStrings,
    getProgressDoneLabel
} from "./BenchUiI18n"
import type { InteractionAction } from "../../../packages/interaction-contract/dist/index"
import {
    JsonScenarioProvider,
    loadBuiltinScenarioSet,
    loadScenarioSetIntoRegistry,
    ScenarioSetValidationError
} from "../../../packages/scenario-engine/dist/index"
import type { ScenarioSet } from "../../../packages/scenario-engine/dist/index"

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

    // PR-11: External JSON Scenarios — triggers always come from
    // whichever ScenarioSet is currently loaded into app.registry
    // (builtin.json by default, or an uploaded file), instead of a
    // hardcoded list. Both Automatic and Interactive read this.
    function getScenarioTriggers(): string[] {
        return app.registry.list().map(s => s.trigger)
    }

    function getScenarioReportOptions() {
        return {
            scenarioSource: app.activeScenarioSource,
            scenarioId: app.activeScenarioSet.id,
            scenarioName: app.activeScenarioSet.name,
            scenarioFile: app.activeScenarioFileName
        }
    }

    root.innerHTML = `
        <div style="font-family:sans-serif;padding:1rem;max-width:900px">
            <h1 id="page-title">Validation Bench</h1>

            <div id="session-root"></div>

            <div style="margin:0.5rem 0;font-weight:bold">
                <span id="label-backend">Backend:</span> <span id="conn-label" data-testid="connection-status">—</span>
                &nbsp;|&nbsp; <span id="label-mail">Mail:</span> <span id="mail-label">—</span>
            </div>

            <div style="margin:1rem 0">
                <label style="font-weight:bold"><span id="label-validation-mode">Validation Mode:</span>
                    <select id="mode-select" data-testid="validation-mode">
                        <option value="automatic">Automatic</option>
                        <option value="interactive">Interactive</option>
                    </select>
                </label>
            </div>

            <!-- PR-11: External JSON Scenarios -->
            <div id="scenario-source-row" style="margin:1rem 0">
                <div style="font-weight:bold" id="label-scenario-source">Scenario Source:</div>
                <label style="margin-right:1rem">
                    <input type="radio" name="scenario-source" id="scenario-source-builtin" data-testid="scenario-source-builtin" value="builtin" checked />
                    <span id="label-scenario-source-builtin">Built-in</span>
                </label>
                <label>
                    <input type="radio" name="scenario-source" id="scenario-source-file" data-testid="scenario-source-file" value="file" />
                    <span id="label-scenario-source-file">JSON File</span>
                </label>
                <div style="margin-top:0.4rem">
                    <input id="scenario-file-input" data-testid="scenario-file-input" type="file" accept=".json,application/json" style="display:none" />
                    <button id="btn-choose-scenario-file" data-testid="scenario-choose-file-button" type="button" disabled>Choose File...</button>
                    <span style="margin-left:0.5rem"><b id="label-scenario-file">Scenario File:</b> <span id="scenario-file-name" data-testid="scenario-file-name">builtin.json</span></span>
                </div>
                <div id="scenario-error" data-testid="scenario-error" style="color:#c62828; font-size:0.9rem; margin-top:0.3rem; display:none"></div>
            </div>

            <div id="input-source-row" data-testid="input-source-row" style="margin:1rem 0; display:none">
                <label style="font-weight:bold"><span id="label-input-source">Input Source:</span>
                    <select id="input-source-select" data-testid="input-source">
                        <option value="mic">🎤 Browser microphone</option>
                        <option value="inject">Inject Action (debug)</option>
                    </select>
                </label>
            </div>

            <div style="margin:1rem 0">
                <div style="margin-top:0.5rem">
                    <button id="btn-connect" data-testid="connect-button">Connect</button>
                    <button id="btn-start" data-testid="start-button">▶ Start</button>
                    <button id="btn-stop" data-testid="stop-button">■ Stop</button>
                    <button id="btn-run-all" data-testid="run-all-button">▶ Run All</button>
                </div>

                <div id="inject-controls" data-testid="inject-controls" style="margin-top:0.5rem">
                    <label><span id="label-inject-action">Inject action:</span>
                        <select id="inject-select" data-testid="inject-action">
                            ${getScenarioTriggers().map(t => `<option value="${t}">${t}</option>`).join("")}
                        </select>
                    </label>
                    <button id="btn-inject" data-testid="inject-send-button">Send</button>
                </div>

                <div id="mic-controls" data-testid="mic-controls" style="margin-top:0.5rem; display:none">
                    <span id="mic-status" data-testid="mic-status">🎤 Idle</span>
                </div>
            </div>

            <div style="margin:0.5rem 0">
                <span id="label-channel-state"><b>Channel State:</b></span> <span id="obs-state" data-testid="automatic-channel-state">—</span>
                &nbsp;|&nbsp; <span id="label-progress"><b>Progress:</b></span> <span id="obs-progress" data-testid="automatic-progress">—</span>
            </div>

            <!-- Interactive Runner (PR-9d.2) -->
            <div id="interactive-panel" data-testid="interactive-runner" style="display:none; border:1px solid #ccc; border-radius:6px; padding:1rem; margin:1rem 0; background:#fafafa">
                <h3 id="interactive-runner-title" style="margin-top:0">Interactive Runner</h3>

                <div style="margin-bottom:0.5rem">
                    <span id="label-int-session-state"><b>Session State:</b></span> <span id="int-session-state" data-testid="session-state">Idle</span>
                    &nbsp;|&nbsp; <span id="label-int-scenario"><b>Scenario:</b></span> <span id="int-scenario" data-testid="current-step">— / —</span>
                    &nbsp;|&nbsp; <span id="label-int-progress"><b>Progress:</b></span> <span id="int-progress" data-testid="progress-value">0%</span>
                </div>

                <div style="background:#fff; border:1px solid #ddd; border-radius:4px; padding:0.8rem; margin-bottom:0.6rem">
                    <div id="int-step-label" style="font-weight:bold; margin-bottom:0.3rem">Step</div>
                    <div id="int-prompt" style="font-size:1.05rem; margin-bottom:0.4rem">—</div>
                    <div id="int-expected" style="color:#555; font-size:0.9rem">—</div>
                    <div style="margin-top:0.4rem; font-size:0.9rem; color:#333">
                        <span id="label-recognized">Recognized:</span> <span id="recognized-text" data-testid="recognized-text">—</span>
                    </div>
                    <div style="font-size:0.9rem; color:#333">
                        <span id="label-speech">Speech:</span> <span id="speech-text" data-testid="speech-text">—</span>
                    </div>
                </div>

                <div style="margin-bottom:0.6rem">
                    <button id="int-btn-next" data-testid="interactive-next-button">▶ Next Step</button>
                    <button id="int-btn-repeat" data-testid="interactive-repeat-button">↺ Repeat Step</button>
                    <button id="int-btn-skip" data-testid="interactive-skip-button">⏭ Skip Step</button>
                    <button id="int-btn-pause" data-testid="interactive-stop-button">⏸ Pause</button>
                    <button id="int-btn-resume" data-testid="interactive-resume-button">⏵ Resume</button>
                </div>

                <div id="int-confirm-block" style="display:none; margin-bottom:0.6rem">
                    <div style="margin-bottom:0.3rem">
                        <b id="label-recognized-q">Recognized correctly?</b>
                        <button id="int-btn-recognized-yes" data-testid="manual-recognized-yes-button">✓ Correct</button>
                        <button id="int-btn-recognized-no" data-testid="manual-recognized-no-button">✗ Incorrect</button>
                    </div>
                    <div style="margin-bottom:0.3rem">
                        <b id="label-heard-q">Expected speech heard?</b>
                        <button id="int-btn-heard-yes" data-testid="manual-heard-yes-button">✓ Heard</button>
                        <button id="int-btn-heard-no" data-testid="manual-heard-no-button">✗ Not heard</button>
                    </div>
                    <label style="display:block; margin-top:0.4rem">
                        <span id="label-tester-comment">Tester comment:</span>
                        <br/>
                        <textarea id="int-comment" data-testid="manual-comment" rows="2" style="width:100%"></textarea>
                    </label>
                    <div style="margin-top:0.3rem">
                        <button id="int-btn-save-comment" data-testid="manual-save-comment-button">Save comment</button>
                        <span id="int-comment-status" style="margin-left:0.5rem; color:#888">Not saved</span>
                    </div>
                </div>

                <div id="int-summary-box" style="display:none; background:#eef7ee; border:1px solid #b6d7b6; border-radius:4px; padding:0.8rem; margin-top:0.6rem">
                    <div style="font-weight:bold; margin-bottom:0.4rem" id="int-summary-title">Session Summary</div>
                    <div id="int-summary-content" data-testid="interactive-summary"></div>
                    <button id="int-btn-restart" data-testid="interactive-reset-button" style="margin-top:0.6rem">↻ Start New Session</button>
                </div>
            </div>

            <div>
                <h3 id="verification-title">Verification</h3>
                <div id="verification-result" data-testid="verification-panel">—</div>
            </div>

            <h3 id="execution-log-title">Execution Log</h3>
            <pre id="exec-log" data-testid="execution-log" style="background:#111;color:#0f0;padding:1rem;height:200px;overflow:auto"></pre>

            <h3 id="last-report-title">Last Completed Report</h3>
            <div id="report-preview-box" data-testid="last-report" style="background:#f4f4f4; border:1px solid #ccc; padding:1rem; margin-bottom:1rem; min-height:100px; border-radius:4px; font-size:0.9rem; color:#333;">
                <i id="report-preview-placeholder">Run All or finish an Interactive session to view a report here.</i>
            </div>

            <h3 id="json-report-title">JSON Report</h3>
            <pre id="json-report" data-testid="json-report" style="background:#111;color:#0ff;padding:1rem;height:200px;overflow:auto"></pre>

            <h3 id="report-history-title">Report History</h3>
            <pre id="report-history" data-testid="report-history" style="font-size:0.9rem">—</pre>

            <div style="margin-top:1rem">
                <input id="json-upload-input" data-testid="legacy-upload-input" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0" />
                <label id="btn-upload" data-testid="legacy-upload-button" for="json-upload-input" role="button" tabindex="0" style="display:inline-block;padding:1px 6px;border:1px solid #767676;border-radius:2px;background:#efefef;cursor:pointer;font-size:13px;margin-right:0.25rem">Upload</label>
                <span id="upload-json-status" style="margin-left:0.5rem; color:#666; font-size:0.9rem"></span>
                <button id="btn-download" data-testid="download-json-button">Download JSON</button>
                <button id="btn-send" data-testid="send-report-button">Send Report</button>
            </div>
        </div>
    `

    const sessionRoot = root.querySelector<HTMLElement>("#session-root")!
    const getMeta = renderSessionPanel(sessionRoot)
    const uiLanguageSelect = sessionRoot.querySelector<HTMLSelectElement>("#s-ui-language")!
    const voiceLanguageSelect = sessionRoot.querySelector<HTMLSelectElement>("#s-voice-language")!

    const ui = () => getBenchUiStrings(getMeta().uiLanguage)

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

    // PR-11: rebuilds the "Inject action" dropdown from whichever
    // ScenarioSet is currently active. Called once at mount and again
    // every time the tester switches Scenario Source.
    function refreshInjectOptions(): void {
        const triggers = getScenarioTriggers()
        injectSelect.innerHTML = triggers.map(t => `<option value="${t}">${t}</option>`).join("")
    }

    // PR-11: External JSON Scenarios ---------------------------------

    function setScenarioError(message: string | null): void {
        scenarioErrorEl.style.display = message ? "block" : "none"
        scenarioErrorEl.textContent = message ?? ""
    }

    function activateScenarioSet(
        set: ScenarioSet,
        source: "builtin" | "file",
        fileName: string | null
    ): void {
        loadScenarioSetIntoRegistry(app.registry, set)
        app.activeScenarioSet = set
        app.activeScenarioSource = source
        app.activeScenarioFileName = fileName
        scenarioFileNameEl.textContent = fileName ?? "builtin.json"
        refreshInjectOptions()
        setScenarioError(null)
        // A newly activated ScenarioSet invalidates any Interactive
        // session already in progress against the old one.
        if (modeSelect.value === "interactive") {
            startInteractiveSession()
        }
    }

    function activateBuiltinScenarios(): void {
        activateScenarioSet(loadBuiltinScenarioSet(), "builtin", null)
    }

    // Keeps the radio buttons in sync with whichever ScenarioSet is
    // actually active. Used after a failed upload: the invalid file
    // never becomes active, so the radios must reflect that instead
    // of appearing to have switched.
    function syncScenarioSourceRadios(): void {
        scenarioSourceBuiltinRadio.checked = app.activeScenarioSource === "builtin"
        scenarioSourceFileRadio.checked = app.activeScenarioSource === "file"
        btnChooseScenarioFile.disabled = app.activeScenarioSource === "builtin"
    }

    async function activateScenarioFile(file: File): Promise<void> {
        const text = await file.text()
        let raw: unknown
        try {
            raw = JSON.parse(text)
        } catch {
            const message = ui().alertUploadInvalidJson
            setScenarioError(message)
            syncScenarioSourceRadios()
            alert(message)
            return
        }
        try {
            const set = await new JsonScenarioProvider(raw).load()
            activateScenarioSet(set, "file", file.name)
        } catch (error) {
            const message = error instanceof ScenarioSetValidationError
                ? error.message
                : String(error)
            setScenarioError(message)
            syncScenarioSourceRadios()
            alert(message)
        }
    }
    const modeSelect = root.querySelector<HTMLSelectElement>("#mode-select")!

    // PR-11: External JSON Scenarios
    const scenarioSourceBuiltinRadio = root.querySelector<HTMLInputElement>("#scenario-source-builtin")!
    const scenarioSourceFileRadio = root.querySelector<HTMLInputElement>("#scenario-source-file")!
    const scenarioFileInput = root.querySelector<HTMLInputElement>("#scenario-file-input")!
    const btnChooseScenarioFile = root.querySelector<HTMLButtonElement>("#btn-choose-scenario-file")!
    const scenarioFileNameEl = root.querySelector<HTMLSpanElement>("#scenario-file-name")!
    const scenarioErrorEl = root.querySelector<HTMLDivElement>("#scenario-error")!

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
    const recognizedTextEl = root.querySelector<HTMLSpanElement>("#recognized-text")!
    const speechTextEl = root.querySelector<HTMLSpanElement>("#speech-text")!
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
    const btnRunAll = root.querySelector<HTMLButtonElement>("#btn-run-all")!
    const btnStart = root.querySelector<HTMLButtonElement>("#btn-start")!
    const btnStop = root.querySelector<HTMLButtonElement>("#btn-stop")!
    const btnInject = root.querySelector<HTMLButtonElement>("#btn-inject")!
    const btnConnect = root.querySelector<HTMLButtonElement>("#btn-connect")!
    const btnUpload = root.querySelector<HTMLLabelElement>("#btn-upload")!
    const jsonUploadInput = root.querySelector<HTMLInputElement>("#json-upload-input")!
    const uploadJsonStatus = root.querySelector<HTMLSpanElement>("#upload-json-status")!
    const btnDownload = root.querySelector<HTMLButtonElement>("#btn-download")!
    const btnSend = root.querySelector<HTMLButtonElement>("#btn-send")!

    function applyUiLanguage(): void {
        const strings = ui()
        const uiLanguage = getMeta().uiLanguage

        document.documentElement.lang = uiLanguage
        root.dir = uiLanguage === "ar-MA" ? "rtl" : "ltr"

        document.title = strings.pageTitle
        root.querySelector<HTMLElement>("#page-title")!.textContent = strings.pageTitle
        applySessionPanelLabels(sessionRoot, strings)

        root.querySelector<HTMLElement>("#label-backend")!.textContent = `${strings.backend}:`
        root.querySelector<HTMLElement>("#label-mail")!.textContent = `${strings.mail}:`
        root.querySelector<HTMLElement>("#label-validation-mode")!.textContent = `${strings.validationMode}:`
        modeSelect.options[0].text = strings.automatic
        modeSelect.options[1].text = strings.interactive
        root.querySelector<HTMLElement>("#label-input-source")!.textContent = `${strings.inputSource}:`
        inputSourceSelect.options[0].text = strings.inputMic
        inputSourceSelect.options[1].text = strings.inputInject

        btnConnect.textContent = strings.connect
        btnStart.textContent = strings.start
        btnStop.textContent = strings.stop
        btnRunAll.textContent = strings.runAll
        root.querySelector<HTMLElement>("#label-inject-action")!.textContent = strings.injectAction
        btnInject.textContent = strings.send

        if (micStatus.textContent === "🎤 Idle" || micStatus.textContent === strings.micIdle ||
            micStatus.textContent === getBenchUiStrings("en-US").micIdle ||
            micStatus.textContent === getBenchUiStrings("ru-RU").micIdle ||
            micStatus.textContent === getBenchUiStrings("ar-MA").micIdle) {
            micStatus.textContent = strings.micIdle
        }

        root.querySelector<HTMLElement>("#label-channel-state")!.innerHTML = `<b>${strings.channelState}:</b>`
        root.querySelector<HTMLElement>("#label-progress")!.innerHTML = `<b>${strings.progress}:</b>`
        root.querySelector<HTMLElement>("#interactive-runner-title")!.textContent = strings.interactiveRunner
        root.querySelector<HTMLElement>("#label-int-session-state")!.innerHTML = `<b>${strings.sessionState}:</b>`
        root.querySelector<HTMLElement>("#label-int-scenario")!.innerHTML = `<b>${strings.scenario}:</b>`
        root.querySelector<HTMLElement>("#label-int-progress")!.innerHTML = `<b>${strings.progress}:</b>`
        root.querySelector<HTMLElement>("#label-recognized")!.textContent = `${strings.recognized}:`
        root.querySelector<HTMLElement>("#label-speech")!.textContent = `${strings.speech}:`

        btnRepeat.textContent = strings.repeatStep
        btnSkip.textContent = strings.skipStep
        btnPause.textContent = strings.pause
        btnResume.textContent = strings.resume
        root.querySelector<HTMLElement>("#label-recognized-q")!.textContent = strings.recognizedQuestion
        btnRecYes.textContent = strings.recognizedYes
        btnRecNo.textContent = strings.recognizedNo
        root.querySelector<HTMLElement>("#label-heard-q")!.textContent = strings.heardQuestion
        btnHeardYes.textContent = strings.heardYes
        btnHeardNo.textContent = strings.heardNo
        root.querySelector<HTMLElement>("#label-tester-comment")!.textContent = strings.testerComment
        btnSaveComment.textContent = strings.saveComment
        root.querySelector<HTMLElement>("#int-summary-title")!.textContent = strings.sessionSummary
        btnRestart.textContent = strings.startNewSession

        root.querySelector<HTMLElement>("#verification-title")!.textContent = strings.verification
        root.querySelector<HTMLElement>("#execution-log-title")!.textContent = strings.executionLog
        root.querySelector<HTMLElement>("#last-report-title")!.textContent = strings.lastCompletedReport
        root.querySelector<HTMLElement>("#json-report-title")!.textContent = strings.jsonReport
        root.querySelector<HTMLElement>("#report-history-title")!.textContent = strings.reportHistory
        root.querySelector<HTMLElement>("#label-scenario-source")!.textContent = strings.scenarioSourceLabel
        root.querySelector<HTMLElement>("#label-scenario-source-builtin")!.textContent = strings.scenarioSourceBuiltin
        root.querySelector<HTMLElement>("#label-scenario-source-file")!.textContent = strings.scenarioSourceFile
        root.querySelector<HTMLElement>("#label-scenario-file")!.textContent = strings.scenarioFileLabel
        btnChooseScenarioFile.textContent = strings.chooseScenarioFile

        btnDownload.textContent = strings.downloadJson
        btnUpload.textContent = strings.uploadJson
        if (uploadedJsonFileName) {
            uploadJsonStatus.textContent = `${strings.uploadJsonLoaded}: ${uploadedJsonFileName}`
        }
        btnSend.textContent = strings.sendReport

        if (!lastReport) {
            root.querySelector<HTMLElement>("#report-preview-placeholder")!.textContent = strings.reportPreviewHint
        }

        refreshCommentStatusLabel()

        if (lastReport) {
            updateReportPreview(lastReport)
        }

        if (controller.getState() === StepState.Finished && intSummaryBox.style.display !== "none") {
            intPrompt.textContent = strings.allScenariosDone
            renderInteractiveSummary()
        }

        renderInteractiveState()
    }

    function applyVoiceLanguage(): void {
        const voiceLanguage = getMeta().voiceLanguage
        app.recognition.setLanguage(voiceLanguage)
        app.speech.setLanguage(voiceLanguage)

        if (modeSelect.value === "interactive" &&
            controller.getState() !== StepState.Finished &&
            interactiveIndex < interactiveScenarios.length) {
            loadCurrentPrompt()
        }
    }

    let startedAt = new Date().toISOString()
    let isRunning = false
    let lastReport: ReturnType<typeof buildValidationReport> | null = null
    let lastMeta: SessionMeta | null = null
    let uploadedJsonFileName: string | null = null

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

    function refreshCommentStatusLabel(): void {
        const strings = ui()
        if (intComment.value !== savedCommentText && intComment.value.length > 0) {
            intCommentStatus.textContent = strings.commentUnsaved
            intCommentStatus.style.color = "#c78a00"
        } else if (savedCommentText && intComment.value === savedCommentText) {
            intCommentStatus.textContent = strings.commentSaved
            intCommentStatus.style.color = "green"
        } else {
            intCommentStatus.textContent = strings.commentNotSaved
            intCommentStatus.style.color = "#888"
        }
    }

    function setCommentUnsaved(): void {
        refreshCommentStatusLabel()
    }

    function setCommentSaved(): void {
        refreshCommentStatusLabel()
    }

    function resetCommentState(): void {
        intComment.value = ""
        savedCommentText = ""
        refreshCommentStatusLabel()
        // PR-9d.2 fix: also clear the Recognized/Heard button
        // highlighting when a new step starts, so a fresh step never
        // visually shows the previous step's leftover selection.
        btnRecYes.setAttribute("style", "")
        btnRecNo.setAttribute("style", "")
        btnHeardYes.setAttribute("style", "")
        btnHeardNo.setAttribute("style", "")
        // PR-9d.2.1 fix (per client's testability request): clear the
        // dedicated recognized/speech text indicators for the new step.
        recognizedTextEl.textContent = "—"
        speechTextEl.textContent = "—"
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

    /**
     * PR-9e.2 fix: each Automatic / Interactive session must start from a
     * clean voice stack. Interactive mic mode stops recognition via
     * channel.stop(); without re-preparing here, the next Automatic run
     * could lose Event/Speak handling or stay silent after speechSynthesis
     * was cancelled.
     */
    async function prepareVoiceForNewSession(): Promise<void> {
        await app.channel.stop()
        app.channel.ensureInteractionSubscribed()
        await app.speech.stop()
        obsState.textContent = app.channel.getState()
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
        const strings = ui()
        const status = report?.Summary?.status || "PASS"
        const color = status === "PASS" ? "green" : "red"
        const generatedAt = new Date().toLocaleString()
        const validationMode = formatValidationModeLabel(report?.ValidationMode || "Automatic", getMeta().uiLanguage)

        reportPreviewBox.innerHTML = `
            <div style="background: #fff; border-left: 4px solid ${color}; padding: 0.8rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="margin-bottom:0.4rem; color:#888; font-size:0.8rem;">${strings.generatedAt}: ${generatedAt}</div>
                <div style="margin-bottom:0.4rem"><strong>${strings.status}:</strong> <span style="color:${color};font-weight:bold">${status}</span></div>
                <div style="margin-bottom:0.4rem"><strong>${strings.tester}:</strong> ${report?.Session?.tester || "Tester"} | <strong>${strings.uiLanguage}:</strong> ${report?.Session?.uiLanguage || "en-US"} | <strong>${strings.voiceLanguage}:</strong> ${report?.Session?.language || "en-US"}</div>
                <div style="margin-bottom:0.4rem"><strong>${strings.mode}:</strong> ${validationMode} | <strong>${strings.inputSourceShort}:</strong> ${report?.TestConfiguration?.inputSource || "inject"}</div>
                <div style="margin-bottom:0.4rem"><strong>${strings.recognition}:</strong> ${report?.TestConfiguration?.recognitionProvider || "Browser"} | <strong>${strings.speechLabel}:</strong> ${report?.TestConfiguration?.speechProvider || "Browser"} | <strong>${strings.scenarioSet}:</strong> ${report?.TestConfiguration?.scenarioSet || "automatic"}</div>
                <div style="margin-bottom:0.4rem"><strong>${strings.scenarios}:</strong> ${report?.Summary?.totalScenarios || 0} (${strings.passed}: ${report?.Summary?.passed || 0}, ${strings.failed}: ${report?.Summary?.failed || 0})</div>
                <div><strong>${strings.duration}:</strong> ${report?.Summary?.durationMs || 0} ms</div>
            </div>
        `
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
        const strings = ui()
        const state = controller.getState()
        intSessionState.textContent = state
        intSessionState.setAttribute("data-state", state)
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
            btnNext.textContent = strings.nextStep
        } else {
            btnNext.textContent = inputSourceSelect.value === "mic"
                ? strings.startListening
                : strings.startStep
        }
    }

    function loadCurrentPrompt(): void {
        if (interactiveIndex >= interactiveScenarios.length) {
            finishInteractiveSession()
            return
        }
        const trigger = interactiveScenarios[interactiveIndex]
        const voiceLanguage = getMeta().voiceLanguage
        const script = getInteractiveScript(trigger, voiceLanguage)
        intStepLabel.textContent = getStepLabel(voiceLanguage)
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
        interactiveScenarios = [...getScenarioTriggers()]
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
        micStatus.textContent = ui().micListening
        app.recognition.setLanguage(getMeta().voiceLanguage)
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
                    recognizedTextEl.textContent = currentResult.recognizedText ?? "—"
                }
                resolve()
            }
        })

        micStatus.textContent = ui().micIdle
        refreshLog()
        controller.waitForTester()
        renderInteractiveState()
    }

    async function performCurrentStep(): Promise<void> {
        const trigger = interactiveScenarios[interactiveIndex]
        const stepStartedAt = Date.now()

        // PR-9d.2 fix: this function is called both to start a brand
        // NEW step AND to re-run the SAME step for "Repeat Step".
        // Previously it always replaced currentResult with a fresh
        // object (repeated: 0), which silently discarded the repeat
        // counter incremented by the Repeat Step handler right before
        // calling this — so the "attempt" number logged never advanced
        // past 2, no matter how many times Repeat was pressed. Now we
        // only create a new result object when there isn't one yet
        // (a genuinely new step); otherwise we keep it and just clear
        // the per-attempt recognition fields.
        if (!currentResult) {
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
        } else {
            currentResult.recognized = null
            currentResult.heard = null
            currentResult.recognizedText = null
            currentResult.speechText = null
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

    function renderInteractiveSummary(): void {
        const strings = ui()
        const total = manualResults.length
        const confirmed = manualResults.filter(r => r.recognized && r.heard).length
        const warnings = manualResults.filter(r => r.recognized !== r.heard).length
        const repeated = manualResults.reduce((sum, r) => sum + r.repeated, 0)
        const skipped = manualResults.filter(r => r.skipped).length

        intSummaryContent.innerHTML = `
            <div>${strings.summaryTotal}: <b>${total}</b></div>
            <div>${strings.summaryConfirmed}: <b style="color:green">${confirmed}</b></div>
            <div>${strings.summaryWarnings}: <b style="color:orange">${warnings}</b></div>
            <div>${strings.summaryRepeats}: <b>${repeated}</b></div>
            <div>${strings.summarySkipped}: <b>${skipped}</b></div>
        `
    }

    function finishInteractiveSession(): void {
        controller.stop()
        void prepareVoiceForNewSession().then(() => {
            obsState.textContent = app.channel.getState()
        })
        const strings = ui()
        intPrompt.textContent = strings.allScenariosDone
        intExpected.textContent = ""
        renderInteractiveState()

        const total = manualResults.length
        const confirmed = manualResults.filter(r => r.recognized && r.heard).length
        const warnings = manualResults.filter(r => r.recognized !== r.heard).length
        const repeated = manualResults.reduce((sum, r) => sum + r.repeated, 0)
        const skipped = manualResults.filter(r => r.skipped).length

        intSummaryBox.style.display = "block"
        renderInteractiveSummary()

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
            inputSource: inputSourceSelect.value,
            ...getScenarioReportOptions()
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
        void prepareVoiceForNewSession().then(() => {
            if (interactive) {
                startedAt = new Date().toISOString()
                app.executionLog.clear()
                execLogEl.textContent = ""
                startInteractiveSession()
            }
        })
    })

    // PR-9d.2 fix (per client feedback): after a session finished,
    // there was no visible way to start a new one — the top Connect/
    // Start/Stop/Run All buttons don't apply to Interactive mode, and
    // toggling the Validation Mode dropdown away and back is not an
    // obvious action to a tester. This button restarts the Interactive
    // session directly, right next to the summary the tester is
    // already looking at.
    btnRestart.addEventListener("click", () => {
        void prepareVoiceForNewSession().then(() => {
            startedAt = new Date().toISOString()
            app.executionLog.clear()
            execLogEl.textContent = ""
            startInteractiveSession()
        })
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
        speechTextEl.textContent = text
    }

    // PR-9d.2 fix (per client feedback, item 5): the old "Speak" log
    // entry only meant "we asked the browser to speak this text" — it
    // said nothing about whether playback actually started, finished,
    // or failed. These three hooks log the browser's REAL
    // speechSynthesis lifecycle events, so a reader can tell the
    // difference between "we requested speech" and "the tester's
    // speakers genuinely played it".
    app.speech.onStarted = (text) => {
        app.executionLog.append("SpeechStarted", { text })
        refreshLog()
    }
    app.speech.onFinished = (text) => {
        app.executionLog.append("SpeechFinished", { text })
        refreshLog()
    }
    app.speech.onError = (text, message) => {
        app.executionLog.append("SpeechError", { text, message })
        refreshLog()
    }

    function setAutomaticRunLocked(locked: boolean): void {
        isRunning = locked
        btnRunAll.disabled = locked
        btnStart.disabled = locked
        btnStop.disabled = locked
        btnInject.disabled = locked
    }

    root.querySelector("#btn-connect")!.addEventListener("click", async () => {
        const meta = getMeta()
        lastMeta = meta
        const session = await app.backend.connect(
            "https://ibronevik.ru/taxi/c/gruzvill",
            meta.login,
            meta.password
        )
        const strings = ui()
        connLabel.textContent = session.status === "connected"
            ? strings.connConnected
            : `${strings.connFailedPrefix} ${session.status}`
        mailLabel.textContent = session.status === "connected" ? strings.mailReady : "—"
    })

    btnStart.addEventListener("click", async () => {
        if (isRunning) return
        startedAt = new Date().toISOString()
        app.executionLog.clear()
        execLogEl.textContent = ""
        await app.channel.start()
        obsState.textContent = app.channel.getState()
    })

    btnStop.addEventListener("click", async () => {
        if (isRunning) return
        await app.channel.stop()
        obsState.textContent = app.channel.getState()
    })

    btnInject.addEventListener("click", async () => {
        if (isRunning) return
        const type = injectSelect.value
        await app.channel.injectAction({ type, payload: {} })
        refreshLog()
    })

    // PR-11: External JSON Scenarios
    scenarioSourceBuiltinRadio.addEventListener("change", () => {
        if (!scenarioSourceBuiltinRadio.checked) return
        btnChooseScenarioFile.disabled = true
        activateBuiltinScenarios()
    })

    scenarioSourceFileRadio.addEventListener("change", () => {
        if (!scenarioSourceFileRadio.checked) return
        btnChooseScenarioFile.disabled = false
        // The previously active ScenarioSet (builtin or a prior file)
        // stays active until a new file is actually chosen and passes
        // validation — Run All/Interactive never run against nothing.
    })

    btnChooseScenarioFile.addEventListener("click", () => {
        scenarioFileInput.click()
    })

    scenarioFileInput.addEventListener("change", () => {
        const file = scenarioFileInput.files?.[0]
        if (!file) return
        void activateScenarioFile(file).finally(() => {
            scenarioFileInput.value = ""
        })
    })

    btnRunAll.addEventListener("click", async () => {
        // PR-9e.2: isRunning prevents overlapping Automatic cycles. Without
        // this guard, rapid Run All clicks start parallel loops and corrupt
        // ExecutionLog / the generated report.
        if (isRunning) return

        // PR-11: guard against an empty/broken active ScenarioSet.
        // Checking the registry directly (not a manually-tracked flag)
        // means this can never go stale — it reflects exactly what
        // Run All is about to execute. (A flag set on upload failure
        // and cleared only via the radio's "change" event went stale
        // here: re-checking a radio programmatically, as the failure
        // path does, does not fire "change", so the flag never got
        // cleared even though Built-in was correctly still active —
        // this silently blocked every subsequent Run All. Found via a
        // real Playwright run, not caught by tsc.)
        if (app.registry.list().length === 0) {
            alert("No scenarios are loaded. Select a valid Scenario Source before running.")
            return
        }

        setAutomaticRunLocked(true)

        try {
            await prepareVoiceForNewSession()

            startedAt = new Date().toISOString()
            app.executionLog.clear()
            execLogEl.textContent = ""

            // PR-9d.2 fix: use the currently selected session settings,
            // not a stale lastMeta from an earlier click.
            const meta = getMeta()
            lastMeta = meta

            const uiLanguage = meta.uiLanguage
            const triggers = getScenarioTriggers()
            for (let i = 0; i < triggers.length; i++) {
                obsProgress.textContent = formatRunningScenario(uiLanguage, i + 1, triggers.length)
                await app.channel.injectAction({ type: triggers[i], payload: {} })

                await new Promise<void>(resolve => {
                    setTimeout(() => resolve(), 700)
                })

                refreshLog()
            }

            obsProgress.textContent = getProgressDoneLabel(uiLanguage)

            const totalScenariosCount = app.registry.list().length || 0
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
                inputSource: "inject",
                ...getScenarioReportOptions()
            })
            lastReport = report
            reportHistory.add(report)
            refreshHistory()
            updateReportPreview(report)
            jsonReportEl.textContent = JSON.stringify(report, null, 2)
        } finally {
            setAutomaticRunLocked(false)
        }
    })

    btnUpload.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            jsonUploadInput.click()
        }
    })

    jsonUploadInput.addEventListener("change", () => {
        const file = jsonUploadInput.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = () => {
            try {
                JSON.parse(String(reader.result ?? ""))
                uploadedJsonFileName = file.name
                uploadJsonStatus.textContent = `${ui().uploadJsonLoaded}: ${file.name}`
            } catch {
                uploadedJsonFileName = null
                uploadJsonStatus.textContent = ""
                alert(ui().alertUploadInvalidJson)
            } finally {
                jsonUploadInput.value = ""
            }
        }
        reader.readAsText(file)
    })

    btnDownload.addEventListener("click", () => {
        if (!lastReport) { alert(ui().alertRunAllFirst); return }
        const meta = lastMeta ?? getMeta()
        const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = generateReportFilename(meta)
        a.click()
        URL.revokeObjectURL(url)
    })

    btnSend.addEventListener("click", async () => {
        const strings = ui()
        if (!lastReport) { alert(strings.alertRunAllFirst); return }

        const baseUrl = "https://ibronevik.ru/taxi/c/gruzvill"
        const emailId = await app.backend.getEmailId(baseUrl)
        if (!emailId) {
            alert(strings.alertSendNoEmail)
            return
        }
        const result = await app.backend.sendReport(
            baseUrl,
            lastReport,
            emailId
        )
        alert(result ? strings.alertSendSuccess : strings.alertSendFailed)
    })

    uiLanguageSelect.addEventListener("change", () => {
        applyUiLanguage()
    })

    voiceLanguageSelect.addEventListener("change", () => {
        applyVoiceLanguage()
    })

    applyUiLanguage()
    applyVoiceLanguage()

}