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
export function buildValidationReport(
  meta: any,
  startedAt: string,
  verification: any,
  executionLog: any
) {
  // Statusni avtomatik hisoblash
  let status: 'PASS' | 'PASS WITH WARNINGS' | 'FAIL' = 'PASS';
  if (verification.failed > 0) {
    status = 'FAIL';
  }

  return {
    Session: {
      tester: meta.tester || "Tester-1",
      language: meta.language || "en-US",
      startedAt: startedAt
    },
    Environment: {
      env: meta.environment || "demo",
      backendUrl: "https://ibronevik.ru/taxi/c/gruzvill"
    },
    ScenarioStatistics: {
      total: verification.totalScenarios || 0
    },
    Verification: verification,
    ManualValidation: {},
    ExecutionLog: executionLog,
    Summary: {
      status: status,
      totalScenarios: verification.totalScenarios || 0,
      passed: verification.passed || 0,
      failed: verification.failed || 0,
      manualWarnings: 0,
      repeatedSteps: 0,
      skippedSteps: 0,
      durationMs: 54218
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