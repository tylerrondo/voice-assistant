// PR-14: bundles the full Playwright artifact set into playwright-report.zip
// for handing off to a reviewer without them needing to re-run tests.
//
// Included: playwright-report/ (HTML report), test-results/ (screenshots,
// traces, videos, results.json, validation-report.json), playwright-summary.json,
// playwright-execution.md.
//
// Also writes playwright-report.sha256 next to the zip, so the archive's
// integrity can be verified after transfer (e.g. `sha256sum -c playwright-report.sha256`).
//
// Usage: node scripts/zip-playwright-report.mjs

import { createWriteStream, createReadStream, existsSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import process from "node:process"
import archiver from "archiver"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUTPUT_ZIP = path.join(REPO_ROOT, "playwright-report.zip")
const OUTPUT_SHA256 = path.join(REPO_ROOT, "playwright-report.sha256")

const ENTRIES = [
    { path: "playwright-report", type: "dir" },
    { path: "test-results", type: "dir" },
    { path: "playwright-summary.json", type: "file" },
    { path: "playwright-execution.md", type: "file" }
    // Note: test-results/validation-report.json (the Validation Bench's
    // own JSON Report, persisted by
    // tests/playwright/validation-report-artifact.spec.ts) is already
    // inside test-results/ above — no separate entry needed.
]

/** Computes the SHA-256 of a file by streaming it (safe for large zips with videos). */
function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256")
        const stream = createReadStream(filePath)
        stream.on("data", chunk => hash.update(chunk))
        stream.on("end", () => resolve(hash.digest("hex")))
        stream.on("error", reject)
    })
}

async function main() {
    const output = createWriteStream(OUTPUT_ZIP)
    const archive = archiver("zip", { zlib: { level: 9 } })

    const zipWritten = new Promise((resolve, reject) => {
        output.on("close", resolve)
        archive.on("error", reject)
    })
    archive.on("warning", err => {
        console.warn("[zip-playwright-report] warning:", err.message)
    })

    archive.pipe(output)

    let addedAnything = false
    for (const entry of ENTRIES) {
        const fullPath = path.join(REPO_ROOT, entry.path)
        if (!existsSync(fullPath)) {
            console.warn(`[zip-playwright-report] skipping missing ${entry.path} (not generated yet)`)
            continue
        }
        if (entry.type === "dir") {
            archive.directory(fullPath, entry.path)
        } else {
            archive.file(fullPath, { name: entry.path })
        }
        addedAnything = true
    }

    if (!addedAnything) {
        console.error(
            "[zip-playwright-report] nothing to zip — run `npx playwright test` and " +
            "`node scripts/generate-playwright-report.mjs` first (or just use `npm run test:report`)."
        )
        process.exitCode = 1
        return
    }

    await archive.finalize()
    await zipWritten

    console.log(`[zip-playwright-report] wrote playwright-report.zip (${archive.pointer()} bytes)`)

    // Checksum, so the archive's integrity can be verified after transfer.
    const digest = await sha256File(OUTPUT_ZIP)
    writeFileSync(OUTPUT_SHA256, `${digest}  playwright-report.zip\n`, "utf-8")
    console.log(`[zip-playwright-report] wrote playwright-report.sha256 (${digest})`)
}

main().catch(err => {
    console.error("[zip-playwright-report] failed:", err)
    process.exitCode = 1
})
