# Engineering Work Rules for AI-Assisted Repository Changes

These rules are mandatory for any AI agent or contributor performing implementation, debugging, testing, refactoring, or CI work in this repository.

## Core rule

**A fix is complete only when its result is supported by verification evidence.** Editing code, explaining a likely fix, or starting a test run does not establish that the task is complete.

Correctness and traceability take priority over speed, number of edits, and optimistic status reports.

## 1. Establish the scope before editing

1. Identify the exact repository, current branch, base branch, relevant PR, and current working state before making changes.
2. Respect the user's explicit boundaries. Do not merge a PR, modify `master`, close a PR, rewrite shared history, or discard someone else's changes without explicit permission.
3. Reproduce or inspect the reported failure and determine its likely root cause before editing.
4. Inventory all affected files and all occurrences of the failing pattern. Check for duplicated, generated, copied, or nested files that may also be discovered or executed.
5. Distinguish confirmed facts from hypotheses. Do not present a guess as a verified diagnosis.
6. Define the intended fix and how it will be verified. Prefer the smallest coherent change that fixes the root cause across the full affected scope.

## 2. Mandatory pre-change audit

Before broad, systemic, or multi-file changes, produce an auditable inventory before editing. It must include:

1. The observed failure and evidence (command output, test name, log excerpt, or exact reproducible behavior).
2. The likely root cause, clearly separated from confirmed facts and alternative explanations.
3. The full set of candidate files/locations searched, the search method, and the results. For systemic patterns, use repository-wide searches and inspect relevant configuration and test-discovery rules; do not rely on a few examples.
4. A list of affected files grouped as confirmed, suspected, and excluded, with a short reason for exclusions.
5. The planned change batches and the verification command(s) and success criteria for each batch.

If the inventory cannot be completed because tools, access, or the repository state are unavailable, state the limitation and do not present the scope as complete. For a one-line, isolated change, a short audit is sufficient, but the scope and verification must still be clear.

## 3. Make changes in controlled batches

1. Split broad work into small, logically complete batches with clear verification criteria.
2. Do not start a dependent step while the previous step is still running or its result still needs to be inspected.
3. Do not launch overlapping test or build jobs if they could cancel, supersede, or obscure the result of an existing job. Check the existing process/run state first.
4. Avoid blind repository-wide text replacement. Inspect each target file's current content, imports, declarations, structure, and existing changes before modifying it.
5. Preserve unrelated work. Keep changes within the requested scope and the designated branch.
6. After each batch, inspect the diff before proceeding.

## 4. Check consistency across the whole affected scope

For a repeated or systemic failure, fix the shared cause rather than treating each visible symptom independently.

Examples of required consistency checks:

- Find every active test file using a CommonJS-only global such as `__dirname` in an ES module project.
- Check that imports such as Playwright's `beforeEach` are explicitly imported where required.
- Check that automated edits have not introduced duplicate declarations or imports.
- Check whether nested or copied test suites are unintentionally discovered and executed.
- Check configuration, scripts, and test discovery rules together rather than assuming that changing one file covers all copies.
- Check all relevant callers and dependent files after changing a shared module or interface.

For this repository, `package.json` declares ESM with `"type": "module"`. In ESM test files, do not assume that `__dirname` exists. If a directory path is needed, use a consistent ESM-safe pattern, for example:

