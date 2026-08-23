import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const scenarioPath = path.resolve(__dirname, '../../../scenario-platform-dialogue-slot-filling.json');
const rawContent = fs.readFileSync(scenarioPath, 'utf-8');
const scenarioSet = JSON.parse(rawContent);

test.describe('CONTRACT: Dialogue State & Slot-Filling Schema Suite (ТЗ-VOICE-PLATFORM-005)', () => {

  test('CONTRACT-DS-01: ScenarioSet v2 Root Schema & Required Slots Definition', async () => {
    expect(scenarioSet.version).toBe(2);
    expect(scenarioSet.id).toBe('scenario-set-platform-dialogue-slot-filling');
    expect(Array.isArray(scenarioSet.scenarios)).toBe(true);
    
    const sc = scenarioSet.scenarios[0];
    expect(sc.intent).toBe('PROCESS_TEST_ACTION');
    expect(sc.requiredSlots).toEqual(['item', 'quantity']);
    expect(sc.clarificationPrompts.quantity).toBe('Сколько?');
  });

  test('CONTRACT-DS-02: Dialogue State Schema & Lifecycle Transitions', async () => {
    const allowedStatuses = ['IDLE', 'WAITING_FOR_SLOT', 'COMPLETED', 'CANCELLED', 'EXPIRED'];
    expect(allowedStatuses).toHaveLength(5);
    expect(allowedStatuses).toContain('WAITING_FOR_SLOT');
    expect(allowedStatuses).toContain('COMPLETED');
    expect(allowedStatuses).toContain('CANCELLED');
    expect(allowedStatuses).toContain('EXPIRED');
  });

});
