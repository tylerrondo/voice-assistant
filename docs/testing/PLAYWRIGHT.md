# Playwright — Validation Bench E2E Testing

PR-10 wires up Playwright as the official regression-testing tool for
Validation Bench. It does not change Validation Bench's functionality —
only adds an automated test layer on top of it.

## Installation

```bash
npm install
npx playwright install --with-deps
```

## Running tests

```bash
npm run test:e2e          # all specs, all browsers
npm run test:smoke        # smoke.spec.ts only
npm run test:automatic    # automatic.spec.ts only
npm run test:interactive  # interactive.spec.ts only
```

Tests automatically start the voice-demo dev server (`webServer` in
`playwright.config.ts`) and wait for it to be ready before running —
no need to start it manually first.

To view the HTML report after a run:

```bash
npx playwright show-report
```

## Structure

```
playwright.config.ts        - root config: browsers, webServer, artifacts
tests/
  playwright/
    smoke.spec.ts            - 7 core smoke tests (page loads, controls work)
    automatic.spec.ts        - Automatic ("Run All") mode regression tests
    interactive.spec.ts      - Interactive Runner regression tests
    report.spec.ts           - Generated report structure/content tests
    utils/
      helpers.ts             - shared helpers (setValidationMode, runAll, etc.)
```

## Why Interactive tests use Input Source = Inject Action

Playwright has no real microphone, and the Web Speech API used by
`BrowserRecognitionProvider` is unreliable or unavailable under browser
automation. All `interactive.spec.ts` / `report.spec.ts` tests
therefore drive the Interactive Runner with **Input Source = Inject
Action**, which exercises the exact same Runner state machine (Start/
Next Step, Repeat, Skip, confirmation buttons, Session Summary,
Restart) without depending on real speech recognition.

Real-microphone behavior (actual STT/TTS accuracy, language switching
mid-session, etc.) is covered separately by the manual QA checklist
from PR-9d.2, not by these automated tests.

## Browsers

Configured projects: **Chromium**, **Firefox**, **WebKit**. Running
`npm run test:e2e` runs every spec against all three by default; pass
`--project=chromium` (etc.) to run against a single browser.

## CI

`.github/workflows/playwright.yml` runs the full suite on every push
and pull request to `master`: installs dependencies, installs browsers,
runs `npm run test:e2e`, and uploads the HTML report plus any
failure artifacts (screenshots, traces, videos) even if the job fails.