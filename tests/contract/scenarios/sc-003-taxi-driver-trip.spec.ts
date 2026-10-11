import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import * as fs from 'fs';
import * as path from 'path';

const scenarioFilePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scenario-sc-003-taxi-driver-trip.json');
const rawContent = fs.readFileSync(scenarioFilePath, 'utf-8');
const scenarioSet = JSON.parse(rawContent);

test.describe('SC-003: Taxi Driver End-to-End Trip - Contract Tests', () => {

  test('CONTRACT-SC003-01: Root Schema, Version 2 and Set ID', async () => {
    expect(scenarioSet).toBeDefined();
    expect(scenarioSet.version).toBe(2);
    expect(scenarioSet.id).toBe('scenario-set-sc-003-taxi-driver-trip');
    expect(scenarioSet.name).toBe('Taxi Driver End-to-End Trip Workflow');
    expect(Array.isArray(scenarioSet.scenarios)).toBe(true);
    expect(scenarioSet.scenarios.map((sc: any) => sc.id)).toEqual([
      'sc003-accept-order',
      'sc003-arrived',
      'sc003-start-trip',
      'sc003-finish-trip',
      'sc003-become-available'
    ]);
  });

  test('CONTRACT-SC003-02: Ordered scenarios emit the expected events and use uniform orderId', async () => {
    const expectedEvents = [
      'driver.order.accepted',
      'driver.arrived',
      'driver.trip.started',
      'driver.trip.finished',
      'driver.available'
    ];
    const actualEvents = scenarioSet.scenarios.map((sc: any) =>
      sc.steps.find((step: any) => step.kind === 'emit')?.event.type
    );
    expect(actualEvents).toEqual(expectedEvents);

    for (const sc of scenarioSet.scenarios.slice(0, 4)) {
      const emitStep = sc.steps.find((step: any) => step.kind === 'emit');
      expect(emitStep.event.payload.orderId).toBe(1001);
      expect(sc.steps[sc.steps.length - 1].kind).toBe('end');
    }
    expect(scenarioSet.scenarios[4].steps[0].event.payload.driverStatus).toBe('available');
    for (const sc of scenarioSet.scenarios) {
      expect(sc.steps[sc.steps.length - 1].kind).toBe('end');
    }
  });
});
