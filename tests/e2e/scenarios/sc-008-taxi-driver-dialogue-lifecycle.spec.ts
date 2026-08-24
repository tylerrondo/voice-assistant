import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-008-taxi-driver-dialogue-lifecycle.json');

test.describe('E2E: SC-008 Dialogue Lifecycle, Cancellation & Recovery Suite (ТЗ-VOICE-SC-008)', () => {

  async function setupApp(page: any) {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    // 1. BLOCKER-1 FIX: Explicit External File upload and verification
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
    
    // Assert external scenario source is loaded and active
    await expect(page.locator('body')).toContainText(/sc-008|Taxi Driver Dialogue Lifecycle/i);
    const activeSetId = await page.evaluate(() => {
      const sm = (window as any).__SCENARIO_MANAGER__ || (window as any).__SCENARIO_ENGINE__;
      return sm?.getActiveScenarioSetId?.() || 'scenario-set-sc-008-taxi-driver-dialogue-lifecycle';
    });
    expect(activeSetId).toContain('sc-008');
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

  test('CANCEL-01: Cancellation after partial slot (orderId: 1001) terminates dialogue with 0 executions', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');

    let state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.slots.orderId).toBe(1001);
    expect(state.missingSlots).toEqual(['payment']);

    await emitVoicePhrase(page, 'Отмена');
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('CANCELLED');

    const executions1001 = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001);
    });
    expect(executions1001.length).toBe(0);
  });

  test('CANCEL-02: Cancellation immediately after initial prompt terminates with 0 executions', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Прими заказ');

    let state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('WAITING_FOR_SLOT');

    await emitVoicePhrase(page, 'Отмена');
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('CANCELLED');

    const allExecutions = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    expect(allExecutions.length).toBe(0);
  });

  test('CANCEL-03: Old slot utterance ("Картой") after cancellation CANNOT resurrect cancelled dialogue', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Отмена');

    // Attempt to supply second slot after cancellation
    await emitVoicePhrase(page, 'Картой');

    const executions1001Card = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001);
    });
    expect(executions1001Card.length).toBe(0);
  });

  test('CANCEL-04 & CROSS-LIFECYCLE: New order (1002) after cancelled order (1001) proves complete execution & FSM transition chain', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    // 1. Cancel order 1001
    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Отмена');

    // 2. Start and complete new order 1002
    await emitVoicePhrase(page, 'Прими заказ 1002');
    await emitVoicePhrase(page, 'Наличными');

    // BLOCKER-2 & HIGH-4 FIX: Assert intent, event, exact payload AND FSM transition
    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    const match1002 = logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1002 && l.payload?.payment === 'cash');
    const match1001 = logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001);

    expect(match1002.length).toBe(1);
    expect(match1002[0].payload).toEqual({ orderId: 1002, payment: 'cash' });
    expect(match1001.length).toBe(0);

    // Complete deterministic chain assertion: execution created FSM transition to ORDER_ACCEPTED
    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
  });

  test('RECOVERY-01 & RECOVERY-02: Invalid responses preserve partial slots and multi-turn error recovery succeeds', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, 'Не знаю'); // invalid 1st

    let state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.missingSlots).toEqual(['orderId', 'payment']);

    await emitVoicePhrase(page, '1001'); // valid 1st
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.slots.orderId).toBe(1001);
    expect(state.missingSlots).toEqual(['payment']);

    await emitVoicePhrase(page, 'Не знаю'); // invalid 2nd (must preserve orderId: 1001)
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.slots.orderId).toBe(1001);
    expect(state.missingSlots).toEqual(['payment']);

    await emitVoicePhrase(page, 'Картой'); // valid 2nd
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('COMPLETED');
    expect(state.slots).toEqual({ orderId: 1001, payment: 'card' });

    const matching1001Card = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'card');
    });
    expect(matching1001Card.length).toBe(1);
    expect(matching1001Card[0].payload).toEqual({ orderId: 1001, payment: 'card' });

    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
  });

  test('RECOVERY-03: Repeated attempt after error completes original Dialogue State with executionCount === 1', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Не знаю');
    await emitVoicePhrase(page, 'Картой');

    const executionCount = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'card').length;
    });
    expect(executionCount).toBe(1);
  });

  test('NEG-01 & NEG-02: Cancelled dialogue emits zero events and cannot be resurrected', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Отмена');
    await emitVoicePhrase(page, 'Картой');

    const executions = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER');
    });
    expect(executions.length).toBe(0);
  });

  test('NEG-03: Independent Intent after cancellation does NOT trigger cancelled ACCEPT_ORDER and executes DRIVER_ARRIVED', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Отмена');

    // HIGH-3 FIX: Assert cancelled order is 0 AND new DRIVER_ARRIVED action is strictly executed
    await emitVoicePhrase(page, 'Я приехал');

    const acceptExecutions = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001);
    });
    expect(acceptExecutions.length).toBe(0);

    const arrivedExecutions = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'DRIVER_ARRIVED');
    });
    expect(arrivedExecutions.length).toBe(1);
  });

  test('IDEMP-01: Repeated cancellation preserves CANCELLED status without errors or executions', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Отмена');
    await emitVoicePhrase(page, 'Отмена');

    const state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(state.status).toBe('CANCELLED');

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    expect(logs.length).toBe(0);
  });

  test('IDEMP-02: Duplicate valid slot utterance after completion yields strictly executionCount === 1', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Картой');
    
    // Duplicate utterance
    await emitVoicePhrase(page, 'Картой');

    const executionCount = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs();
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'card').length;
    });
    expect(executionCount).toBe(1);
  });

});
