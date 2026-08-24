import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-009-taxi-driver-dialogue-concurrency.json');

test.describe('E2E: SC-009 Single Active Context Proof & Concurrency Audit (ТЗ-VOICE-SC-009)', () => {

  async function setupApp(page: any) {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
    
    const activeSetId = await page.evaluate(() => {
      return (window as any).__SCENARIO_ENGINE__.getActiveScenarioSetId();
    });
    expect(activeSetId).toBe('scenario-set-sc-009-taxi-driver-dialogue-concurrency');
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

  test('CONCURRENCY-AUDIT-01: Proves SINGLE_ACTIVE_CONTEXT replacing 1001 with 1002 without contamination', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    // 1. Start order 1001
    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');

    let state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.slots.orderId).toBe(1001);

    // 2. Start order 1002 (Proves Single Active Context Architecture replaces 1001)
    await emitVoicePhrase(page, 'Прими заказ 1002');
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.slots.orderId).toBe(1002);
    expect(state.missingSlots).toEqual(['payment']);

    // 3. Complete order 1002
    await emitVoicePhrase(page, 'Картой');
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('COMPLETED');
    expect(state.slots).toEqual({ orderId: 1002, payment: 'card' });

    // 4. Execution log proves strictly 1002 + card and ZERO 1001 executions
    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    const match1002 = logs.filter((l: any) => l.event.type === 'driver.order.accepted' && l.event.payload.orderId === 1002 && l.event.payload.payment === 'card');
    const match1001 = logs.filter((l: any) => l.event.type === 'driver.order.accepted' && l.event.payload.orderId === 1001);

    expect(match1002.length).toBe(1);
    expect(match1002[0].event.payload).toEqual({ orderId: 1002, payment: 'card' });
    expect(match1001.length).toBe(0);

    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
  });

  test('CONCURRENCY-AUDIT-02: Cancellation of active context does NOT affect prior history and emits 0 events', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');
    await emitVoicePhrase(page, 'Отмена');

    const state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('CANCELLED');

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    expect(logs.length).toBe(0);
  });

  test('CONCURRENCY-AUDIT-03: Duplicate utterance on single active context preserves executionCount === 1', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1002');
    await emitVoicePhrase(page, 'Наличными');
    await emitVoicePhrase(page, 'Наличными');

    const count1002 = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.event.type === 'driver.order.accepted' && l.event.payload.orderId === 1002 && l.event.payload.payment === 'cash').length;
    });

    expect(count1002).toBe(1);
  });

});
