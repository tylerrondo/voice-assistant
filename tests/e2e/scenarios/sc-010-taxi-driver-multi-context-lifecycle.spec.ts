import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-010-taxi-driver-multi-context-lifecycle.json');

test.describe('E2E: SC-010 Multi-Context Complete Lifecycle Suite (ТЗ-VOICE-SC-010)', () => {

  async function setupApp(page: any) {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);

    const activeSetId = await page.evaluate(() => {
      return (window as any).__SCENARIO_ENGINE__.getActiveScenarioSetId();
    });
    expect(activeSetId).toBe('scenario-set-sc-010-taxi-driver-multi-context-lifecycle');
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

  test('WORKFLOW-01: Concurrent creation of 3 independent contexts (1001, 1002, 1003) with unique contextIds', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');
    await emitVoicePhrase(page, 'Прими заказ 1003');

    const contexts = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.listContexts());
    expect(contexts.length).toBe(3);

    const ctxA = contexts.find((c: any) => c.slots.orderId === 1001);
    const ctxB = contexts.find((c: any) => c.slots.orderId === 1002);
    const ctxC = contexts.find((c: any) => c.slots.orderId === 1003);

    expect(ctxA.status).toBe('WAITING_FOR_SLOT');
    expect(ctxB.status).toBe('WAITING_FOR_SLOT');
    expect(ctxC.status).toBe('WAITING_FOR_SLOT');

    expect(ctxA.contextId).not.toBe(ctxB.contextId);
    expect(ctxA.contextId).not.toBe(ctxC.contextId);
    expect(ctxB.contextId).not.toBe(ctxC.contextId);
  });

  test('WORKFLOW-02: Diverse completion of 3 contexts (1001->Card, 1002->Cancel, 1003->Cash)', async ({ page }) => {
    await setupApp(page);

    // 1. Create 3 contexts
    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');
    await emitVoicePhrase(page, 'Прими заказ 1003');

    const contextsBefore = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.listContexts());
    const idA = contextsBefore.find((c: any) => c.slots.orderId === 1001).contextId;
    const idB = contextsBefore.find((c: any) => c.slots.orderId === 1002).contextId;
    const idC = contextsBefore.find((c: any) => c.slots.orderId === 1003).contextId;

    // 2. Complete 1001 with Card
    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Картой');

    // 3. Cancel 1002
    await emitVoicePhrase(page, 'Заказ 1002');
    await emitVoicePhrase(page, 'Отмена');

    // 4. Complete 1003 with Cash
    await emitVoicePhrase(page, 'Заказ 1003');
    await emitVoicePhrase(page, 'Наличными');

    // Verify statuses
    const contextsAfter = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.listContexts());
    expect(contextsAfter.find((c: any) => c.contextId === idA).status).toBe('COMPLETED');
    expect(contextsAfter.find((c: any) => c.contextId === idB).status).toBe('CANCELLED');
    expect(contextsAfter.find((c: any) => c.contextId === idC).status).toBe('COMPLETED');

    // Verify executions in structured log
    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    const match1001 = logs.filter((l: any) => l.contextId === idA && l.event.payload.orderId === 1001 && l.event.payload.payment === 'card');
    const match1002 = logs.filter((l: any) => l.contextId === idB);
    const match1003 = logs.filter((l: any) => l.contextId === idC && l.event.payload.orderId === 1003 && l.event.payload.payment === 'cash');

    expect(match1001.length).toBe(1);
    expect(match1002.length).toBe(0); // 0 executions for cancelled
    expect(match1003.length).toBe(1);
    expect(logs.length).toBe(2);
  });

  test('WORKFLOW-03: Switching after completion and cancelled resurrection protection', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');
    await emitVoicePhrase(page, 'Прими заказ 1003');

    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Картой');

    await emitVoicePhrase(page, 'Заказ 1002');
    await emitVoicePhrase(page, 'Отмена');

    await emitVoicePhrase(page, 'Заказ 1003');
    await emitVoicePhrase(page, 'Наличными');

    // Attempt to mutate completed 1001 with 1003 switch
    await emitVoicePhrase(page, 'Заказ 1003');
    await emitVoicePhrase(page, 'Картой');

    // Attempt to resurrect cancelled 1002
    await emitVoicePhrase(page, 'Заказ 1002');
    await emitVoicePhrase(page, 'Наличными');

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    const count1001 = logs.filter((l: any) => l.event.payload.orderId === 1001).length;
    const count1002 = logs.filter((l: any) => l.event.payload.orderId === 1002).length;
    const count1003 = logs.filter((l: any) => l.event.payload.orderId === 1003 && l.event.payload.payment === 'cash').length;
    const count1003Card = logs.filter((l: any) => l.event.payload.orderId === 1003 && l.event.payload.payment === 'card').length;

    expect(count1001).toBe(1);
    expect(count1002).toBe(0);
    expect(count1003).toBe(1);
    expect(count1003Card).toBe(0);
  });

  test('CROSS-CONTEXT-NEGATIVE: Zero invalid combinations or payload contamination', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');
    await emitVoicePhrase(page, 'Прими заказ 1003');

    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Картой');

    await emitVoicePhrase(page, 'Заказ 1002');
    await emitVoicePhrase(page, 'Отмена');

    await emitVoicePhrase(page, 'Заказ 1003');
    await emitVoicePhrase(page, 'Наличными');

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());

    const c1001Cash = logs.filter((l: any) => l.event.payload.orderId === 1001 && l.event.payload.payment === 'cash');
    const c1002Card = logs.filter((l: any) => l.event.payload.orderId === 1002 && l.event.payload.payment === 'card');
    const c1002Cash = logs.filter((l: any) => l.event.payload.orderId === 1002 && l.event.payload.payment === 'cash');
    const c1003Card = logs.filter((l: any) => l.event.payload.orderId === 1003 && l.event.payload.payment === 'card');

    expect(c1001Cash.length).toBe(0);
    expect(c1002Card.length).toBe(0);
    expect(c1002Cash.length).toBe(0);
    expect(c1003Card.length).toBe(0);
  });

  test('RECOVERY-04: Fourth context (1004) error recovery preserves states and executions of 1001-1003', async ({ page }) => {
    await setupApp(page);

    // Initial 3 contexts
    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');
    await emitVoicePhrase(page, 'Прими заказ 1003');

    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Картой');

    await emitVoicePhrase(page, 'Заказ 1002');
    await emitVoicePhrase(page, 'Отмена');

    await emitVoicePhrase(page, 'Заказ 1003');
    await emitVoicePhrase(page, 'Наличными');

    // Create 4th context with invalid turn recovery
    await emitVoicePhrase(page, 'Прими заказ 1004');
    await emitVoicePhrase(page, 'Не знаю'); // invalid turn

    let state1004 = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state1004.status).toBe('WAITING_FOR_SLOT');
    expect(state1004.slots.orderId).toBe(1004);

    await emitVoicePhrase(page, 'Наличными'); // recovery turn
    state1004 = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state1004.status).toBe('COMPLETED');

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    const match1004 = logs.filter((l: any) => l.event.payload.orderId === 1004 && l.event.payload.payment === 'cash');

    expect(match1004.length).toBe(1);
    expect(logs.length).toBe(3); // 1001, 1003, 1004
  });

  test('IDEMP-03: Repeated slot filling on all completed contexts preserves executionCount === 1', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Картой');
    await emitVoicePhrase(page, 'Картой'); // duplicate

    await emitVoicePhrase(page, 'Прими заказ 1003');
    await emitVoicePhrase(page, 'Заказ 1003');
    await emitVoicePhrase(page, 'Наличными');
    await emitVoicePhrase(page, 'Наличными'); // duplicate

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    const count1001 = logs.filter((l: any) => l.event.payload.orderId === 1001 && l.event.payload.payment === 'card').length;
    const count1003 = logs.filter((l: any) => l.event.payload.orderId === 1003 && l.event.payload.payment === 'cash').length;

    expect(count1001).toBe(1);
    expect(count1003).toBe(1);
  });

});
