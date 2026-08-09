// PR-14: `npm run test:report` entry point.
//
//   Playwright -> HTML Report -> Summary JSON -> Execution MD -> ZIP
//
// Critically, this must produce the full report package even when
// tests FAIL — that's exactly when a reviewer needs the
// screenshots/traces/videos. So this script:
//   1. Runs `playwright test` and waits for it to finish, regardless
//      of its exit code.
//   2. Always runs generate-playwright-report.mjs and
//      zip-playwright-report.mjs afterwards.
//   3. Exits with Playwright's original exit code (so `npm run
//      test:report` still correctly signals pass/fail to whoever/
//      whatever called it), but only after the report package exists
//      on disk either way.
//
// Usage: npm run test:report [-- --pr=PR-13]
// (any args after `--` are forwarded to generate-playwright-report.mjs,
// e.g. --pr=PR-13 to label the report)

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import process from "node:process"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const extraArgs = process.argv.slice(2)

function run(command, args) {
    console.log(`\n[test:report] $ ${command} ${args.join(" ")}\n`)
    return spawnSync(command, args, {
        cwd: REPO_ROOT,
        stdio: "inherit",
        shell: process.platform === "win32"
    })
}

const testRun = run("npx", ["playwright", "test"])
const testExitCode = testRun.status ?? 1

// Always generate the report + zip, regardless of testExitCode.
run("node", ["scripts/generate-playwright-report.mjs", ...extraArgs])
run("node", ["scripts/zip-playwright-report.mjs"])

if (testExitCode !== 0) {
    console.error(
        `\n[test:report] Playwright exited with code ${testExitCode}. ` +
        "The report package was still generated — see playwright-report.zip.\n"
    )
}

process.exit(testExitCode)
