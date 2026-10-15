# Mandatory instructions for repository work

Before changing code, tests, configuration, documentation related to implementation, or CI:

1. Read and follow [Engineering Work Rules](docs/engineering/working-rules.md). These rules are mandatory for AI agents and contributors.
2. First inspect the repository state, target branch, current PR/head commit, and any already-running test or CI jobs. Do not modify `master`, merge a PR, or discard unrelated work without explicit user authorization.
3. Before broad or systemic changes, produce an evidence-based inventory of affected files and failure patterns, identify the likely root cause, and define the verification plan. Do not begin mass edits before establishing the scope.
4. Make small, reviewable batches. Inspect the full diff after each batch. Avoid blind bulk replacements; check imports, duplicate declarations, dependencies, and copied/nested test files.
5. Do not start overlapping test/build runs that may cancel or obscure an existing run. Check the current run status and wait for the result before deciding what to do next.
6. Validate in stages: static/structural checks, focused tests, relevant suites, then required CI. For test-discovery changes, verify the actual discovered test list. Associate every reported CI result with the exact commit SHA.
7. A task may be described as implemented but must not be reported as fully verified or complete while required checks are failing, pending, skipped without an approved reason, or not run. If a blocker prevents validation, state precisely what remains unverified; do not imply success.
8. On recurring failures, stop patching symptoms and reassess the root cause and coverage of the previous fix.
9. In the final report, list the branch/PR, commit, files changed, checks actually completed and their results, unresolved risks, and next action.
10. If these instructions conflict with an explicit user instruction, follow the user's instruction only where safe and authorized, and clearly state any resulting verification or safety trade-off.

Completion requires satisfying the applicable checklist in `docs/engineering/working-rules.md`.