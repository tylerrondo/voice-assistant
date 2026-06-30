/**
 * Validation Bench
 *
 * Main UI: Session Panel, Controls, Live Observer, Verification, Report.
 */

import type { BenchApp } from "./Bootstrap"
import type { SessionMeta } from "./SessionPanel"
import { renderSessionPanel } from "./SessionPanel"
import { buildReport } from "./ReportBuilder"
import { VerificationRunner } from "../../../packages/verification/dist/index"

export function mountApp(root: HTMLElement, app: BenchApp): void {

    root.innerHTML = `
        <div style="font-family:sans-serif;padding:1rem;max-width:900px">
            <h1>Validation Bench</h1>
            <div id="session-root"></div>
            <div style="margin:0.5rem 0;font-weight:bold">
                Status: <span id="conn-label">-</span>
            </div>
            <div style="margin:1rem 0">
                <button id="btn-connect">Connect</button>
                <button id="btn-start">Start</button>
                <button id="btn-stop">Stop</button>
                <button id="btn-run-all">Run All</button>
                <button id="btn-send">Send Report</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                <div>
                    <h3>Live Observer</h3>
                    <p>Channel State: <span id="obs-state">-</span></p>
                </div>
                <div>
                    <h3>Verification</h3>
                    <div id="verification-result">-</div>
                </div>
            </div>
            <h3>Execution Log</h3>
            <pre id="exec-log" style="background:#111;color:#0f0;padding:1rem;height:200px;overflow:auto"></pre>
            <h3>JSON Report</h3>
            <pre id="json-report" style="background:#111;color:#0ff;padding:1rem;height:200px;overflow:auto"></pre>
        </div>
    `

    const sessionRoot = root.querySelector<HTMLElement>("#session-root")!
    const getMeta = renderSessionPanel(sessionRoot)
    const connLabel = root.querySelector<HTMLSpanElement>("#conn-label")!
    const obsState = root.querySelector<HTMLSpanElement>("#obs-state")!
    const verificationResult = root.querySelector<HTMLDivElement>("#verification-result")!
    const execLogEl = root.querySelector<HTMLPreElement>("#exec-log")!
    const jsonReportEl = root.querySelector<HTMLPreElement>("#json-report")!

    let startedAt = new Date().toISOString()
    let lastReport: unknown = null
    let lastMeta: SessionMeta | null = null

    function appendLog(entry: { kind: string; payload: unknown }): void {
        execLogEl.textContent += "[" + entry.kind + "] " + JSON.stringify(entry.payload) + "\n"
        execLogEl.scrollTop = execLogEl.scrollHeight
    }

    root.querySelector("#btn-connect")!.addEventListener("click", async () => {
        const meta = getMeta()
        lastMeta = meta
        const session = await app.backend.connect(
            meta.backendUrl,
            meta.login,
            meta.password
        )
        connLabel.textContent = session.status
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

    root.querySelector("#btn-run-all")!.addEventListener("click", async () => {
        const meta = lastMeta ?? getMeta()
        startedAt = new Date().toISOString()
        app.executionLog.clear()
        execLogEl.textContent = ""

        const triggers = ["voice.recognized", "interaction.echo", "interaction.delayed"]

        const unsubscribe = app.interaction.subscribe((event) => {
            app.logger.logEvent(event)
        })

        for (const triggerType of triggers) {
            const action = { type: triggerType, payload: {} }
            app.logger.logAction(action)
            await app.interaction.dispatch(action)
        }

        unsubscribe()

        const runner = new VerificationRunner(app.executionLog)
        const verificationScenarios = app.registry.list().map(sc => ({
            id: sc.name,
            name: sc.name,
            expectations: []
        }))
        const verification = runner.runAll(verificationScenarios)
        verificationResult.innerHTML = verification.failed === 0
            ? "<span style='color:green'>PASS (" + verification.passed + "/" + verification.totalScenarios + ")</span>"
            : "<span style='color:red'>FAIL (" + verification.failed + " errors)</span>"

        const entries = app.executionLog.getEntries()
        entries.forEach(e => appendLog(e))

        const report = buildReport(meta, startedAt, verification, entries)
        lastReport = report
        jsonReportEl.textContent = JSON.stringify(report, null, 2)
    })

    root.querySelector("#btn-send")!.addEventListener("click", async () => {
        if (!lastReport) { alert("Run All first!"); return }
        const meta = lastMeta ?? getMeta()
        const emailId = await app.backend.getEmailId(meta.backendUrl)
        alert(ok ? "Report sent!" : "Send failed!")
    })
}