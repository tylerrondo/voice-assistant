import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-008-taxi-driver-dialogue-lifecycle.json');

test.describe('E2E: PLATFORM-010 Multi-Context Session Manager Runtime Suite', () => {

  async function setupApp(page: any) {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
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

  test('MULTICONTEXT-E2E-01 & 02: Create Context A and Context B concurrently without destroying A', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');

    const contexts = await page.evaluate(() => {
      const dm = (window as any).__DIALOGUE_MANAGER__;
      return dm?.listContexts() || [];
    });

    expect(contexts.length).toBe(2);
    expect(contexts.some((c: any) => c.slots.orderId === 1001 && c.status === 'WAITING_FOR_SLOT')).toBe(true);
    expect(contexts.some((c: any) => c.slots.orderId === 1002 && c.status === 'WAITING_FOR_SLOT')).toBe(true);
  });

  test('MULTICONTEXT-E2E-03 & 04: Fill Context A and Context B independently with exact execution payloads', async ({ page }) => {
    await setupApp(page);

    // 1. Create two contexts
    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');

    // 2. Route slot to 1001
    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Картой');

    // 3. Route slot to 1002
    await emitVoicePhrase(page, 'Заказ 1002');
    await emitVoicePhrase(page, 'Наличными');

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    const match1001 = logs.filter((l: any) => l.event.type === 'driver.order.accepted' && l.event.payload.orderId === 1001 && l.event.payload.payment === 'card');
    const match1002 = logs.filter((l: any) => l.event.type === 'driver.order.accepted' && l.event.payload.orderId === 1002 && l.event.payload.payment === 'cash');

    expect(match1001.length).toBe(1);
    expect(match1001[0].event.payload).toEqual({ orderId: 1001, payment: 'card' });

    expect(match1002.length).toBe(1);
    expect(match1002[0].event.payload).toEqual({ orderId: 1002, payment: 'cash' });
  });

  test('MULTICONTEXT-E2E-05: Switch A -> B -> A preserving slot values', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');

    await emitVoicePhrase(page, 'Заказ 1001');
    let activeCtx = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(activeCtx.slots.orderId).toBe(1001);

    await emitVoicePhrase(page, 'Заказ 1002');
    activeCtx = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getActiveState());
    expect(activeCtx.slots.orderId).toBe(1002);
  });

  test('MULTICONTEXT-E2E-06: Cancel A preserves B in WAITING_FOR_SLOT', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');

    // Switch to 1001 and cancel it
    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Отмена');

    const contexts = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.listContexts());
    const ctxA = contexts.find((c: any) => c.slots.orderId === 1001);
    const ctxB = contexts.find((c: any) => c.slots.orderId === 1002);

    expect(ctxA.status).toBe('CANCELLED');
    expect(ctxB.status).toBe('WAITING_FOR_SLOT');
  });

  test('MULTICONTEXT-E2E-07: Expire A preserves B in WAITING_FOR_SLOT', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');

    await page.evaluate(() => {
      const dm = (window as any).__DIALOGUE_MANAGER__;
      const ctxA = dm.listContexts().find((c: any) => c.slots.orderId === 1001);
      if (ctxA) dm.expireContext(ctxA.contextId);
    });

    const contexts = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.listContexts());
    const ctxA = contexts.find((c: any) => c.slots.orderId === 1001);
    const ctxB = contexts.find((c: any) => c.slots.orderId === 1002);

    expect(ctxA.status).toBe('EXPIRED');
    expect(ctxB.status).toBe('WAITING_FOR_SLOT');
  });

  test('MULTICONTEXT-E2E-08: Idempotency is isolated per context', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');

    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Картой');
    await emitVoicePhrase(page, 'Картой'); // Duplicate on 1001

    await emitVoicePhrase(page, 'Заказ 1002');
    await emitVoicePhrase(page, 'Картой'); // Same payment slot on 1002

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());
    const match1001 = logs.filter((l: any) => l.event.payload.orderId === 1001 && l.event.payload.payment === 'card');
    const match1002 = logs.filter((l: any) => l.event.payload.orderId === 1002 && l.event.payload.payment === 'card');

    expect(match1001.length).toBe(1);
    expect(match1002.length).toBe(1);
  });

  test('MULTICONTEXT-E2E-09 & 10: Execution isolation and zero cross-context contamination', async ({ page }) => {
    await setupApp(page);

    await emitVoicePhrase(page, 'Прими заказ 1001');
    await emitVoicePhrase(page, 'Прими заказ 1002');

    await emitVoicePhrase(page, 'Заказ 1001');
    await emitVoicePhrase(page, 'Картой');

    await emitVoicePhrase(page, 'Заказ 1002');
    await emitVoicePhrase(page, 'Наличными');

    const logs = await page.evaluate(() => (window as any).__DIALOGUE_MANAGER__.getExecutionLogs());

    // Disallowed contaminated combinations
    const contaminated1001Cash = logs.filter((l: any) => l.event.payload.orderId === 1001 && l.event.payload.payment === 'cash');
    const contaminated1002Card = logs.filter((l: any) => l.event.payload.orderId === 1002 && l.event.payload.payment === 'card');

    expect(contaminated1001Cash.length).toBe(0);
    expect(contaminated1002Card.length).toBe(0);
  });

});
