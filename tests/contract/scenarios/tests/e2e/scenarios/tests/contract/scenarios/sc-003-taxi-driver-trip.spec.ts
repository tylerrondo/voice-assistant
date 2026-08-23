import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-sc-003-taxi-driver-trip.json');
const rawContent = fs.readFileSync(scenarioFilePath, 'utf-8');
const scenarioSet = JSON.parse(rawContent);

test.describe('SC-003: Taxi Driver Trip Contract Suite', () => {

  test('CONTRACT-SC003-01: ScenarioSet v2 Root Schema & 5 Distinct Voice Scenarios', async () => {
    expect(scenarioSet.version).toBe(2);
    expect(scenarioSet.id).toBe('scenario-set-sc-003-taxi-driver-trip');
    expect(scenarioSet.scenarios.length).toBe(5);

    const ids = scenarioSet.scenarios.map((s: any) => s.id);
    expect(ids).toEqual([
      'sc003-accept-order',
      'sc003-arrived',
      'sc003-start-trip',
      'sc003-finish-trip',
      'sc003-become-available'
    ]);
  });

  test('CONTRACT-SC003-02: Distinct Voice Activations and Payload Constraints', async () => {
    const activations = scenarioSet.scenarios.map((s: any) => s.activation.value);
    expect(activations).toEqual([
      'voice.accept-order',
      'voice.arrived',
      'voice.start-trip',
      'voice.finish-trip',
      'voice.available'
    ]);

    expect(scenarioSet.scenarios[0].steps[0].event.payload.orderId).toBe(1001);
    expect(scenarioSet.scenarios[1].steps[1].event.payload.orderId).toBe(1001);
    expect(scenarioSet.scenarios[2].steps[0].event.payload.orderId).toBe(1001);
    expect(scenarioSet.scenarios[3].steps[1].event.payload.orderId).toBe(1001);
  });

});
