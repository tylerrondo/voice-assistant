import { test, expect } from '@playwright/test';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel, ScenarioSet } from '../../../src/platform/voice-channel';

test.describe('CONTRACT: PLATFORM-014 Intent Resolution & Slot Ambiguity Suite', () => {

  const sessionA = { ownerId: 'driver-001', sessionId: 'session-A' };
  const sessionB = { ownerId: 'driver-002', sessionId: 'session-B' };

  test('CONTRACT-01: Single matching Scenario returns RESOLVED', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet({
      version: 2,
      id: 'set-1',
      name: 'Set 1',
      scenarios: [
        {
          id: 'sc-1',
          name: 'Sc 1',
          activation: { type: 'voice', value: 'voice.order' },
          intent: 'ORDER',
          steps: [{ kind: 'emit', event: { type: 'order.created', payload: {} } }]
        }
      ]
    });

    const res = channel.resolveIntent('order');
    expect(res.status).toBe('RESOLVED');
    if (res.status === 'RESOLVED') {
      expect(res.scenarioId).toBe('sc-1');
      expect(res.intent).toBe('ORDER');
    }
  });

  test('CONTRACT-02: Two matching Scenarios with equal priority return AMBIGUOUS_INTENT', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet({
      version: 2,
      id: 'set-2',
      name: 'Set 2',
      scenarios: [
        {
          id: 'sc-a',
          name: 'Sc A',
          activation: { type: 'voice', value: 'voice.take-trip' },
          priority: 50,
          intent: 'TAKE_TRIP_A',
          steps: [{ kind: 'emit', event: { type: 'trip.a', payload: {} } }]
        },
        {
          id: 'sc-b',
          name: 'Sc B',
          activation: { type: 'voice', value: 'voice.take-order' },
          priority: 50,
          intent: 'TAKE_TRIP_B',
          steps: [{ kind: 'emit', event: { type: 'trip.b', payload: {} } }]
        }
      ]
    });

    const res = channel.resolveIntent('take');
    expect(res.status).toBe('AMBIGUOUS_INTENT');
    if (res.status === 'AMBIGUOUS_INTENT') {
      expect(res.candidateScenarioIds).toEqual(['sc-a', 'sc-b']);
      expect(res.candidateIntents).toEqual(['TAKE_TRIP_A', 'TAKE_TRIP_B']);
    }
  });

  test('CONTRACT-03: Equal priority produces ambiguity without array order preference', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet({
      version: 2,
      id: 'set-3',
      name: 'Set 3',
      scenarios: [
        {
          id: 'first-sc',
          name: 'First',
          activation: { type: 'voice', value: 'voice.start' },
          priority: 10,
          intent: 'INTENT_FIRST',
          steps: [{ kind: 'emit', event: { type: 'e1', payload: {} } }]
        },
        {
          id: 'second-sc',
          name: 'Second',
          activation: { type: 'voice', value: 'voice.start-now' },
          priority: 10,
          intent: 'INTENT_SECOND',
          steps: [{ kind: 'emit', event: { type: 'e2', payload: {} } }]
        }
      ]
    });

    const res = channel.resolveIntent('start');
    expect(res.status).toBe('AMBIGUOUS_INTENT');
  });

  test('CONTRACT-04: Higher priority deterministically resolves conflict', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet({
      version: 2,
      id: 'set-4',
      name: 'Set 4',
      scenarios: [
        {
          id: 'sc-low',
          name: 'Low',
          activation: { type: 'voice', value: 'voice.ride' },
          priority: 10,
          intent: 'LOW_RIDE',
          steps: [{ kind: 'emit', event: { type: 'e1', payload: {} } }]
        },
        {
          id: 'sc-high',
          name: 'High',
          activation: { type: 'voice', value: 'voice.ride-express' },
          priority: 100,
          intent: 'HIGH_RIDE',
          steps: [{ kind: 'emit', event: { type: 'e2', payload: {} } }]
        }
      ]
    });

    const res = channel.resolveIntent('ride');
    expect(res.status).toBe('RESOLVED');
    if (res.status === 'RESOLVED') {
      expect(res.scenarioId).toBe('sc-high');
    }
  });

  test('CONTRACT-05: Non-matching input returns NO_MATCH', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet({
      version: 2,
      id: 'set-5',
      name: 'Set 5',
      scenarios: [
        {
          id: 'sc-1',
          name: 'Sc 1',
          activation: { type: 'voice', value: 'voice.order' },
          intent: 'ORDER',
          steps: [{ kind: 'emit', event: { type: 'e1', payload: {} } }]
        }
      ]
    });

    const res = channel.resolveIntent('completely unrelated phrase');
    expect(res.status).toBe('NO_MATCH');
  });

  test('CONTRACT-06: Duplicate Scenario ID throws CONTRACT_VIOLATION during registration', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);

    expect(() => {
      channel.registerScenarioSet({
        version: 2,
        id: 'dup-id-set',
        name: 'Dup Id Set',
        scenarios: [
          { id: 'sc-dup', name: 'Sc 1', activation: { type: 'voice', value: 'voice.a' }, intent: 'A', steps: [{ kind: 'emit', event: { type: 'e1', payload: {} } }] },
          { id: 'sc-dup', name: 'Sc 2', activation: { type: 'voice', value: 'voice.b' }, intent: 'B', steps: [{ kind: 'emit', event: { type: 'e2', payload: {} } }] }
        ]
      });
    }).toThrow(/CONTRACT_VIOLATION.*Duplicate scenario id/);
  });

  test('CONTRACT-07: Duplicate activation trigger throws CONTRACT_VIOLATION', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);

    expect(() => {
      channel.registerScenarioSet({
        version: 2,
        id: 'dup-trig-set',
        name: 'Dup Trigger Set',
        scenarios: [
          { id: 'sc-1', name: 'Sc 1', activation: { type: 'voice', value: 'voice.same-trigger' }, intent: 'A', steps: [{ kind: 'emit', event: { type: 'e1', payload: {} } }] },
          { id: 'sc-2', name: 'Sc 2', activation: { type: 'voice', value: 'voice.same-trigger' }, intent: 'B', steps: [{ kind: 'emit', event: { type: 'e2', payload: {} } }] }
        ]
      });
    }).toThrow(/CONTRACT_VIOLATION.*Trigger or alias collision/);
  });

  test('CONTRACT-08: Trigger and alias collision throws CONTRACT_VIOLATION', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);

    expect(() => {
      channel.registerScenarioSet({
        version: 2,
        id: 'collision-set',
        name: 'Collision Set',
        scenarios: [
          { id: 'sc-1', name: 'Sc 1', activation: { type: 'voice', value: 'voice.primary' }, aliases: ['shared-alias'], intent: 'A', steps: [{ kind: 'emit', event: { type: 'e1', payload: {} } }] },
          { id: 'sc-2', name: 'Sc 2', activation: { type: 'voice', value: 'voice.secondary' }, aliases: ['shared-alias'], intent: 'B', steps: [{ kind: 'emit', event: { type: 'e2', payload: {} } }] }
        ]
      });
    }).toThrow(/CONTRACT_VIOLATION.*Trigger or alias collision/);
  });

  test('CONTRACT-09: One phrase matching two Slot extractors with equal priority returns AMBIGUOUS_SLOT', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);

    const extractors: any = {
      address: { type: 'string', priority: 50 },
      passengerName: { type: 'string', priority: 50 }
    };

    const res = channel.extractSlotsDeterministically('центральная', extractors, 'sc-test');
    expect(res.status).toBe('AMBIGUOUS_SLOT');
    if (res.status === 'AMBIGUOUS_SLOT') {
      expect(res.candidates.length).toBe(2);
      expect(res.candidates.map(c => c.slotName)).toEqual(['address', 'passengerName']);
    }
  });

  test('CONTRACT-10: Slot priority deterministically resolves slot conflict', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);

    const extractors: any = {
      address: { type: 'string', priority: 100 },
      passengerName: { type: 'string', priority: 50 }
    };

    const res = channel.extractSlotsDeterministically('центральная', extractors, 'sc-test');
    expect(res.status).toBe('RESOLVED');
    if (res.status === 'RESOLVED') {
      expect(res.slots).toEqual({ address: 'центральная' });
    }
  });

  test('CONTRACT-11: Ambiguous Intent produces zero executions in DialogueStateManager', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet({
      version: 2,
      id: 'set-amb-intent',
      name: 'Set Amb Intent',
      scenarios: [
        { id: 'sc-1', name: 'Sc 1', activation: { type: 'voice', value: 'voice.start-work' }, priority: 10, intent: 'W1', steps: [{ kind: 'emit', event: { type: 'e1', payload: {} } }] },
        { id: 'sc-2', name: 'Sc 2', activation: { type: 'voice', value: 'voice.start-shift' }, priority: 10, intent: 'W2', steps: [{ kind: 'emit', event: { type: 'e2', payload: {} } }] }
      ]
    });

    const res = await channel.handleIncomingVoice('start', sessionA);
    expect(res.status).toBe('AMBIGUOUS_INTENT');
    expect(dm.getExecutionLogs(sessionA).length).toBe(0);
  });

  test('CONTRACT-12: Ambiguous Slot produces zero executions', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet({
      version: 2,
      id: 'set-amb-slot',
      name: 'Set Amb Slot',
      scenarios: [
        {
          id: 'sc-slot',
          name: 'Sc Slot',
          activation: { type: 'voice', value: 'voice.create' },
          intent: 'CREATE',
          requiredSlots: ['target'],
          slotExtractors: {
            dest: { type: 'string', priority: 10 },
            name: { type: 'string', priority: 10 }
          },
          steps: [{ kind: 'emit', event: { type: 'e1', payload: {} } }]
        }
      ]
    });

    const res = await channel.handleIncomingVoice('create', sessionA);
    expect(res.status).toBe('WAITING_FOR_SLOT');

    const fillRes = await channel.handleIncomingVoice('любой текст', sessionA);
    expect(fillRes.status).toBe('AMBIGUOUS_SLOT');
    expect(dm.getExecutionLogs(sessionA).length).toBe(0);
  });

  test('CONTRACT-13: Foreign context never enters candidate set during resolution', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet({
      version: 2,
      id: 'set-iso',
      name: 'Set Iso',
      scenarios: [
        {
          id: 'sc-1',
          name: 'Sc 1',
          activation: { type: 'voice', value: 'voice.order' },
          intent: 'ORDER',
          requiredSlots: ['orderId', 'payment'],
          slotExtractors: {
            orderId: { type: 'integer', pattern: '\\b\\d+\\b' },
            payment: { type: 'enum', mapping: { card: ['картой'] } }
          },
          steps: [{ kind: 'emit', event: { type: 'order.accepted', payload: {} } }]
        }
      ]
    });

    await channel.handleIncomingVoice('order 1001', sessionA);
    await channel.handleIncomingVoice('order 2001', sessionB);

    const resA = await channel.handleIncomingVoice('картой', sessionA);
    expect(resA.status).toBe('COMPLETED');
    expect(resA.slots.orderId).toBe(1001);
  });

  test('CONTRACT-14: Invalid ScenarioSet registration leaves previous active ScenarioSet intact', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);

    const validSet: ScenarioSet = {
      version: 2,
      id: 'valid-set-1',
      name: 'Valid Set 1',
      scenarios: [
        { id: 'sc-ok', name: 'Ok', activation: { type: 'voice', value: 'voice.valid' }, intent: 'OK', steps: [{ kind: 'emit', event: { type: 'ok', payload: {} } }] }
      ]
    };

    channel.registerScenarioSet(validSet);
    expect(channel.getActiveScenarioSetId()).toBe('valid-set-1');

    expect(() => {
      channel.registerScenarioSet({
        version: 2,
        id: 'broken-set',
        name: 'Broken',
        scenarios: [
          { id: 'sc-broken', name: 'B1', activation: { type: 'voice', value: 'voice.b1' }, intent: 'B1', steps: [{ kind: 'emit', event: { type: 'b1', payload: {} } }] },
          { id: 'sc-broken', name: 'B2', activation: { type: 'voice', value: 'voice.b2' }, intent: 'B2', steps: [{ kind: 'emit', event: { type: 'b2', payload: {} } }] }
        ]
      });
    }).toThrow();

    expect(channel.getActiveScenarioSetId()).toBe('valid-set-1');
  });

});
