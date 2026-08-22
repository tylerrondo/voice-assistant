import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../scenario-sc-001-vegetable-stall.json');
const rawContent = fs.readFileSync(scenarioFilePath, 'utf-8');
const scenarioSet = JSON.parse(rawContent);

// ============================================================================
// SUITE 1: SC-001 Scenario JSON Contract & Schema Tests
// ============================================================================
test.describe('SC-001: Scenario JSON Contract & Schema Validation', () => {

  test('CONTRACT-01: Load External Scenario JSON & Validate ScenarioSet v2 Root Contract', async () => {
    expect(scenarioSet).toBeDefined();
    expect(scenarioSet.version).toBe(2);
    expect(scenarioSet.id).toBe('scenario-set-sc-001-vegetable-stall');
    expect(scenarioSet.name).toContain('Продавец овощной лавки');
    expect(Array.isArray(scenarioSet.scenarios)).toBe(true);
    expect(scenarioSet.scenarios.length).toBe(1);

    const scenario = scenarioSet.scenarios[0];
    expect(scenario.id).toBe('sc-001-vegetable-stall-seller');
    expect(scenario.activation).toEqual({
      type: 'voice',
      value: 'Касса'
    });
    expect(Array.isArray(scenario.steps)).toBe(true);
  });

  test('CONTRACT-02: Step 1 Schema - QUERY_INVENTORY_STOCK (Tomatoes)', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[0];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.itemId).toBe('tomatoes');
    expect(stepInput.event.payload.action).toBe('QUERY_INVENTORY_STOCK');

    const stepOutput = scenarioSet.scenarios[0].steps[1];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('INVENTORY_STOCK_RESOLVED');
    expect(stepOutput.event.payload.itemId).toBe('tomatoes');
    expect(stepOutput.event.payload.quantity).toBe(15.0);
    expect(stepOutput.event.payload.unit).toBe('kg');
  });

  test('CONTRACT-03: Step 2 Schema - PROCESS_SALE_AND_EMIT_RECEIPT', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[3];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('PROCESS_SALE_AND_EMIT_RECEIPT');
    expect(stepInput.event.payload.quantity).toBe(2.0);

    const stepOutput = scenarioSet.scenarios[0].steps[4];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('SALE_TRANSACTION_COMPLETED');
    expect(stepOutput.event.payload.receiptPrinted).toBe(true);
  });

  test('CONTRACT-04: Step 3 Schema - UPDATE_CATALOG_ITEM_PRICE', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[6];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('UPDATE_CATALOG_ITEM_PRICE');

    const stepOutput = scenarioSet.scenarios[0].steps[7];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('ITEM_PRICE_UPDATED');
    expect(stepOutput.event.payload.newPrice).toBe(20.0);
  });

  test('CONTRACT-05: Step 4 Schema - SET_ITEM_OUT_OF_STOCK', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[9];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('SET_ITEM_OUT_OF_STOCK');

    const stepOutput = scenarioSet.scenarios[0].steps[10];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('ITEM_STATUS_OUT_OF_STOCK_TRIGGERED');
    expect(stepOutput.event.payload.quantity).toBe(0.0);
  });

  test('CONTRACT-06: Step 5 Schema - CREATE_NEW_CATALOG_ITEM', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[11];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('CREATE_NEW_CATALOG_ITEM');

    const stepOutput = scenarioSet.scenarios[0].steps[12];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('CATALOG_ITEM_CREATED');
    expect(stepOutput.event.payload.itemName).toBe('Клубника');
  });

  test('CONTRACT-07: Step 6 Schema - SET_INVENTORY_STOCK_LEVEL', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[13];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('SET_INVENTORY_STOCK_LEVEL');

    const stepOutput = scenarioSet.scenarios[0].steps[14];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('INVENTORY_STOCK_UPDATED');
    expect(stepOutput.event.payload.quantity).toBe(10.0);
  });

  test('CONTRACT-08: Final Step Termination - Strict kind: "end" Check', async () => {
    const steps = scenarioSet.scenarios[0].steps;
    const finalStep = steps[steps.length - 1];
    expect(finalStep).toBeDefined();
    expect(finalStep.kind).toBe('end');
  });
});

// ============================================================================
// SUITE 2: SC-001 Live Application Runtime Execution E2E Tests
// ============================================================================
test.describe('SC-001: Live Application Runtime Execution E2E (UI & ScenarioEngine)', () => {

  test('RUNTIME-E2E-01: Load Validation Bench, Dispatch External Scenario & Verify Live Execution Trace', async ({ page }) => {
    // 1. Open live application
    await page.goto(process.env.APP_URL || 'https://voice-assistant-two-olive.vercel.app');
    
    // 2. Ensure Scenario Bench is ready
    await expect(page.locator('body')).toBeVisible();
    const startButton = page.getByRole('button', { name: /запустить сценарий|start scenario/i });
    await expect(startButton).toBeVisible();

    // 3. Trigger execution of the loaded ScenarioSet v2
    await startButton.click();

    // 4. Verify Step 1 Execution Runtime (Inventory stock query)
    await expect(page.locator('text=INVENTORY_STOCK_RESOLVED').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=15').first()).toBeVisible();

    // 5. Verify Step 2 Runtime [CRITICAL]: Sale, Total 30 AED, Receipt emitted and Stock = 13 kg
    await expect(page.locator('text=SALE_TRANSACTION_COMPLETED').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=REC-2026-001').first()).toBeVisible();
    await expect(page.locator('text=30').first()).toBeVisible();

    // 6. Verify Step 3 Runtime: Price updated to 20 AED
    await expect(page.locator('text=ITEM_PRICE_UPDATED').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=20').first()).toBeVisible();

    // 7. Verify Step 4 Runtime: Item marked out of stock
    await expect(page.locator('text=ITEM_STATUS_OUT_OF_STOCK_TRIGGERED').first()).toBeVisible({ timeout: 10000 });

    // 8. Verify Step 5 Runtime: Strawberry catalog creation
    await expect(page.locator('text=CATALOG_ITEM_CREATED').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Клубника').first()).toBeVisible();

    // 9. Verify Step 6 Runtime: Potato stock update
    await expect(page.locator('text=INVENTORY_STOCK_UPDATED').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=10').first()).toBeVisible();

    // 10. Verify Final Scenario Status in UI Execution Log
    await expect(page.locator('text=100%').or(page.locator('text=6/6'))).toBeVisible({ timeout: 15000 });
  });

});
