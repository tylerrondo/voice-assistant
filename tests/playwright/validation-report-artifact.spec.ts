import fs from "node:fs/promises"
import path from "node:path"
import { test } from "@playwright/test"
import { runAll, readJsonReport } from "./utils/helpers"

/**
 * PR-14: the review artifact bundle (playwright-report.zip) should
 * include the Validation Bench's own JSON Report, not just Playwright's
 * artifacts — so a reviewer doesn't have to hunt for it separately.
 *
 * This test runs one full Automatic pass and writes the resulting
 * report to test-results/validation-report.json, a fixed, predictable
 * path that scripts/zip-playwright-report.mjs bundles as part of the
 * whole test-results/ directory.
 *
 * This is intentionally its own tiny test file (not folded into an
 * existing suite) so "produce the artifact for the review bundle" is
 * a distinct, explicit responsibility, and doesn't get lost if other
 * suites are run selectively.
 */

test("persist a fresh Validation Report for the review artifact bundle", async ({ page }) => {
    await page.goto("/")
    await runAll(page)

    const report = await readJsonReport(page)

    const outDir = path.join(process.cwd(), "test-results")
    await fs.mkdir(outDir, { recursive: true })
    await fs.writeFile(
        path.join(outDir, "validation-report.json"),
        JSON.stringify(report, null, 2),
        "utf-8"
    )
})
