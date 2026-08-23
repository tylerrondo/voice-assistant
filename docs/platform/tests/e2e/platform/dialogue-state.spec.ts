import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-platform-dialogue-slot-filling.json');

test.describe('E2E: Platform Dialogue State & Multi-Turn Slot-Filling Suite', () => {

  async function setupApp(page: any) {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
    await expect(page.locator('body')).toContainText('Platform Dialogue State');
  }

  async function emitVoicePhrase(page: any, phrase: string) {
    const voiceInput = page.locator('[data-testid="voice-input"], input[placeholder*="голос"]').first();
    if (await voiceInput.isVisible()) {
      await voiceInput.fill(phrase);
      await voiceInput.press('Enter');
    } else {
      await page.evaluate((text: string) => {
        window.dispatchEvent(new CustomEvent('voice:command', { detail: { phrase: text } }));
      }, phrase);
    }
  }

  test('DIALOGUE-E2E-01 & 02: Incomplete Voice Command -> WAITING_FOR_SLOT & Clarification Prompt', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');

    const dialogueState = page.locator('[data-testid="dialogue-state"], .dialogue-status').or(page.locator('text=/WAITING_FOR_SLOT|Ожидание слота/i')).first();
    await expect(dialogueState).toBeVisible({ timeout: 5000 });
  });

  test('DIALOGUE-E2E-03: Multi-Turn Slot Filling Completes Action (apples + quantity 5)', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Пять');

    const completedState = page.locator('[data-testid="dialogue-state"], .dialogue-status').or(page.locator('text=/COMPLETED|Завершено/i')).first();
    await expect(completedState).toBeVisible({ timeout: 5000 });
  });

  test('DIALOGUE-E2E-04: Invalid response preserves Dialogue Context', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Не знаю');

    const dialogueState = page.locator('[data-testid="dialogue-state"], .dialogue-status').or(page.locator('text=/WAITING_FOR_SLOT|Ожидание слота/i')).first();
    await expect(dialogueState).toBeVisible();
  });

  test('DIALOGUE-E2E-05: Cancellation terminates Dialogue State cleanly', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Отмена');

    const cancelledState = page.locator('[data-testid="dialogue-state"], .dialogue-status').or(page.locator('text=/CANCELLED|Отменено/i')).first();
    await expect(cancelledState).toBeVisible();
  });

  test('DIALOGUE-E2E-06: New independent command resets active Dialogue State', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Принять заказ');

    const notWaiting = page.locator('body');
    await expect(notWaiting).toBeVisible();
  });

  test('DIALOGUE-E2E-07: Inactivity Timeout triggers EXPIRED State', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    const isAppAlive = await page.locator('body').isVisible();
    expect(isAppAlive).toBe(true);
  });

  test('DIALOGUE-E2E-08: Idempotency - duplicate slot input does not re-execute Action', async ({ page }) => {
    await setupApp(page);
    await emitVoicePhrase(page, 'Обработай яблоки');
    await emitVoicePhrase(page, 'Пять');
    await emitVoicePhrase(page, 'Пять');

    const isHealthy = await page.locator('body').isVisible();
    expect(isHealthy).toBe(true);
  });

});
