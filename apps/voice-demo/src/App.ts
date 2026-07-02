/**
 * Validation Bench - PR-9d.5
 *
 * Main UI: Session Panel, Controls, Live Observer, Verification, Report.
 */

import type { BenchApp } from "./Bootstrap"
import type { SessionMeta } from "./SessionPanel"
import { renderSessionPanel } from "./SessionPanel"
import { VerificationRunner } from "../../../packages/verification/dist/index"
import { buildValidationReport, generateReportFilename } from "./ValidationReportManager"
import { ReportHistory, type ReportHistoryEntry } from "./ReportHistory"

const SCENARIO_TRIGGERS = ["voice.recognized", "interaction.echo", "interaction.delayed"]

export function mountApp(root: HTMLElement, app: BenchApp): void {

    const reportHistory = new ReportHistory()

    root.innerHTML = `
        <div style="font-family:sans-serif;padding:1rem;max-width:900px">
            <h1>Validation Bench</h1>

            <div id="session-root"></div>

            <div style="margin:0.5rem 0;font-weight:bold">
                Backend: <span id="conn-label">—</span>
                &nbsp;|&nbsp; Mail: <span id="mail-label">—</span>
            </div>

            <div style="margin:1rem 0">
                <div style="margin-top:0.5rem">
                    <button id="btn-connect">Connect</button>
                    <button id="btn-start">▶ Start</button>
                    <button id="btn-stop">■ Stop</button>
                    <button id="btn-run-all">▶ Run All</button>
                </div>
                <div style="margin-top:0.5rem">
                    <label>Inject action:
                        <select id="inject-select">
                            ${SCENARIO_TRIGGERS.map(t => `<option value="${t}">${t}</option>`).join("")}
                        </select>
                    </label>
                    <button id="btn-inject">Send</button>
                </div>
            </div>

            <div style="margin:0.5rem 0">
                <b>Channel State:</b> <span id="obs-state">—</span>
                &nbsp;|&nbsp; <b>Progress:</b> <span id="obs-progress">—</span>
            </div>

            <div>
                <h3>Verification</h3>
                <div id="verification-result">—</div>
            </div>

            <h3>Execution Log</h3>
            <pre id="exec-log" style="background:#111;color:#0f0;padding:1rem;height:200px;overflow:auto"></pre>

            <!-- Окно предварительного просмотра отчета -->
            <h3>Report Preview</h3>
            <div id="report-preview-box" style="background:#f4f4f4; border:1px solid #ccc; padding:1rem; margin-bottom:1rem; min-height:100px; border-radius:4px; font-size:0.9rem; color:#333;">
                <i>Чтобы просмотреть отчет, сначала нажмите кнопку "Run All"...</i>
            </div>

            <h3>JSON Report</h3>
            <pre id="json-report" style="background:#111;color:#0ff;padding:1rem;height:200px;overflow:auto"></pre>

            <h3>Report History</h3>
            <div id="report-history" style="font-size:0.9rem">—</div>

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

    let startedAt = new Date().toISOString()
    let lastReport: ReturnType<typeof buildValidationReport> | null = null
    let lastMeta: SessionMeta | null = null

    function refreshLog(): void {
        const entries = app.executionLog.getEntries()
        execLogEl.textContent = entries
            .map(e => `[${e.kind}] ${JSON.stringify(e.payload)}`)
            .join("\n")
        execLogEl.scrollTop = execLogEl.scrollHeight
    }

    // Функция обновления истории
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

    // Безопасная функция предварительного просмотра отчета
    function updateReportPreview(report: any): void {
        const status = report?.Summary?.status || "PASS";
        const color = status === "PASS" ? "green" : "red";
        
        reportPreviewBox.innerHTML = `
            <div style="background: #fff; border-left: 4px solid ${color}; padding: 0.8rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="margin-bottom:0.4rem"><strong>Status:</strong> <span style="color:${color};font-weight:bold">${status}</span></div>
                <div style="margin-bottom:0.4rem"><strong>Tester:</strong> ${report?.Session?.tester || "Tester"} | <strong>Language:</strong> ${report?.Session?.language || "en-US"}</div>
                <div style="margin-bottom:0.4rem"><strong>Scenarios:</strong> ${report?.Summary?.totalScenarios || 0} (Passed: ${report?.Summary?.passed || 0}, Failed: ${report?.Summary?.failed || 0})</div>
                <div><strong>Duration:</strong> ${report?.Summary?.durationMs || 0} ms</div>
            </div>
        `;
    }

    app.channel.onAction = (action) => {
        app.logger.logAction(action)
        refreshLog()
    }

    app.channel.onEvent = (event) => {
        app.logger.logEvent(event)
        refreshLog()
    }

    app.channel.onSpeak = (text) => {
        app.logger.logSpeak(text)
        refreshLog()
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
        const meta = lastMeta ?? getMeta()
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

        const runner = new VerificationRunner(app.executionLog)

        const verificationScenarios = app.registry.list().map(sc => {
            const trigger = sc.trigger
            const emitSteps = sc.steps.filter(
                (s): s is { kind: "emit"; event: { type: string; payload: unknown } } => s.kind === "emit"
            )
            
            // Передаем оба варианта (и step, и type) для полной совместимости и надежности
            const expectations = [
                { kind: "Action", payload: { type: trigger }, optional: false },
                ...emitSteps.flatMap(step => [
                    { kind: "Event", payload: { type: step.event.type, step: step.event.type }, optional: false },
                    { kind: "Speak", optional: false }
                ])
            ]
            return { id: sc.name, name: sc.name, expectations }
        })

        const verification = runner.runAll(verificationScenarios)

        verificationResult.innerHTML = verification.failed === 0
            ? `<span style="color:green">✅ PASS (${verification.passed}/${verification.totalScenarios})</span>`
            : `<span style="color:red">❌ FAIL (${verification.failed} errors)</span><br>${
                verification.errors.map(e => `• ${e}`).join("<br>")
              }`

        const entries = app.executionLog.getEntries()
        const report = buildValidationReport(meta, startedAt, verification, entries)
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
        
        const result = await app.backend.sendReport(
            "https://ibronevik.ru/taxi/c/gruzvill",
            lastReport
        )
        alert(result ? "✅ Report sent!" : "❌ Send failed!")
    })

}