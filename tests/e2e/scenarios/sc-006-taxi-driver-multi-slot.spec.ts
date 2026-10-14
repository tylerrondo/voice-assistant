import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-006-taxi-driver-multi-slot.json');

test.describe('E2E: SC-006 Multi-Slot Dialogue & Real Taxi FSM Suite (ТЗ-VOICE-SC-006)', () => {

  async function setupApp(page: any) {
    await page.addInitScript(() => {
      (window as any).__AUTH_OWNER_ID__ = 'driver-sc006-e2e';
      (window as any).__AUTH_SESSION_ID__ = 'session-sc006-e2e';
    });
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();
    await page.waitForFunction(() => {
      const w = window as any;
      return !!w.__VOICE_CHANNEL__ && !!w.__DIALOGUE_MANAGER__ && !!w.__VOICE_DEMO_APP__ && typeof w.__DISPATCH_VOICE_COMMAND__ === 'function';
    }, { timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
    await expect(page.locator('body')).toContainText('Taxi Driver Multi-Slot');
  }

  async function emitVoicePhrase(page: any, phrase: string) {
    await page.evaluate(async (text: string) => {
      const dispatch = (window as any).__DISPATCH_VOICE_COMMAND__;
      if (typeof dispatch !== 'function') {
        throw new Error('Production voice-command dispatcher is not initialized');
      }
      return dispatch(text);
    }, phrase);
  }

  test('MULTISLOT-01: Sequential Two-Slot Filling (Прими заказ -> 1001 -> Наличными -> ORDER_ACCEPTED)', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    // 1. Initial incomplete utterance
    await emitVoicePhrase(page, 'Прими заказ');
    let state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.intent).toBe('ACCEPT_ORDER');
    expect(state.missingSlots).toContain('orderId');
    expect(state.missingSlots).toContain('payment');
    expect(state.clarificationPrompt).toBe('Какой заказ?');

    // 2. Fill first slot (orderId)
    await emitVoicePhrase(page, '1001');
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.slots.orderId).toBe(1001);
    expect(state.missingSlots).toEqual(['payment']);
    expect(state.clarificationPrompt).toBe('Какой способ оплаты?');

    // 3. Fill second slot (payment)
    await emitVoicePhrase(page, 'Наличными');
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('COMPLETED');
    expect(state.slots).toEqual({ orderId: 1001, payment: 'cash' });

    // 4. Validate exact payload and FSM transition
    const action = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs((window as any).__VOICE_DEMO_APP__.getIdentity());
      return logs.find((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'cash');
    });
    expect(action).toBeDefined();
    expect(action.payload).toEqual({ orderId: 1001, payment: 'cash' });
    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
  });

  test('MULTISLOT-02: Both slots supplied at once in single utterance with execution log assertion', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    await emitVoicePhrase(page, 'Прими заказ 1001 с оплатой наличными');
    const state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('COMPLETED');
    expect(state.slots).toEqual({ orderId: 1001, payment: 'cash' });

    // BLOCKER-1 FIX: Assert execution log, exact payload and executionCount === 1
    const matchingActions = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs((window as any).__VOICE_DEMO_APP__.getIdentity());
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'cash');
    });
    expect(matchingActions.length).toBe(1);
    expect(matchingActions[0].payload).toEqual({ orderId: 1001, payment: 'cash' });

    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
  });

  test('MULTISLOT-03: Filling slots in reverse order with execution log assertion', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, 'Наличными');

    let state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.slots.payment).toBe('cash');
    expect(state.missingSlots).toEqual(['orderId']);

    await emitVoicePhrase(page, '1001');
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('COMPLETED');
    expect(state.slots).toEqual({ orderId: 1001, payment: 'cash' });

    // BLOCKER-2 FIX: Assert actual driver.order.accepted event emission and exact payload
    const matchingActions = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs((window as any).__VOICE_DEMO_APP__.getIdentity());
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'cash');
    });
    expect(matchingActions.length).toBe(1);
    expect(matchingActions[0].payload).toEqual({ orderId: 1001, payment: 'cash' });

    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
  });

  test('NEG-01: Invalid response to first slot preserves entire context and missing slots', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, 'Не знаю');

    const state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.missingSlots).toContain('orderId');
    expect(state.missingSlots).toContain('payment');

    const executed = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs((window as any).__VOICE_DEMO_APP__.getIdentity());
      return logs.some((l: any) => l.intent === 'ACCEPT_ORDER');
    });
    expect(executed).toBe(false);
  });

  test('NEG-02: Invalid response to second slot preserves first slot orderId=1001', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Сам');

    let state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('WAITING_FOR_SLOT');
    expect(state.slots.orderId).toBe(1001);
    expect(state.missingSlots).toEqual(['payment']);

    await emitVoicePhrase(page, 'Наличными');
    state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.status).toBe('COMPLETED');
    expect(state.slots).toEqual({ orderId: 1001, payment: 'cash' });
  });

  test('NEG-03: Cancellation terminates multi-slot dialogue with zero executions', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Отмена');

    const cancellation = await page.evaluate(() => {
      const dm = (window as any).__DIALOGUE_MANAGER__;
      const identity = (window as any).__VOICE_DEMO_APP__.getIdentity();
      const contexts = dm.listContexts(identity);
      return {
        contexts,
        activeState: dm.getActiveState(identity),
        logs: dm.getExecutionLogs(identity)
      };
    });
    expect(cancellation.contexts).toHaveLength(1);
    expect(cancellation.contexts[0].status).toBe('CANCELLED');
    expect(cancellation.activeState).toBeNull();
    expect(cancellation.logs.some((l: any) => l.intent === 'ACCEPT_ORDER')).toBe(false);
  });

  test('NEG-04: Independent command resets active multi-slot dialogue and subsequent slot cannot resume old dialogue', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Я приехал');

    const state = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState((window as any).__VOICE_DEMO_APP__.getIdentity()));
    expect(state.intent).toBe('DRIVER_ARRIVED');

    // HIGH FIX: Prove that sending "Наличными" does NOT complete or execute old ACCEPT_ORDER
    await emitVoicePhrase(page, 'Наличными');
    const oldIntentExecuted = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs((window as any).__VOICE_DEMO_APP__.getIdentity());
      return logs.some((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'cash');
    });
    expect(oldIntentExecuted).toBe(false);
  });

  test('RECOVERY-01: Multi-stage error recovery across both slots', async ({ page }) => {
    await setupApp(page);
    const fsmLocator = page.locator('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]').first();

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, 'Не знаю');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Не знаю');
    await emitVoicePhrase(page, 'Наличными');

    await expect(fsmLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
    const action = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs((window as any).__VOICE_DEMO_APP__.getIdentity());
      return logs.find((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'cash');
    });
    expect(action).toBeDefined();
  });

  test('IDEMP-01: Duplicate slot utterance results in exactly executionCount === 1 for orderId=1001 & payment=cash', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ');
    await emitVoicePhrase(page, '1001');
    await emitVoicePhrase(page, 'Наличными');
    
    // Duplicate voice utterances
    await emitVoicePhrase(page, 'Наличными');
    await emitVoicePhrase(page, '1001');

    const executionCount = await page.evaluate(() => {
      const logs = (window as any).__DIALOGUE_MANAGER__.getExecutionLogs((window as any).__VOICE_DEMO_APP__.getIdentity());
      return logs.filter((l: any) => l.intent === 'ACCEPT_ORDER' && l.payload?.orderId === 1001 && l.payload?.payment === 'cash').length;
    });

    expect(executionCount).toBe(1);
  });

});
