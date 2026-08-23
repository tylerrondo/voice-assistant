import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-003-taxi-driver-trip.json');

test.describe('SC-003: Taxi Driver Sequential Workflow, Strict FSM Transitions & Negative Suite', () => {

  // Helper function to initialize and upload external scenario
  async function setupAppWithScenario(page: any) {
    const appUrl = process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
    await expect(page.locator('body')).toContainText('Taxi Driver End-to-End Trip Workflow');
  }

  test('WORKFLOW-01: Single End-to-End Sequential Run (ORDER_ACCEPTED -> ARRIVED -> IN_TRIP -> FINISHED -> AVAILABLE)', async ({ page }) => {
    await setupAppWithScenario(page);

    const fsmStatusLocator = page.locator('.driver-status, [data-testid="driver-status"], .badge-status, [data-testid="fsm-status"]').first();

    // 1. Accept Order
    const acceptBtn = page.getByRole('button', { name: /принять заказ/i }).or(page.locator('[data-scenario-id="sc003-accept-order"]')).first();
    await acceptBtn.click();
    
    const trace0 = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.order.accepted').locator('..')).first();
    await expect(trace0).toBeVisible({ timeout: 5000 });
    await expect(trace0).toContainText('1001');
    await expect(fsmStatusLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);

    // 2. Driver Arrived (keeping same page and order 1001)
    const arrivedBtn = page.getByRole('button', { name: /я приехал/i }).or(page.locator('[data-scenario-id="sc003-arrived"]')).first();
    await arrivedBtn.click();
    
    const trace1 = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.arrived').locator('..')).first();
    await expect(trace1).toBeVisible({ timeout: 5000 });
    await expect(trace1).toContainText('1001');
    await expect(fsmStatusLocator).toHaveText(/DRIVER_ARRIVED|На месте/i);

    // 3. Start Trip
    const startTripBtn = page.getByRole('button', { name: /начать поездку/i }).or(page.locator('[data-scenario-id="sc003-start-trip"]')).first();
    await startTripBtn.click();
    
    const trace2 = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.trip.started').locator('..')).first();
    await expect(trace2).toBeVisible({ timeout: 5000 });
    await expect(trace2).toContainText('1001');
    await expect(fsmStatusLocator).toHaveText(/IN_TRIP|В пути/i);

    // 4. Finish Trip
    const finishTripBtn = page.getByRole('button', { name: /завершить поездку/i }).or(page.locator('[data-scenario-id="sc003-finish-trip"]')).first();
    await finishTripBtn.click();
    
    const trace3 = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.trip.finished').locator('..')).first();
    await expect(trace3).toBeVisible({ timeout: 5000 });
    await expect(trace3).toContainText('1001');
    await expect(trace3).toContainText('cash');
    await expect(fsmStatusLocator).toHaveText(/TRIP_FINISHED|Завершена/i);

    // 5. Become Available
    const availableBtn = page.getByRole('button', { name: /готов|свободен/i }).or(page.locator('[data-scenario-id="sc003-become-available"]')).first();
    await availableBtn.click();
    
    const trace4 = page.locator('.trace-container, [data-testid="execution-trace"]').or(page.locator('text=driver.available').locator('..')).first();
    await expect(trace4).toBeVisible({ timeout: 5000 });
    await expect(trace4).toContainText('available');
    await expect(fsmStatusLocator).toHaveText(/AVAILABLE|Свободен/i);
  });

  test('NEG-01: Illegal Transition Attempt - "Начать поездку" from ORDER_ACCEPTED is rejected by FSM', async ({ page }) => {
    await setupAppWithScenario(page);
    const fsmStatusLocator = page.locator('.driver-status, [data-testid="driver-status"], .badge-status, [data-testid="fsm-status"]').first();

    // Move to ORDER_ACCEPTED
    const acceptBtn = page.getByRole('button', { name: /принять заказ/i }).or(page.locator('[data-scenario-id="sc003-accept-order"]')).first();
    await acceptBtn.click();
    await expect(fsmStatusLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);

    // Execute illegal action: Start trip before arriving
    const startTripBtn = page.getByRole('button', { name: /начать поездку/i }).or(page.locator('[data-scenario-id="sc003-start-trip"]')).first();
    await startTripBtn.click();

    // Verify FSM rejected the illegal transition and stayed in ORDER_ACCEPTED
    await expect(fsmStatusLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);
    await expect(fsmStatusLocator).not.toHaveText(/IN_TRIP|В пути/i);
  });

  test('NEG-02: Illegal Transition Attempt - "Завершить поездку" from DRIVER_ARRIVED is rejected by FSM', async ({ page }) => {
    await setupAppWithScenario(page);
    const fsmStatusLocator = page.locator('.driver-status, [data-testid="driver-status"], .badge-status, [data-testid="fsm-status"]').first();

    // Move to ORDER_ACCEPTED -> DRIVER_ARRIVED
    await page.getByRole('button', { name: /принять заказ/i }).or(page.locator('[data-scenario-id="sc003-accept-order"]')).first().click();
    await page.getByRole('button', { name: /я приехал/i }).or(page.locator('[data-scenario-id="sc003-arrived"]')).first().click();
    await expect(fsmStatusLocator).toHaveText(/DRIVER_ARRIVED|На месте/i);

    // Execute illegal action: Finish trip before starting
    const finishTripBtn = page.getByRole('button', { name: /завершить поездку/i }).or(page.locator('[data-scenario-id="sc003-finish-trip"]')).first();
    await finishTripBtn.click();

    // Verify FSM rejected the illegal transition and stayed in DRIVER_ARRIVED
    await expect(fsmStatusLocator).toHaveText(/DRIVER_ARRIVED|На месте/i);
    await expect(fsmStatusLocator).not.toHaveText(/TRIP_FINISHED|Завершена/i);
  });

  test('RECOVERY-01: FSM State preserved after illegal command and resumes workflow cleanly', async ({ page }) => {
    await setupAppWithScenario(page);
    const fsmStatusLocator = page.locator('.driver-status, [data-testid="driver-status"], .badge-status, [data-testid="fsm-status"]').first();

    // 1. Valid: Accept order -> ORDER_ACCEPTED
    await page.getByRole('button', { name: /принять заказ/i }).or(page.locator('[data-scenario-id="sc003-accept-order"]')).first().click();
    await expect(fsmStatusLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);

    // 2. Illegal: Start trip -> Rejected, state remains ORDER_ACCEPTED
    await page.getByRole('button', { name: /начать поездку/i }).or(page.locator('[data-scenario-id="sc003-start-trip"]')).first().click();
    await expect(fsmStatusLocator).toHaveText(/ORDER_ACCEPTED|Принят/i);

    // 3. Valid Recovery: Arrive -> Transitions to DRIVER_ARRIVED
    await page.getByRole('button', { name: /я приехал/i }).or(page.locator('[data-scenario-id="sc003-arrived"]')).first().click();
    await expect(fsmStatusLocator).toHaveText(/DRIVER_ARRIVED|На месте/i);

    // 4. Valid Next Step: Start trip now succeeds -> IN_TRIP
    await page.getByRole('button', { name: /начать поездку/i }).or(page.locator('[data-scenario-id="sc003-start-trip"]')).first().click();
    await expect(fsmStatusLocator).toHaveText(/IN_TRIP|В пути/i);
  });

});
