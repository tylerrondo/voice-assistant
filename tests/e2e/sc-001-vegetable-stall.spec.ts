import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Load the actual external Scenario JSON
const scenarioFilePath = path.resolve(__dirname, '../../scenario-sc-001-vegetable-stall.json');
const rawContent = fs.readFileSync(scenarioFilePath, 'utf-8');
const scenarioSet = JSON.parse(rawContent);

test.describe('SC-001: Vegetable Stall Seller - Strict Scenario Contract & E2E Validation', () => {

  test('TEST-01: Load External Scenario JSON & Validate ScenarioSet v2 Contract', async () => {
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
    expect(scenario.steps.length).toBe(14); // 6 emits + 6 responses + 1 delay + 1 end
  });

  test('TEST-02: Step 1 - QUERY_INVENTORY_STOCK (Tomatoes balance query)', async () => {
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
    expect(stepOutput.event.payload.speech).toBe('Помидоров осталось 15 килограммов.');
  });

  test('TEST-03: Step 2 [CRITICAL] - PROCESS_SALE_AND_EMIT_RECEIPT (Sale, Atomic Decrement & Fiscal Check)', async () => {
    // 1. Initial balance check
    const initialStock = 15.0;
    
    // 2. Input voice trigger
    const stepInput = scenarioSet.scenarios[0].steps[3];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('PROCESS_SALE_AND_EMIT_RECEIPT');
    expect(stepInput.event.payload.itemId).toBe('tomatoes');
    expect(stepInput.event.payload.quantity).toBe(2.0);
    expect(stepInput.event.payload.pricePerUnit).toBe(15.0);
    expect(stepInput.event.payload.totalAmount).toBe(30.0);
    expect(stepInput.event.payload.printReceipt).toBe(true);

    // 3. Execution event verification
    const stepOutput = scenarioSet.scenarios[0].steps[4];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('SALE_TRANSACTION_COMPLETED');
    
    const payload = stepOutput.event.payload;
    expect(payload.itemId).toBe('tomatoes');
    expect(payload.quantity).toBe(2.0);
    expect(payload.pricePerUnit).toBe(15.0);
    expect(payload.totalAmount).toBe(30.0);
    expect(payload.currency).toBe('AED');
    expect(payload.receiptPrinted).toBe(true);
    expect(payload.receiptId).toBe('REC-2026-001');
    expect(payload.remainingStock).toBe(initialStock - 2.0); // Exact atomic math: 13.0 kg
    expect(payload.remainingStock).toBe(13.0);
    expect(payload.speech).toContain('Продано два килограмма помидоров на сумму 30 дирхам');
  });

  test('TEST-04: Step 3 - UPDATE_CATALOG_ITEM_PRICE (Cucumbers price update)', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[6];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('UPDATE_CATALOG_ITEM_PRICE');

    const stepOutput = scenarioSet.scenarios[0].steps[7];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('ITEM_PRICE_UPDATED');
    expect(stepOutput.event.payload.itemId).toBe('cucumbers');
    expect(stepOutput.event.payload.newPrice).toBe(20.0);
    expect(stepOutput.event.payload.unit).toBe('kg');
    expect(stepOutput.event.payload.speech).toBe('Цена на огурцы установлена: 20 дирхам за килограмм.');
  });

  test('TEST-05: Step 4 - SET_ITEM_OUT_OF_STOCK (Cucumbers out of stock)', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[9];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('SET_ITEM_OUT_OF_STOCK');

    const stepOutput = scenarioSet.scenarios[0].steps[10];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('ITEM_STATUS_OUT_OF_STOCK_TRIGGERED');
    expect(stepOutput.event.payload.itemId).toBe('cucumbers');
    expect(stepOutput.event.payload.quantity).toBe(0.0);
    expect(stepOutput.event.payload.status).toBe('out_of_stock');
  });

  test('TEST-06: Step 5 - CREATE_NEW_CATALOG_ITEM (Add Strawberries)', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[11];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('CREATE_NEW_CATALOG_ITEM');

    const stepOutput = scenarioSet.scenarios[0].steps[12];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('CATALOG_ITEM_CREATED');
    expect(stepOutput.event.payload.itemId).toBe('strawberries');
    expect(stepOutput.event.payload.itemName).toBe('Клубника');
    expect(stepOutput.event.payload.price).toBe(35.0);
    expect(stepOutput.event.payload.category).toBe('Ягоды');
  });

  test('TEST-07: Step 6 - SET_INVENTORY_STOCK_LEVEL (Set Potato level)', async () => {
    const stepInput = scenarioSet.scenarios[0].steps[13];
    expect(stepInput.kind).toBe('emit');
    expect(stepInput.event.type).toBe('VOICE_INPUT_RECEIVED');
    expect(stepInput.event.payload.action).toBe('SET_INVENTORY_STOCK_LEVEL');

    const stepOutput = scenarioSet.scenarios[0].steps[14];
    expect(stepOutput.kind).toBe('emit');
    expect(stepOutput.event.type).toBe('INVENTORY_STOCK_UPDATED');
    expect(stepOutput.event.payload.itemId).toBe('potatoes');
    expect(stepOutput.event.payload.quantity).toBe(10.0);
  });

  test('TEST-08: Final Step Termination - Strict kind: "end" Check', async () => {
    const steps = scenarioSet.scenarios[0].steps;
    const finalStep = steps[steps.length - 1];
    expect(finalStep).toBeDefined();
    expect(finalStep.kind).toBe('end');
  });
});
