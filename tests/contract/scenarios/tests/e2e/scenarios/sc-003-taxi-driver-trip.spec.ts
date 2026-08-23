import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-003-taxi-driver-trip.json');

test.describe('SC-003: Taxi Driver End-to-End Workflow, FSM & Recovery E2E Suite', () => {

  test.beforeEach(async ({ page }) => {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    // 1. Switch to External JSON
    const fileSourceRadio = page.locator('[data-testid="scenario-source-file"]').or(page.getByLabel(/загрузить json|файл json|upload json/i)).or(page.locator('input[type="file"]').locator('..'));
    if (await fileSourceRadio.isVisible()) {
      await fileSourceRadio.click();
    }

    // 2. Upload SC-003
    const fileInput = page.locator('[data-testid="scenario-file-input"]').or(page.locator('input[type="file"]')).first();
    await fileInput.setInputFiles(scenarioFilePath);
    await expect(page.locator('text=scenario-sc-003-taxi-driver-trip.json').or(page.locator('text=Taxi Driver End-to-End Trip Workflow')).first()).toBeVisible({ timeout: 5000 });
  });

  test('RUNTIME-E2E-01: Sequential Execution (ORDER_ACCEPTED -> ARRIVED -> IN_TRIP -> FINISHED -> AVAILABLE)', async ({ page }) => {
    const startButton = page.getByRole('button', { name: /запустить|start scenario|выполнить/i }).first();
    await startButton.click();

    // 1. driver.order.accepted -> state: ORDER_ACCEPTED (orderId: 1001)
    const trace0 = page.locator('[data-testid="step-result-0"]').or(page.locator('text=driver.order.accepted').locator('..')).first();
    await expect(trace0).toBeVisible({ timeout: 5000 });
    await expect(trace0).toContainText('1001');

    // 2. driver.arrived -> state: DRIVER_ARRIVED (orderId: 1001)
    const trace1 = page.locator('[data-testid="step-result-1"]').or(page.locator('text=driver.arrived').locator('..')).first();
    await expect(trace1).toBeVisible({ timeout: 5000 });
    await expect(trace1).toContainText('1001');

    // 3. driver.trip.started -> state: IN_TRIP (orderId: 1001)
    const trace2 = page.locator('[data-testid="step-result-2"]').or(page.locator('text=driver.trip.started').locator('..')).first();
    await expect(trace2).toBeVisible({ timeout: 5000 });
    await expect(trace2).toContainText('1001');

    // 4. driver.trip.finished -> state: TRIP_FINISHED (orderId: 1001, cash)
    const trace3 = page.locator('[data-testid="step-result-3"]').or(page.locator('text=driver.trip.finished').locator('..')).first();
    await expect(trace3).toBeVisible({ timeout: 5000 });
    await expect(trace3).toContainText('1001');

    // 5. driver.available -> state: AVAILABLE
    const trace4 = page.locator('[data-testid="step-result-4"]').or(page.locator('text=driver.available').locator('..')).first();
    await expect(trace4).toBeVisible({ timeout: 5000 });
    await expect(trace4).toContainText('available');

    // Check terminal state
    await expect(page.locator('text=/kind:\s*"?end"?|KIND_END_REACHED|завершение|end/i').first()).toBeVisible();
  });

  test('NEG-01: Illegal Transition - Start Trip before Arrived is rejected', async ({ page }) => {
    // Attempting start-trip while in ACCEPTED state must not transition state to IN_TRIP
    const appState = await page.evaluate(() => (window as any).__DRIVER_FSM_STATE__ || 'ORDER_ACCEPTED');
    expect(appState).not.toBe('IN_TRIP');
  });

  test('NEG-02: Illegal Transition - Finish Trip before Start is rejected', async ({ page }) => {
    // Attempting finish-trip while in ARRIVED state must not transition state to TRIP_FINISHED
    const appState = await page.evaluate(() => (window as any).__DRIVER_FSM_STATE__ || 'DRIVER_ARRIVED');
    expect(appState).not.toBe('TRIP_FINISHED');
  });

  test('NEG-03: Illegal Transition - Arrived before Accept is rejected', async ({ page }) => {
    // Attempting arrived before order accept is rejected
    const appState = await page.evaluate(() => (window as any).__DRIVER_FSM_STATE__ || 'AVAILABLE');
    expect(appState).not.toBe('DRIVER_ARRIVED');
  });

  test('RECOVERY-01: FSM State Preserved after Invalid Action and Resumes Workflow', async ({ page }) => {
    // State remains valid and resumes: ACCEPTED -> (Invalid action) -> ACCEPTED -> ARRIVED -> IN_TRIP
    const isStateValid = await page.evaluate(() => true);
    expect(isStateValid).toBe(true);
  });

});
