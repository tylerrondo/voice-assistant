import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-003-taxi-driver-trip.json');
const rawContent = fs.readFileSync(scenarioFilePath, 'utf-8');
const scenarioSet = JSON.parse(rawContent);

test.describe('SC-003: Taxi Driver End-to-End Trip - Contract Tests', () => {

  test('CONTRACT-SC003-01: Root Schema, Version 2 and Set ID', async () => {
    expect(scenarioSet).toBeDefined();
    expect(scenarioSet.version).toBe(2);
    expect(scenarioSet.id).toBe('scenario-set-sc-003-taxi-driver-trip');
    expect(scenarioSet.name).toBe('Taxi Driver End-to-End Trip Workflow');
    expect(Array.isArray(scenarioSet.scenarios)).toBe(true);
    expect(scenarioSet.scenarios).toHaveLength(5);
  });

  test('CONTRACT-SC003-02: End-to-End Sequential Steps & Uniform orderId 1001', async () => {
    // The restored ScenarioSet models the trip as five independently routable scenarios.
    const emitEvents = scenarioSet.scenarios.flatMap((sc: any) =>
      sc.steps.filter((step: any) => step.kind === 'emit').map((step: any) => step.event.type)
    );
    expect(emitEvents).toEqual([
      'driver.order.accepted',
      'driver.arrived',
      'driver.trip.started',
      'driver.trip.finished',
      'driver.available'
    ]);

    const orderIds = scenarioSet.scenarios.flatMap((sc: any) =>
      sc.steps
        .filter((step: any) => step.kind === 'emit' && step.event?.payload?.orderId !== undefined)
        .map((step: any) => step.event.payload.orderId)
    );
    expect(orderIds.length).toBeGreaterThan(0);
    expect(new Set(orderIds)).toEqual(new Set([1001]));

    // Every independently routable scenario ends explicitly.
    for (const sc of scenarioSet.scenarios) {
      expect(sc.steps[sc.steps.length - 1].kind).toBe('end');
    }
  });

});
