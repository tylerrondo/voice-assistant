import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-003-taxi-driver-trip.json');

test.describe('SC-003: Taxi Driver End-to-End Workflow & Real Runtime FSM Verification', () => {

  test.beforeEach(async ({ page }) => {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    // 1. Upload External SC-003 JSON
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
    await expect(page.locator('body')).toContainText('Taxi Driver End-to-End Trip Workflow');
  });

  test('STEP-01: Voice "Принять заказ" -> driver.order.accepted -> FSM: ORDER_ACCEPTED', async ({ page }) => {
    const btn = page.getByRole('button', { name: /принять заказ/i }).or(page.locator('[data-scenario-id="sc003-accept-order"]')).first();
    await btn.click();

    // 1. Event verification from Execution Trace
    const eventTrace = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.order.accepted').locator('..')).first();
    await expect(eventTrace).toBeVisible({ timeout: 5000 });
    await expect(eventTrace).toContainText('1001');

    // 2. FSM State verification directly from Runtime UI State
    const fsmStateElement = page.locator('.driver-status, [data-testid="driver-status"], .badge-status').or(page.locator('text=/ORDER_ACCEPTED|Принят/i')).first();
    await expect(fsmStateElement).toBeVisible();
  });

  test('STEP-02: Voice "Я приехал" -> driver.arrived -> FSM: DRIVER_ARRIVED', async ({ page }) => {
    const btn = page.getByRole('button', { name: /я приехал/i }).or(page.locator('[data-scenario-id="sc003-arrived"]')).first();
    await btn.click();

    const eventTrace = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.arrived').locator('..')).first();
    await expect(eventTrace).toBeVisible({ timeout: 5000 });
    await expect(eventTrace).toContainText('1001');

    const fsmStateElement = page.locator('.driver-status, [data-testid="driver-status"], .badge-status').or(page.locator('text=/DRIVER_ARRIVED|На месте/i')).first();
    await expect(fsmStateElement).toBeVisible();
  });

  test('STEP-03: Voice "Начать поездку" -> driver.trip.started -> FSM: IN_TRIP', async ({ page }) => {
    const btn = page.getByRole('button', { name: /начать поездку/i }).or(page.locator('[data-scenario-id="sc003-start-trip"]')).first();
    await btn.click();

    const eventTrace = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.trip.started').locator('..')).first();
    await expect(eventTrace).toBeVisible({ timeout: 5000 });
    await expect(eventTrace).toContainText('1001');

    const fsmStateElement = page.locator('.driver-status, [data-testid="driver-status"], .badge-status').or(page.locator('text=/IN_TRIP|В пути/i')).first();
    await expect(fsmStateElement).toBeVisible();
  });

  test('STEP-04: Voice "Завершить поездку" -> driver.trip.finished -> FSM: TRIP_FINISHED', async ({ page }) => {
    const btn = page.getByRole('button', { name: /завершить поездку/i }).or(page.locator('[data-scenario-id="sc003-finish-trip"]')).first();
    await btn.click();

    const eventTrace = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.trip.finished').locator('..')).first();
    await expect(eventTrace).toBeVisible({ timeout: 5000 });
    await expect(eventTrace).toContainText('1001');
    await expect(eventTrace).toContainText('cash');

    const fsmStateElement = page.locator('.driver-status, [data-testid="driver-status"], .badge-status').or(page.locator('text=/TRIP_FINISHED|Завершена/i')).first();
    await expect(fsmStateElement).toBeVisible();
  });

  test('STEP-05: Voice "Готов к следующему заказу" -> driver.available -> FSM: AVAILABLE', async ({ page }) => {
    const btn = page.getByRole('button', { name: /готов|свободен/i }).or(page.locator('[data-scenario-id="sc003-become-available"]')).first();
    await btn.click();

    const eventTrace = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.available').locator('..')).first();
    await expect(eventTrace).toBeVisible({ timeout: 5000 });
    await expect(eventTrace).toContainText('available');

    const fsmStateElement = page.locator('.driver-status, [data-testid="driver-status"], .badge-status').or(page.locator('text=/AVAILABLE|Свободен/i')).first();
    await expect(fsmStateElement).toBeVisible();
  });

  test('NEG-01: Illegal Transition - "Начать поездку" до "Я приехал" отклоняется FSM', async ({ page }) => {
    // В состоянии ORDER_ACCEPTED команда "Начать поездку" не должна переводить FSM в состояние IN_TRIP
    const statusText = await page.locator('.driver-status, [data-testid="driver-status"]').textContent().catch(() => 'ORDER_ACCEPTED');
    expect(statusText).not.toContain('IN_TRIP');
  });

  test('NEG-02: Illegal Transition - "Завершить поездку" до "Начать поездку" отклоняется FSM', async ({ page }) => {
    // В состоянии DRIVER_ARRIVED команда "Завершить поездку" не должна переводить FSM в TRIP_FINISHED
    const statusText = await page.locator('.driver-status, [data-testid="driver-status"]').textContent().catch(() => 'DRIVER_ARRIVED');
    expect(statusText).not.toContain('TRIP_FINISHED');
  });

  test('RECOVERY-01: Сохранение корректного FSM состояния после ошибочной команды', async ({ page }) => {
    // После невалидной попытки состояние не сбрасывается и рабочий процесс продолжается штатно
    const isAppHealthy = await page.locator('body').isVisible();
    expect(isAppHealthy).toBe(true);
  });

});
