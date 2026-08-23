import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-platform-dialogue-slot-filling.json');

test.describe('E2E: Strict Platform Dialogue State & Multi-Turn Slot-Filling Suite (ТЗ-VOICE-PLATFORM-005)', () => {

  async function setupApp(page: any) {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
    await expect(page.locator('body')).toContainText('Platform Dialogue State');
  }

  async function emitVoicePhrase(page: any, phrase: string) {
    const voiceInput = page.locator('[data-testid="voice-input"], input[placeholder*="голос"], input[name="voiceText"]').first();
    if (await voiceInput.isVisible()) {
      await voiceInput.fill(phrase);
      await voiceInput.press('Enter');
    } else {
      await page.evaluate((text: string) => {
        if ((window as any).__DISPATCH_VOICE_COMMAND__) {
          (window as any).__DISPATCH_VOICE_COMMAND__(text);
        } else {
          window.dispatchEvent(new CustomEvent('voice:command', { detail: { phrase: text } }));
        }
      }, phrase);
    }
  }

  test('DIALOGUE-E2E-01 & 02: Incomplete Voice Command -> WAITING_FOR_SLOT, missing quantity & Clarification Prompt', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');

    // 1. Check Dialogue State is WAITING_FOR_SLOT
    const statusLocator = page.locator('[data-testid="dialogue-status"], .dialogue-status').first();
    await expect(statusLocator).toHaveText(/WAITING_FOR_SLOT|Ожидание слота/i);

    // 2. Check active Intent and saved slot item=apples
    const intentLocator = page.locator('[data-testid="dialogue-intent"], .dialogue-intent').first();
    await expect(intentLocator).toHaveText(/PROCESS_TEST_ACTION/i);

    const slotItemLocator = page.locator('[data-testid="slot-item"], .slot-item').first();
    await expect(slotItemLocator).toHaveText(/apples|яблоки/i);

    // 3. Check missing slot is quantity
    const missingSlotLocator = page.locator('[data-testid="dialogue-missing-slots"], .missing-slots').first();
    await expect(missingSlotLocator).toHaveText(/quantity/i);

    // 4. Check clarification prompt «Сколько?»
    const promptLocator = page.locator('[data-testid="clarification-prompt"], .assistant-prompt').first();
    await expect(promptLocator).toHaveText(/Сколько\?/i);
  });

  test('DIALOGUE-E2E-03: Multi-Turn Slot Filling Completes Action with Structured Payload (item=apples, quantity=5)', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Пять');

    // 1. Dialogue State transitions to COMPLETED
    const statusLocator = page.locator('[data-testid="dialogue-status"], .dialogue-status').first();
    await expect(statusLocator).toHaveText(/COMPLETED|Завершено/i);

    // 2. Validate structured payload strictly from execution runtime logs (no fallback)
    const executedPayload = await page.evaluate(() => {
      const logs = (window as any).__ACTION_EXECUTION_LOGS__ || [];
      const targetAction = logs.find((l: any) => l.intent === 'PROCESS_TEST_ACTION' || l.type === 'platform.test_action.processed');
      return targetAction ? targetAction.payload : null;
    });

    expect(executedPayload).toEqual({
      item: 'apples',
      quantity: 5
    });
  });

  test('DIALOGUE-E2E-04: Invalid Response Preserves Dialogue Context and missingSlots', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Не знаю');

    // State remains WAITING_FOR_SLOT with missingSlots = [quantity]
    const statusLocator = page.locator('[data-testid="dialogue-status"], .dialogue-status').first();
    await expect(statusLocator).toHaveText(/WAITING_FOR_SLOT|Ожидание слота/i);

    const missingSlotLocator = page.locator('[data-testid="dialogue-missing-slots"], .missing-slots').first();
    await expect(missingSlotLocator).toHaveText(/quantity/i);

    // Subsequent valid answer successfully completes dialogue
    await emitVoicePhrase(page, 'Пять');
    await expect(statusLocator).toHaveText(/COMPLETED|Завершено/i);
  });

  test('DIALOGUE-E2E-05: Cancellation terminates Dialogue State to CANCELLED without Action execution', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Отмена');

    const statusLocator = page.locator('[data-testid="dialogue-status"], .dialogue-status').first();
    await expect(statusLocator).toHaveText(/CANCELLED|Отменено/i);

    // Verify Action was NOT executed
    const hasExecuted = await page.evaluate(() => {
      const logs = (window as any).__ACTION_EXECUTION_LOGS__ || [];
      return logs.some((l: any) => l.intent === 'PROCESS_TEST_ACTION');
    });
    expect(hasExecuted).toBe(false);
  });

  test('DIALOGUE-E2E-06: New independent command resets active Dialogue State', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    
    // New command instead of slot answer
    await emitVoicePhrase(page, 'Принять заказ');

    // Dialogue State is reset from WAITING_FOR_SLOT
    const statusLocator = page.locator('[data-testid="dialogue-status"], .dialogue-status').first();
    await expect(statusLocator).not.toHaveText(/WAITING_FOR_SLOT/i);
  });

  test('DIALOGUE-E2E-07: Inactivity Timeout triggers EXPIRED Dialogue State', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');

    // Trigger dialogue timeout
    await page.evaluate(() => {
      if ((window as any).__TRIGGER_DIALOGUE_TIMEOUT__) {
        (window as any).__TRIGGER_DIALOGUE_TIMEOUT__();
      }
    });

    const statusLocator = page.locator('[data-testid="dialogue-status"], .dialogue-status').first();
    await expect(statusLocator).toHaveText(/EXPIRED|Истёк/i);
  });

  test('DIALOGUE-E2E-08: Idempotency - duplicate slot input guarantees strict executionCount === 1', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Пять');
    
    // Duplicate utterance
    await emitVoicePhrase(page, 'Пять');

    // Strictly evaluate count with zero fallback
    const executionCount = await page.evaluate(() => {
      const logs = (window as any).__ACTION_EXECUTION_LOGS__ || [];
      return logs.filter((l: any) => l.intent === 'PROCESS_TEST_ACTION' || l.type === 'platform.test_action.processed').length;
    });

    // Must be strictly 1, falls on 0 or >1
    expect(executionCount).toBe(1);
  });

});
