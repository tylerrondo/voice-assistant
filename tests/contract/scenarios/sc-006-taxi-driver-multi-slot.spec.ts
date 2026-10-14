import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenarioPath = path.resolve(__dirname, '../../../scenario-sc-006-taxi-driver-multi-slot.json');
const rawContent = fs.readFileSync(scenarioPath, 'utf-8');
const scenarioSet = JSON.parse(rawContent);

test.describe('CONTRACT: SC-006 Taxi Driver Multi-Slot Workflow Suite (ТЗ-VOICE-SC-006)', () => {

  test('CONTRACT-01: ScenarioSet v2 Root Schema Compliance', async () => {
    expect(scenarioSet.version).toBe(2);
    expect(scenarioSet.id).toBe('scenario-set-sc-006-taxi-driver-multi-slot');
    expect(Array.isArray(scenarioSet.scenarios)).toBe(true);
    expect(scenarioSet.scenarios.length).toBeGreaterThanOrEqual(1);
  });

  test('CONTRACT-02: Intent ACCEPT_ORDER has two required slots and a Russian activation phrase', async () => {
    const sc = scenarioSet.scenarios.find((s: any) => s.intent === 'ACCEPT_ORDER');
    expect(sc).toBeDefined();
    expect(sc.requiredSlots).toContain('orderId');
    expect(sc.requiredSlots).toContain('payment');
    expect(sc.requiredSlots.length).toBe(2);
    expect(sc.aliases).toContain('Прими заказ');
    expect(sc.slotExtractors.orderId.type).toBe('integer');
    expect(sc.slotExtractors.orderId.pattern).toBeTruthy();
    expect(sc.slotExtractors.payment.type).toBe('enum');
    expect(sc.slotExtractors.payment.mapping.cash).toContain('наличными');
    expect(sc.slotExtractors.payment.mapping.card).toContain('картой');
  });

  test('CONTRACT-02A: Independent DRIVER_ARRIVED command is configured for context switching', async () => {
    const sc = scenarioSet.scenarios.find((s: any) => s.intent === 'DRIVER_ARRIVED');
    expect(sc).toBeDefined();
    expect(sc.aliases).toContain('Я приехал');
    expect(sc.requiredSlots).toContain('orderId');
    expect(sc.slotExtractors.orderId.type).toBe('integer');
    expect(sc.slotExtractors.orderId.pattern).toBeTruthy();
  });

  test('CONTRACT-03: orderId Slot Definition & Prompt Contract', async () => {
    const sc = scenarioSet.scenarios[0];
    expect(sc.clarificationPrompts.orderId).toBe('Какой заказ?');
  });

  test('CONTRACT-04: payment Slot Definition & Prompt Contract', async () => {
    const sc = scenarioSet.scenarios[0];
    expect(sc.clarificationPrompts.payment).toBe('Какой способ оплаты?');
  });

  test('CONTRACT-05: Action Payload interpolates both orderId and payment Slots', async () => {
    const sc = scenarioSet.scenarios[0];
    const emitStep = sc.steps.find((st: any) => st.kind === 'emit');
    expect(emitStep).toBeDefined();
    expect(emitStep.event.type).toBe('driver.order.accepted');
    expect(emitStep.event.payload.orderId).toBe('{{slots.orderId}}');
    expect(emitStep.event.payload.payment).toBe('{{slots.payment}}');
  });

  test('CONTRACT-06: Schema contains zero targetState hints', async () => {
    const jsonString = JSON.stringify(scenarioSet);
    expect(jsonString).not.toContain('targetState');
  });

  test('CONTRACT-07: Final Scenario Step is strictly Terminal End Step', async () => {
    for (const sc of scenarioSet.scenarios) {
      const last = sc.steps[sc.steps.length - 1];
      expect(last.kind).toBe('end');
    }
  });

});
