## Quick Start

1. Read [docs/HANDOVER_GUIDE.md](docs/HANDOVER_GUIDE.md)
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
3. Read [docs/MIGRATING_NEW_CHANNEL.md](docs/MIGRATING_NEW_CHANNEL.md)
4. Open [Validation Bench](https://voice-assistant-two-olive.vercel.app)
5. Run verification scenarios
6. Start development

## Running Playwright Tests

```
# install dependencies
npm install

# install browsers (first time only)
npx playwright install

# run all tests
npx playwright test

# run a single test file
npx playwright test tests/playwright/driver-standard-trip.spec.ts

# open the HTML report after a run
npx playwright show-report
```

Test IDs used by these tests are documented as a contract in
[docs/TEST_IDS.md](docs/TEST_IDS.md) — new tests should use
`page.getByTestId(...)` exclusively (see docs/rfc/PR-12.md).

## Generating a PR Review Report

For handing off a PR to review, use one command instead of running
Playwright and collecting artifacts by hand:

```
npm run test:report
```

This runs the full Playwright suite, then **always** (even if tests
fail) produces:

- `playwright-report/` — the standard Playwright HTML report
- `test-results/` — screenshots, traces, videos, raw JSON results
- `playwright-summary.json` — machine-readable pass/fail summary
- `playwright-execution.md` — human-readable summary
- `playwright-report.zip` — all of the above, zipped, ready to send

To label the report with a PR number:

```
npm run test:report -- --pr=PR-14
```

See [docs/rfc/PR-14.md](docs/rfc/PR-14.md) for the full spec.