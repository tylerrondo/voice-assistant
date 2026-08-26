import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-passenger-offers.json');

test.describe('E2E: SC-PASS-002 Canonical Multi-Offer Dialogue Suite', () => {

  test('E2E-PASS-002: Полный сквозной диалог сравнения предложений, информационных вопросов и выбора оффера через Production Runtime', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__AUTH_OWNER_ID__ = 'passenger-prod-002';
      (window as any).__AUTH_SESSION_ID__ = 'session-prod-passenger-002';
    });

    await page.goto('http://localhost:3000');
    await page.waitForSelector('#voice-app-ready', { timeout: 10000 });

    // Загрузка декларативного сценария офферов
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);

    const result = await page.evaluate(async () => {
      const vc = (window as any).__VOICE_CHANNEL__;
      const dm = (window as any).__DIALOGUE_MANAGER__;
      const app = (window as any).__VOICE_DEMO_APP__;
      const identity = app.getIdentity();

      // Шаг 1: Вопрос о скорости
      const step1Res = await vc.handleIncomingVoice('Какой быстрее', identity);
      const step1Execs = dm.getExecutionLogs(identity).length;

      // Шаг 2: Вопрос о цене
      const step2Res = await vc.handleIncomingVoice('А какой дешевле', identity);
      const step2Execs = dm.getExecutionLogs(identity).length;

      // Шаг 3: Вопрос о характеристиках
      const step3Res = await vc.handleIncomingVoice('А второй это комфорт', identity);
      const step3Execs = dm.getExecutionLogs(identity).length;

      // Шаг 4: Выбор конкретного варианта естественным языком
      const step4Res = await vc.handleIncomingVoice('Тогда давайте второй', identity);
      const step4Execs = dm.getExecutionLogs(identity).length;

      // Шаг 5: Дополнительный информационный вопрос до подтверждения
      const step5Info = await vc.handleIncomingVoice('А далеко находится второй водитель', identity);
      const step5Execs = dm.getExecutionLogs(identity).length;

      // Шаг 6: Финальное подтверждение
      const step6Res = await vc.handleIncomingVoice('Да', identity);
      const finalLogs = dm.getExecutionLogs(identity);
      const finalCtx = dm.getContext(finalLogs[0]?.contextId, identity);

      return {
        step1Res,
        step1Execs,
        step2Res,
        step2Execs,
        step3Res,
        step3Execs,
        step4Execs,
        step5Execs,
        finalLogsCount: finalLogs.length,
        execution: finalLogs[0],
        finalCtx,
        step6Res
      };
    });

    // Zero execution on all intermediate queries and selections
    expect(result.step1Execs).toBe(0);
    expect(result.step2Execs).toBe(0);
    expect(result.step3Execs).toBe(0);
    expect(result.step4Execs).toBe(0);
    expect(result.step5Execs).toBe(0);

    // Verified intent resolution
    expect(result.step1Res.intent).toBe('COMPARE_OFFERS_ETA');
    expect(result.step2Res.intent).toBe('COMPARE_OFFERS_PRICE');
    expect(result.step3Res.intent).toBe('QUERY_OFFER_COMFORT');

    // Exactly one logical execution produced on confirmation
    expect(result.finalLogsCount).toBe(1);
    expect(result.execution).not.toBeNull();
    expect(result.execution.status).toBe('SUCCEEDED');
    expect(result.execution.payload.orderId).toBe(5001);
    expect(result.execution.payload.selectedOfferId).toBe('OFFER-B');
    expect(result.finalCtx?.status).toBe('COMPLETED');
  });

});
