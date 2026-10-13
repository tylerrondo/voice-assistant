import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scenarioFilePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scenario-sc-002-taxi-driver.json');

test.describe('SC-002: Taxi Driver Standard Trip - Production Runtime E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    await page.goto(appUrl);
    await expect(page.locator('#voice-app-ready')).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles(scenarioFilePath);
  });

  async function emitVoicePhrase(page: any, phrase: string) {
    return page.evaluate(async (text: string) => {
      const app = (window as any).__VOICE_DEMO_APP__;
      if (!app) throw new Error('Production VoiceDemoApp is not initialized');
      return app.handleVoice(text);
    }, phrase);
  }

  async function getExecutions(page: any) {
    return page.evaluate(() => {
      const app = (window as any).__VOICE_DEMO_APP__;
      const dm = (window as any).__DIALOGUE_MANAGER__;
      return dm.getExecutionLogs(app.getIdentity());
    });
  }

  async function getDriverStatus(page: any) {
    return page.evaluate(() => (window as any).__VOICE_DEMO_APP__.runtime.platformExecutionBoundary.getDriverStatus());
  }

  async function reachInTrip(page: any) {
    await emitVoicePhrase(page, 'Принять заказ');
    await emitVoicePhrase(page, 'Я приехал');
    await emitVoicePhrase(page, 'Начать поездку');
  }

  test('TEST-RUNTIME-01: accept order dispatches driver.order.accepted for order 1001', async ({ page }) => {
    const result = await emitVoicePhrase(page, 'Принять заказ');
    const executions = await getExecutions(page);

    expect(result.status).toBe('COMPLETED');
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe('SUCCEEDED');
    expect(executions[0].event.type).toBe('driver.order.accepted');
    expect(executions[0].event.payload.orderId).toBe(1001);
    expect(await getDriverStatus(page)).toBe('ORDER_ACCEPTED');
  });

  test('TEST-RUNTIME-02: arrival is accepted only after an order is accepted', async ({ page }) => {
    await emitVoicePhrase(page, 'Принять заказ');
    const result = await emitVoicePhrase(page, 'Я приехал');
    const executions = await getExecutions(page);

    expect(result.status).toBe('COMPLETED');
    expect(executions.map((entry: any) => entry.event.type)).toEqual([
      'driver.order.accepted',
      'driver.arrived'
    ]);
    expect(executions[1].event.payload.orderId).toBe(1001);
    expect(await getDriverStatus(page)).toBe('DRIVER_ARRIVED');
  });

  test('TEST-RUNTIME-03: trip starts after driver arrival', async ({ page }) => {
    await emitVoicePhrase(page, 'Принять заказ');
    await emitVoicePhrase(page, 'Я приехал');
    const result = await emitVoicePhrase(page, 'Начать поездку');
    const executions = await getExecutions(page);

    expect(result.status).toBe('COMPLETED');
    expect(executions.map((entry: any) => entry.event.type)).toEqual([
      'driver.order.accepted',
      'driver.arrived',
      'driver.trip.started'
    ]);
    expect(executions[2].event.payload.orderId).toBe(1001);
    expect(await getDriverStatus(page)).toBe('IN_TRIP');
  });

  test('TEST-RUNTIME-04: trip finishes with the configured cash payment', async ({ page }) => {
    await reachInTrip(page);
    const result = await emitVoicePhrase(page, 'Завершить поездку');
    const executions = await getExecutions(page);

    expect(result.status).toBe('COMPLETED');
    expect(executions).toHaveLength(4);
    expect(executions[3].event.type).toBe('driver.trip.finished');
    expect(executions[3].event.payload.orderId).toBe(1001);
    expect(executions[3].event.payload.payment).toBe('cash');
    expect(await getDriverStatus(page)).toBe('TRIP_FINISHED');
  });

  test('TEST-RUNTIME-05: driver becomes available only after trip completion', async ({ page }) => {
    await reachInTrip(page);
    await emitVoicePhrase(page, 'Завершить поездку');
    const result = await emitVoicePhrase(page, 'Готов к следующему заказу');
    const executions = await getExecutions(page);

    expect(result.status).toBe('COMPLETED');
    expect(executions).toHaveLength(5);
    expect(executions[4].event.type).toBe('driver.available');
    expect(await getDriverStatus(page)).toBe('AVAILABLE');
  });
});
