import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-005-taxi-driver-full-trip.json');

test.describe('E2E: SC-005 Taxi Driver Full Trip Workflow & Real FSM Suite (ТЗ-VOICE-SC-005)', () => {

  async function setupApp(page: any) {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
    await expect(page.locator('body')).toContainText('Taxi Driver Full Trip');
  }

  async function emitVoicePhrase(page: any, phrase: string) {
    await page.evaluate(async (text: string) => {
      const channel = (window as any).__VOICE_CHANNEL__;
      if (!channel) {
        throw new Error('VoiceChannel production instance is not initialized on window.__VOICE_CHANNEL__');
      }
      return channel.handleIncomingVoice(text);
    }, phrase);
  }

  test('WORKFLOW-01: Full Continuous Trip Workflow (AVAILABLE -> ORDER_ACCEPTED -> ARRIVED -> IN_TRIP -> FINISHED -> AVAILABLE)', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    // 1. Incomplete "Прими заказ" -> WAITING_FOR_SLOT
    await emitVoicePhrase(page, 'Прими заказ');
    const state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.clarificationPrompt).toBe('Какой заказ?');

    // 2. "1001" -> ORDER_ACCEPTED
    await emitVoicePhrase(page, '1001');
    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);

    // 3. "Я приехал" -> DRIVER_ARRIVED
    await emitVoicePhrase(page, 'Я приехал');
    await expect(fsmLocator).toHaveText(/DRIVER_ARRIVED|На месте/i);

    // 4. "Начать поездку" -> IN_TRIP
    await emitVoicePhrase(page, 'Начать поездку');
    await expect(fsmLocator).toHaveText(/IN_TRIP|В пути/i);

    // 5. "Завершить поездку" -> TRIP_FINISHED
    await emitVoicePhrase(page, 'Завершить поездку');
    await expect(fsmLocator).toHaveText(/TRIP_FINISHED|Завершена/i);

    // 6. "Готов к следующему заказу" -> AVAILABLE
    await emitVoicePhrase(page, 'Готов к следующему заказу');
    await expect(fsmLocator).toHaveText(/AVAILABLE|Свободен/i);
  });

  test('NEG-01: "Я приехал" from AVAILABLE is rejected by FSM', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    await emitVoicePhrase(page, 'Я приехал');
    await expect(fsmLocator).not.toHaveText(/DRIVER_ARRIVED|На месте/i);
  });

  test('NEG-02: "Начать поездку" before arrival is rejected by FSM', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);

    // Illegal voice action
    await emitVoicePhrase(page, 'Начать поездку');
    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
  });

  test('NEG-03: "Завершить поездку" before start is rejected by FSM', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Я приехал');
    await expect(fsmLocator).toHaveText(/DRIVER_ARRIVED|На месте/i);

    // Illegal voice action
    await emitVoicePhrase(page, 'Завершить поездку');
    await expect(fsmLocator).toHaveText(/DRIVER_ARRIVED|На месте/i);
  });

  test('RECOVERY-01: Multi-turn Error Recovery preserves full trip workflow', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, 'Не знаю');
    await emitVoicePhrase(page, '1001');
    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);

    await emitVoicePhrase(page, 'Я приехал');
    await expect(fsmLocator).toHaveText(/DRIVER_ARRIVED|На месте/i);
  });

  test('IDEMP-01: Duplicate "1001" gives strictly executionCount === 1 for ACCEPT_ORDER', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, '1001');

    const executionCount = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER').length;
    });

    expect(executionCount).toBe(1);
  });

  test('IDEMP-02: Duplicate "Я приехал" gives strictly executionCount === 1 for DRIVER_ARRIVED', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Я приехал');
    await emitVoicePhrase(page, 'Я приехал');

    const executionCount = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'DRIVER_ARRIVED').length;
    });

    expect(executionCount).toBe(1);
  });

});
