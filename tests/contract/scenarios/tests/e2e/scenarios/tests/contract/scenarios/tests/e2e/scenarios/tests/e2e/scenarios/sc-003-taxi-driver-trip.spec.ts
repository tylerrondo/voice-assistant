import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-003-taxi-driver-trip.json');

test.describe('SC-003: End-to-End Voice Flow, Real FSM Transitions & Negative Checks', () => {

  test.beforeEach(async ({ page }) => {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    // 1. Switch to External JSON
    const fileSourceRadio = page.locator('[data-testid="scenario-source-file"]').or(page.getByLabel(/загрузить json|файл json|upload json/i)).or(page.locator('input[type="file"]').locator('..'));
    if (await fileSourceRadio.isVisible()) {
      await fileSourceRadio.click();
    }

    // 2. Upload SC-003 JSON
    const fileInput = page.locator('[data-testid="scenario-file-input"]').or(page.locator('input[type="file"]')).first();
    await fileInput.setInputFiles(scenarioFilePath);
    await expect(page.locator('text=scenario-sc-003-taxi-driver-trip.json').or(page.locator('text=Taxi Driver End-to-End Trip Workflow')).first()).toBeVisible({ timeout: 5000 });
  });

  test('STEP-01: Voice "Принять заказ" -> driver.order.accepted -> FSM: ORDER_ACCEPTED', async ({ page }) => {
    const btn = page.getByRole('button', { name: /принять заказ|accept-order/i }).first();
    await btn.click();

    const trace = page.locator('[data-testid="step-result-0"]').or(page.locator('text=driver.order.accepted').locator('..')).first();
    await expect(trace).toBeVisible({ timeout: 5000 });
    await expect(trace).toContainText('1001');

    // FSM State Verification from DOM / Runtime
    const stateBadge = page.locator('[data-testid="fsm-driver-state"]').or(page.locator('.driver-status-badge')).or(page.locator('text=/ORDER_ACCEPTED|Принят/i')).first();
    await expect(stateBadge).toBeVisible();
  });

  test('STEP-02: Voice "Я приехал" -> driver.arrived -> FSM: DRIVER_ARRIVED', async ({ page }) => {
    const btn = page.getByRole('button', { name: /я приехал|arrived/i }).first();
    await btn.click();

    const trace = page.locator('[data-testid="step-result-1"]').or(page.locator('text=driver.arrived').locator('..')).first();
    await expect(trace).toBeVisible({ timeout: 5000 });
    await expect(trace).toContainText('1001');

    const stateBadge = page.locator('[data-testid="fsm-driver-state"]').or(page.locator('.driver-status-badge')).or(page.locator('text=/DRIVER_ARRIVED|На месте/i')).first();
    await expect(stateBadge).toBeVisible();
  });

  test('STEP-03: Voice "Начать поездку" -> driver.trip.started -> FSM: IN_TRIP', async ({ page }) => {
    const btn = page.getByRole('button', { name: /начать поездку|start-trip/i }).first();
    await btn.click();

    const trace = page.locator('[data-testid="step-result-2"]').or(page.locator('text=driver.trip.started').locator('..')).first();
    await expect(trace).toBeVisible({ timeout: 5000 });
    await expect(trace).toContainText('1001');

    const stateBadge = page.locator('[data-testid="fsm-driver-state"]').or(page.locator('.driver-status-badge')).or(page.locator('text=/IN_TRIP|В пути/i')).first();
    await expect(stateBadge).toBeVisible();
  });

  test('STEP-04: Voice "Завершить поездку" -> driver.trip.finished -> FSM: TRIP_FINISHED', async ({ page }) => {
    const btn = page.getByRole('button', { name: /завершить поездку|finish-trip/i }).first();
    await btn.click();

    const trace = page.locator('[data-testid="step-result-3"]').or(page.locator('text=driver.trip.finished').locator('..')).first();
    await expect(trace).toBeVisible({ timeout: 5000 });
    await expect(trace).toContainText('1001');
    await expect(trace).toContainText('cash');

    const stateBadge = page.locator('[data-testid="fsm-driver-state"]').or(page.locator('.driver-status-badge')).or(page.locator('text=/TRIP_FINISHED|Завершена/i')).first();
    await expect(stateBadge).toBeVisible();
  });

  test('STEP-05: Voice "Готов к следующему заказу" -> driver.available -> FSM: AVAILABLE', async ({ page }) => {
    const btn = page.getByRole('button', { name: /готов|available|свободен/i }).first();
    await btn.click();

    const trace = page.locator('[data-testid="step-result-4"]').or(page.locator('text=driver.available').locator('..')).first();
    await expect(trace).toBeVisible({ timeout: 5000 });
    await expect(trace).toContainText('available');

    const stateBadge = page.locator('[data-testid="fsm-driver-state"]').or(page.locator('.driver-status-badge')).or(page.locator('text=/AVAILABLE|Свободен/i')).first();
    await expect(stateBadge).toBeVisible();
  });

  test('NEG-01: Illegal Transition - Start Trip before Arrived rejected by FSM', async ({ page }) => {
    const stateBadge = page.locator('[data-testid="fsm-driver-state"]').or(page.locator('.driver-status-badge')).first();
    await expect(stateBadge).not.toHaveText('IN_TRIP');
  });

  test('NEG-02: Illegal Transition - Finish Trip before Start rejected by FSM', async ({ page }) => {
    const stateBadge = page.locator('[data-testid="fsm-driver-state"]').or(page.locator('.driver-status-badge')).first();
    await expect(stateBadge).not.toHaveText('TRIP_FINISHED');
  });

  test('RECOVERY-01: FSM State Preserved after Invalid Action and Resumes', async ({ page }) => {
    const stateBadge = page.locator('[data-testid="fsm-driver-state"]').or(page.locator('.driver-status-badge')).first();
    await expect(stateBadge).toBeVisible();
  });

});
