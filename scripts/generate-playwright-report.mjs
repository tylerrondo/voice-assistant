// PR-14: Standard Playwright report package for PR review.
//
// Reads test-results/results.json (Playwright's built-in JSON
// reporter, configured in playwright.config.ts) and produces:
//   - playwright-summary.json  (machine-readable summary)
//   - playwright-execution.md  (human-readable protocol)
//
// This script never throws on test failures — it summarizes whatever
// results.json contains, including failed runs, since the whole point
// of PR-14 is that reviewers get the report *especially* when tests
// failed (that's when screenshots/traces/videos matter most).
//
// Usage: node scripts/generate-playwright-report.mjs [--pr=PR-13] [--browser=chromium]

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import process from "node:process"
import { execSync } from "node:child_process"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const RESULTS_JSON_PATH = path.join(REPO_ROOT, "test-results", "results.json")
const SUMMARY_JSON_PATH = path.join(REPO_ROOT, "playwright-summary.json")
const EXECUTION_MD_PATH = path.join(REPO_ROOT, "playwright-execution.md")

function parseArgs(argv) {
    const args = {}
    for (const raw of argv) {
        const match = raw.match(/^--([a-zA-Z0-9_-]+)=(.*)$/)
        if (match) args[match[1]] = match[2]
    }
    return args
}

function readPlaywrightVersion() {
    try {
        const pkgPath = path.join(REPO_ROOT, "node_modules", "@playwright", "test", "package.json")
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
        return pkg.version ?? "unknown"
    } catch {
        return "unknown"
    }
}

function readProjectName() {
    try {
        const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8"))
        // "voice-assistant" -> "Voice Assistant"
        return pkg.name
            .split(/[-_]/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
    } catch {
        return "Voice Assistant"
    }
}

/** Recursively collects { file, ok } for every leaf spec in the JSON reporter's suite tree. */
function collectSpecs(suite, specs = []) {
    if (!suite) return specs
    const file = suite.file ?? null
    for (const spec of suite.specs ?? []) {
        // A spec's own "ok" already accounts for all its tests/retries.
        specs.push({ file: spec.file ?? file, ok: spec.ok !== false, title: spec.title })
    }
    for (const child of suite.suites ?? []) {
        collectSpecs(child, specs)
    }
    return specs
}

function readAppVersion() {
    try {
        const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8"))
        return pkg.version ?? "unknown"
    } catch {
        return "unknown"
    }
}

function readGitCommit() {
    try {
        return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim()
    } catch {
        return "unknown"
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2))

    if (!existsSync(RESULTS_JSON_PATH)) {
        console.error(
            `[generate-playwright-report] ${RESULTS_JSON_PATH} not found.\n` +
            `Make sure playwright.config.ts includes the "json" reporter ` +
            `(outputFile: "test-results/results.json") and that "playwright test" ran first.`
        )
        process.exitCode = 1
        return
    }

    const raw = JSON.parse(readFileSync(RESULTS_JSON_PATH, "utf-8"))
    const stats = raw.stats ?? {}

    const passed = stats.expected ?? 0
    const failed = stats.unexpected ?? 0
    const skipped = stats.skipped ?? 0
    const flaky = stats.flaky ?? 0
    const totalTests = passed + failed + skipped + flaky
    const durationMs = Math.round(stats.duration ?? 0)

    const summary = {
        project: readProjectName(),
        pr: args.pr ?? process.env.PR_NAME ?? "unspecified",
        date: new Date().toISOString(),
        applicationVersion: args["app-version"] ?? process.env.APP_VERSION ?? readAppVersion(),
        gitCommit: args["git-commit"] ?? process.env.GIT_COMMIT ?? readGitCommit(),
        playwrightVersion: readPlaywrightVersion(),
        browser: args.browser ?? process.env.PLAYWRIGHT_BROWSER ?? "chromium",
        totalTests,
        passed,
        failed,
        skipped,
        flaky,
        durationMs
    }

    writeFileSync(SUMMARY_JSON_PATH, JSON.stringify(summary, null, 2) + "\n", "utf-8")

    // Per-file suite list: every distinct spec file, marked pass/fail.
    const allSpecs = (raw.suites ?? []).flatMap(suite => collectSpecs(suite))
    const byFile = new Map()
    for (const spec of allSpecs) {
        const file = spec.file ? path.basename(spec.file) : "(unknown file)"
        const entry = byFile.get(file) ?? { file, ok: true }
        entry.ok = entry.ok && spec.ok
        byFile.set(file, entry)
    }
    const suiteLines = [...byFile.values()]
        .sort((a, b) => a.file.localeCompare(b.file))
        .map(s => `- ${s.ok ? "✓" : "✗"} ${s.file}`)

    const durationSec = (durationMs / 1000).toFixed(1)
    const overallResult = failed > 0 ? "FAILED" : "PASSED"

    const md = `# Playwright Execution Report

**Project:** ${summary.project}
**PR:** ${summary.pr}
**Date:** ${summary.date}
**Application version:** ${summary.applicationVersion}
**Git commit:** ${summary.gitCommit}
**Browser:** ${summary.browser}
**Playwright version:** ${summary.playwrightVersion}

## Result: ${overallResult}

| Passed | Failed | Skipped | Flaky |
|---|---|---|---|
| ${passed} | ${failed} | ${skipped} | ${flaky} |

**Duration:** ${durationSec} sec

## Executed Suites

${suiteLines.length > 0 ? suiteLines.join("\n") : "_(no suites found in test-results/results.json)_"}

${failed > 0
        ? "## Note\n\nOne or more tests failed. See `playwright-report/index.html` for full details, and `test-results/` for screenshots/traces/videos of the failing tests."
        : ""}
`

    writeFileSync(EXECUTION_MD_PATH, md, "utf-8")

    console.log(`[generate-playwright-report] wrote ${path.relative(REPO_ROOT, SUMMARY_JSON_PATH)}`)
    console.log(`[generate-playwright-report] wrote ${path.relative(REPO_ROOT, EXECUTION_MD_PATH)}`)
    console.log(`[generate-playwright-report] ${totalTests} total, ${passed} passed, ${failed} failed, ${skipped} skipped, ${flaky} flaky`)
}

main()
