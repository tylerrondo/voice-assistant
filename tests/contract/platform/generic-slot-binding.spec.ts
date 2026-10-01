import { test, expect } from '@playwright/test';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel, type ScenarioSet } from '../../../src/platform/voice-channel';

test.describe('CONTRACT: SC-PLATFORM-002 Generic Slot Binding Portability Suite', () => {

  const sessionUserA = { ownerId: 'user-generic-001', sessionId: 'session-generic-A' };

  let dm: DialogueStateManager;
  let vc: VoiceChannel;
  let dispatcherCalls: number;

  // Scenario 1: selectedItemId
  const scenarioItemSet: ScenarioSet = {
    version: 1,
    id: 'scenario-set-item',
    scenarios: [
      {
        id: 'select-item',
        intent: 'SELECT_ITEM',
        triggerPhrases: ['select item'],
        requiredSlots: ['selectedItemId', 'confirmation'],
        slotExtractors: {
          selectedItemId: {
            type: 'string',
            rules: [
              { pattern: '\\b(item[- ]?1|alpha)\\b', value: 'ITEM-1' },
              { pattern: '\\b(item[- ]?2|beta)\\b', value: 'ITEM-2' }
            ]
          },
          confirmation: {
            type: 'enum',
            rules: [
              { pattern: '\\bconfirm\\b', value: 'CONFIRMED' },
              { pattern: '\\breject\\b', value: 'REJECTED' }
            ]
          }
        },
        steps: [
          {
            kind: 'emit',
            event: {
              type: 'item.selected',
              payload: {}
            }
          }
        ]
      }
    ]
  };

  // Scenario 2: selectedServiceId
  const scenarioServiceSet: ScenarioSet = {
    version: 1,
    id: 'scenario-set-service',
    scenarios: [
      {
        id: 'select-service',
        intent: 'SELECT_SERVICE',
        triggerPhrases: ['select service'],
        requiredSlots: ['selectedServiceId', 'confirmation'],
        slotExtractors: {
          selectedServiceId: {
            type: 'string',
            rules: [
              { pattern: '\\bcleaning\\b', value: 'SERVICE-CLEANING' },
              { pattern: '\\bdelivery\\b', value: 'SERVICE-DELIVERY' }
            ]
          },
          confirmation: {
            type: 'enum',
            rules: [
              { pattern: '\\bconfirm\\b', value: 'CONFIRMED' },
              { pattern: '\\breject\\b', value: 'REJECTED' }
            ]
          }
        },
        steps: [
          {
            kind: 'emit',
            event: {
              type: 'service.selected',
              payload: {}
            }
          }
        ]
      }
    ]
  };

  // Scenario 3: targetId (Neutral / arbitrary resource slot)
  const scenarioResourceSet: ScenarioSet = {
    version: 1,
    id: 'scenario-set-resource',
    scenarios: [
      {
        id: 'select-resource',
        intent: 'SELECT_RESOURCE',
        triggerPhrases: ['select resource'],
        requiredSlots: ['targetId', 'confirmation'],
        slotExtractors: {
          targetId: {
            type: 'string',
            rules: [
              { pattern: '\\bresource[- ]?42\\b', value: 'RESOURCE-42' },
              { pattern: '\\bresource[- ]?99\\b', value: 'RESOURCE-99' }
            ]
          },
          confirmation: {
            type: 'enum',
            rules: [
              { pattern: '\\bconfirm\\b', value: 'CONFIRMED' },
              { pattern: '\\breject\\b', value: 'REJECTED' }
            ]
          }
        },
        steps: [
          {
            kind: 'emit',
            event: {
              type: 'resource.selected',
              payload: {}
            }
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    dispatcherCalls = 0;
    dm = new DialogueStateManager({
      actionDispatcher: async (event, ctx, exec) => {
        dispatcherCalls++;
        return { status: 'SUCCEEDED', executionId: exec.executionId, attempt: exec.attempt };
      }
    });
    vc = new VoiceChannel(dm);
  });

  test('GENERIC-01: Initial generic slot binding («item 1») без создания execution', async () => {
    vc.registerScenarioSet(scenarioItemSet);

    dm.createContext(
      'SELECT_ITEM',
      {},
      ['selectedItemId', 'confirmation'],
      'item.selected',
      {},
      sessionUserA,
      'select-item'
    );

    await vc.handleIncomingVoice('item 1', sessionUserA);

    const ctx = dm.getActiveState(sessionUserA);
    expect(ctx?.slots.selectedItemId).toBe('ITEM-1');
    expect(ctx?.missingSlots).toContain('confirmation');
    expect(ctx?.status).toBe('WAITING_FOR_SLOT');
    expect(dm.getExecutionLogs(sessionUserA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('GENERIC-02: Generic slot replacement («item 1» -> «item 2») перезаписывает слот без второго контекста', async () => {
    vc.registerScenarioSet(scenarioItemSet);

    dm.createContext(
      'SELECT_ITEM',
      {},
      ['selectedItemId', 'confirmation'],
      'item.selected',
      {},
      sessionUserA,
      'select-item'
    );

    await vc.handleIncomingVoice('item 1', sessionUserA);
    expect(dm.getActiveState(sessionUserA)?.slots.selectedItemId).toBe('ITEM-1');

    await vc.handleIncomingVoice('item 2', sessionUserA);
    const ctx = dm.getActiveState(sessionUserA);
    expect(ctx?.slots.selectedItemId).toBe('ITEM-2');
    expect(dm.listContexts(sessionUserA).length).toBe(1);
    expect(dm.getExecutionLogs(sessionUserA).length).toBe(0);
  });

  test('GENERIC-03: Generic confirmation исполняет выбранный слот с payload', async () => {
    vc.registerScenarioSet(scenarioItemSet);

    dm.createContext(
      'SELECT_ITEM',
      {},
      ['selectedItemId', 'confirmation'],
      'item.selected',
      {},
      sessionUserA,
      'select-item'
    );

    await vc.handleIncomingVoice('item 2', sessionUserA);
    await vc.handleIncomingVoice('confirm', sessionUserA);

    const logs = dm.getExecutionLogs(sessionUserA);
    expect(logs.length).toBe(1);
    expect(dispatcherCalls).toBe(1);
    expect(logs[0].status).toBe('SUCCEEDED');
    expect(logs[0].payload.selectedItemId).toBe('ITEM-2');
    expect(logs[0].payload.confirmation).toBe('CONFIRMED');
  });

  test('GENERIC-04: Generic rejection оставляет контекст в WAITING_FOR_SLOT и 0 execution', async () => {
    vc.registerScenarioSet(scenarioItemSet);

    dm.createContext(
      'SELECT_ITEM',
      {},
      ['selectedItemId', 'confirmation'],
      'item.selected',
      {},
      sessionUserA,
      'select-item'
    );

    await vc.handleIncomingVoice('item 1', sessionUserA);
    const res = await vc.handleIncomingVoice('reject', sessionUserA);

    expect(res.status).toBe('SELECTION_REJECTED');
    const ctx = dm.getActiveState(sessionUserA);
    expect(ctx?.status).toBe('WAITING_FOR_SLOT');
    expect(ctx?.slots.selectedItemId).toBe('ITEM-1');
    expect(ctx?.slots.confirmation).toBeUndefined();
    expect(dm.getExecutionLogs(sessionUserA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('GENERIC-05: Replacement after rejection («item 1» -> reject -> «item 2» -> confirm)', async () => {
    vc.registerScenarioSet(scenarioItemSet);

    dm.createContext(
      'SELECT_ITEM',
      {},
      ['selectedItemId', 'confirmation'],
      'item.selected',
      {},
      sessionUserA,
      'select-item'
    );

    await vc.handleIncomingVoice('item 1', sessionUserA);
    await vc.handleIncomingVoice('reject', sessionUserA);
    await vc.handleIncomingVoice('item 2', sessionUserA);
    await vc.handleIncomingVoice('confirm', sessionUserA);

    const logs = dm.getExecutionLogs(sessionUserA);
    expect(logs.length).toBe(1);
    expect(dispatcherCalls).toBe(1);
    expect(logs[0].payload.selectedItemId).toBe('ITEM-2');
    expect(logs[0].payload.selectedItemId).not.toBe('ITEM-1');
  });

  test('GENERIC-06: Runtime не знает имени доменного слота (работа с selectedServiceId)', async () => {
    vc.registerScenarioSet(scenarioServiceSet);

    dm.createContext(
      'SELECT_SERVICE',
      {},
      ['selectedServiceId', 'confirmation'],
      'service.selected',
      {},
      sessionUserA,
      'select-service'
    );

    await vc.handleIncomingVoice('cleaning', sessionUserA);
    expect(dm.getActiveState(sessionUserA)?.slots.selectedServiceId).toBe('SERVICE-CLEANING');

    await vc.handleIncomingVoice('confirm', sessionUserA);
    const logs = dm.getExecutionLogs(sessionUserA);
    expect(logs.length).toBe(1);
    expect(logs[0].payload.selectedServiceId).toBe('SERVICE-CLEANING');
  });

  test('GENERIC-07: Arbitrary slot name (нейтральный слот targetId)', async () => {
    vc.registerScenarioSet(scenarioResourceSet);

    dm.createContext(
      'SELECT_RESOURCE',
      {},
      ['targetId', 'confirmation'],
      'resource.selected',
      {},
      sessionUserA,
      'select-resource'
    );

    await vc.handleIncomingVoice('resource 42', sessionUserA);
    expect(dm.getActiveState(sessionUserA)?.slots.targetId).toBe('RESOURCE-42');

    await vc.handleIncomingVoice('confirm', sessionUserA);
    const logs = dm.getExecutionLogs(sessionUserA);
    expect(logs.length).toBe(1);
    expect(logs[0].payload.targetId).toBe('RESOURCE-42');
  });

  test('GENERIC-08: Generic сценарий не требует OfferDefinition или массива offers', async () => {
    vc.registerScenarioSet(scenarioItemSet);

    const ctx = dm.createContext(
      'SELECT_ITEM',
      {},
      ['selectedItemId', 'confirmation'],
      'item.selected',
      {},
      sessionUserA,
      'select-item'
      // offers array omitted completely
    );

    expect(ctx.offers).toBeUndefined();

    await vc.handleIncomingVoice('item 1', sessionUserA);
    await vc.handleIncomingVoice('confirm', sessionUserA);

    expect(dm.getExecutionLogs(sessionUserA).length).toBe(1);
  });

});
