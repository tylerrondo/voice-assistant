export interface ReportSummary {
  status: 'PASS' | 'PASS WITH WARNINGS' | 'FAIL';
  totalScenarios: number;
  passed: number;
  failed: number;
  manualWarnings: number;
  repeatedSteps: number;
  skippedSteps: number;
  durationMs: number;
}

// App.ts kutayotgan asosiy funksiya
//
// PR-9d.2 fix (per client engineering review): the report previously
// had no record of which STT/TTS provider, scenario set, or input
// source (mic vs Inject Action) were used, and no explicit label for
// which validation mode (Automatic/Interactive) produced it. Without
// this, the report can't be used to compare results across different
// providers/configurations later, and a reader has to guess why
// ManualValidation is empty. Both are now recorded explicitly.
export function buildValidationReport(
  meta: any,
  startedAt: string,
  verification: any,
  executionLog: any,
  options?: {
    validationMode?: string;
    inputSource?: string;
    // PR-11: which ScenarioSet actually ran, so a report can be
    // traced back to a specific builtin.json or uploaded file.
    scenarioSource?: 'builtin' | 'file';
    scenarioId?: string;
    scenarioName?: string;
    scenarioFile?: string | null;
  }
) {
  // Statusni avtomatik hisoblash
  let status: 'PASS' | 'PASS WITH WARNINGS' | 'FAIL' = 'PASS';
  if (verification.failed > 0) {
    status = 'FAIL';
  }

  // PR-9d.2 fix: durationMs was previously hardcoded to a fixed value
  // (54218), so every report showed the same duration regardless of
  // how long the session actually took. It is now computed from the
  // real elapsed time between session start and report generation.
  const startedAtMs = new Date(startedAt).getTime();
  const durationMs = Number.isFinite(startedAtMs)
    ? Math.max(0, Date.now() - startedAtMs)
    : 0;

  return {
    Session: {
      tester: meta.tester || "Tester-1",
      language: meta.voiceLanguage || meta.language || "en-US",
      uiLanguage: meta.uiLanguage || "en-US",
      startedAt: startedAt
    },
    Environment: {
      env: meta.environment || "demo",
      backendUrl: "https://ibronevik.ru/taxi/c/gruzvill"
    },
    TestConfiguration: {
      recognitionProvider: meta.recognitionProvider || "Browser",
      speechProvider: meta.speechProvider || "Browser",
      scenarioSet: meta.scenarioSet || "automatic",
      inputSource: options?.inputSource || "inject"
    },
    ValidationMode: options?.validationMode || "Automatic",
    // PR-11: External JSON Scenarios — records which ScenarioSet
    // actually ran (builtin.json vs an uploaded file), so the report
    // is reproducible even after the tester switches sources later.
    ScenarioSource: options?.scenarioSource || "builtin",
    ScenarioId: options?.scenarioId || "builtin",
    ScenarioName: options?.scenarioName || "Built-in Validation Scenarios",
    ScenarioFile: options?.scenarioSource === "file" ? (options?.scenarioFile || null) : null,
    ScenarioStatistics: {
      total: verification.totalScenarios || 0
    },
    Verification: verification,
    ManualValidation: {},
    // PR-9d.2 fix: ExecutionLog.getEntries() returns a live reference
    // to its internal array, not a copy. Embedding that reference
    // directly in the report meant that starting a NEW session later
    // (which calls executionLog.clear(), truncating the SAME array)
    // retroactively emptied the ALREADY-SAVED report's ExecutionLog
    // too — this is why saved/downloaded reports showed
    // "ExecutionLog": [] even though the log was populated when the
    // report was generated. Copying the array here decouples the
    // report from any future mutation of the live log.
    ExecutionLog: Array.isArray(executionLog) ? [...executionLog] : executionLog,
    Summary: {
      status: status,
      totalScenarios: verification.totalScenarios || 0,
      passed: verification.passed || 0,
      failed: verification.failed || 0,
      manualWarnings: 0,
      repeatedSteps: 0,
      skippedSteps: 0,
      durationMs: durationMs
    },
    Attachments: []
  };
}

// App.ts kutayotgan fayl nomi formati
export function generateReportFilename(meta: any): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const testerName = (meta.tester || "Tester-1").replace(/\s+/g, '-');
  return `validation-report-${dateStr}-${testerName}.json`;
}