```ts
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

Declare the compatibility variable no more than once per file, and only where needed. Follow the repository's established import and formatting conventions.

## 5. Verify each change before expanding the scope

After each batch:

1. Inspect the complete diff and confirm every change is intentional.
2. Run static or structural checks appropriate to the change: syntax/type checks, lint, duplicate/import checks, and targeted searches for remaining instances of the original defect.
3. Run the smallest relevant test subset to obtain fast diagnostic feedback.
4. Read the actual output and logs. Do not infer success from a command being launched or from an unrelated green check.
5. If a check fails, identify the first actionable failure and determine whether it is a regression, a pre-existing failure, an environment issue, or an unrelated service failure.
6. Fix the cause, then rerun the affected check. Do not proceed as if a failed check had passed.

For changes affecting test discovery, imports, shared fixtures, module paths, or runtime configuration, inspect the discovered test list and ensure that the intended tests are included exactly as expected.

## 6. Complete the validation ladder

Use a staged validation process appropriate to the change:

1. Static inspection and targeted consistency checks.
2. Focused tests for the changed behavior.
3. The relevant test suite(s).
4. Full CI or all required workflows for the PR.

A focused test run is useful for diagnosis but does not replace full validation when the task or PR requires it. Wait for each run to finish before reporting its final result.

For CI-driven work, record the workflow/run identifier, final conclusion, and tested commit SHA. Before retrying a run, inspect whether the prior run is still active. Do not treat a workflow result from an older commit as evidence for the current head. If CI fails, inspect the failed job and actionable logs before making the next change.

If full validation cannot be completed, state exactly what was and was not run, why it could not be completed, and what remains unverified. This is a blocked or partially verified result, not a completed task. A user may explicitly authorize proceeding despite a known failing check; record that exception and the remaining risk, and never describe the checks as passing.

## 7. Report status honestly

Keep these states distinct:

- **Edited:** code or documentation has been changed.
- **Locally checked:** specified local checks completed, with their results recorded.
- **Tests passed:** the named test command completed successfully.
- **CI passed:** the relevant CI workflows completed successfully for the exact commit being discussed.
- **Complete:** the requested scope is implemented and the required validation evidence supports completion.

Never claim that tests passed when they are still running, were skipped, failed, or were not executed. Never claim CI is green based on an earlier commit if the current commit has different checks. Verify the commit SHA associated with each reported result.

Reports should include:

- Branch and PR affected.
- Commit SHA, when available.
- Files or areas changed.
- Checks actually executed and their final outcomes.
- Remaining failures, risks, or unverified items.
- The next concrete action if work remains.

Do not say a fix is complete merely because the proposed code looks correct.

## 8. Recover systematically from failures

When the same class of error recurs, stop adding local patches and reassess the original diagnosis and the coverage of the fix.

1. Review the sequence of attempted changes and the new failure evidence.
2. Determine why the previous check did not catch the problem.
3. Expand the inventory or add a missing static check where appropriate.
4. Correct the common cause across the affected scope.
5. Rerun the relevant checks and verify the exact new commit.
6. Record any remaining limitations explicitly.

Do not conceal uncertainty, blame the user for failures in the implementation, or ask the user to repeatedly discover defects that available checks could have caught.

## 9. Repository safety and change management

1. Work only on the designated feature/fix branch unless the user explicitly authorizes another target.
2. Do not merge a PR without explicit approval.
3. Do not change `master` or another protected/shared branch without explicit approval.
4. Do not force-push, rewrite history, delete branches, or remove unrelated changes without explicit authorization.
5. Prefer reviewable commits and a focused PR over unrelated bundled changes.
6. Do not broaden a PR silently. If unrelated work is discovered, report it and keep it separate unless the user directs otherwise.

## 10. Definition of done

Before declaring the task complete, confirm all applicable items:

- [ ] Root cause was investigated rather than guessed.
- [ ] The complete affected scope was inventoried.
- [ ] All relevant instances were fixed consistently.
- [ ] The diff contains only intentional changes.
- [ ] No duplicate declarations, imports, or unintended test discovery were introduced.
- [ ] Targeted checks and tests completed successfully.
- [ ] Required broader tests and CI completed successfully, or their absence is clearly disclosed.
- [ ] Results correspond to the exact commit being reported.
- [ ] The correct branch and PR were used; no unauthorized merge or base-branch modification occurred.
- [ ] The final report distinguishes verified results from remaining uncertainty.

If any required item is not satisfied, report the task as incomplete or partially verified, not complete.

The final report must distinguish implementation status from verification status. Use “implemented, validation pending/failed” when appropriate. Do not use “fixed”, “done”, or equivalent wording in a way that implies verified success when required checks are failing or have not finished. The exception is when the user explicitly accepts the remaining risk; even then, describe the work as merged/implemented with known failures, not as fully validated.
