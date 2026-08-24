import { test, expect } from '@playwright/test';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel, ScenarioSet } from '../../../src/platform/voice-channel';
import * as fs from 'fs';
import * as path from 'path';

const scenarioPath = path.resolve(__dirname, '../../../scenario-platform-012-production-pipeline.json');
const rawContent = fs.readFileSync(scenarioPath, 'utf-8');
const scenarioSet: ScenarioSet = JSON.parse(rawContent);

test.describe('CONTRACT: PLATFORM-012 Production Pipeline Suite', () => {

  test('CONTRACT-01: VoiceChannel registers ScenarioSet and exposes activeScenarioSetId', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet(scenarioSet);

    expect(channel.getActiveScenarioSetId()).toBe('scenario-set-platform-012-production-pipeline');
  });

  test('CONTRACT-02: Action Dispatch boundary invokes real onActionDispatch callback upon context completion', async () => {
    const dispatchedEvents: any[] = [];
    const dm = new DialogueStateManager({
      onActionDispatch: (event, ctx) => {
        dispatchedEvents.push({ event, contextId: ctx.contextId });
      }
    });
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet(scenarioSet);

    await channel.handleIncomingVoice('Прими заказ 1001');
    await channel.handleIncomingVoice('Картой');

    expect(dispatchedEvents.length).toBe(1);
    expect(dispatchedEvents[0].event.type).toBe('driver.order.accepted');
    expect(dispatchedEvents[0].event.payload).toEqual({ orderId: 1001, payment: 'card' });
  });

  test('CONTRACT-03: Auto-Expiry Scheduler automatically transitions context to EXPIRED after TTL without manual calls', async () => {
    // 50ms TTL for fast contract verification
    const dm = new DialogueStateManager({ defaultTtlMs: 50, enableAutoExpiryScheduler: true });
    const ctx = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');

    expect(ctx.status).toBe('WAITING_FOR_SLOT');

    // Wait for auto-expiry timer
    await new Promise(resolve => setTimeout(resolve, 80));

    const expiredCtx = dm.getContext(ctx.contextId);
    expect(expiredCtx?.status).toBe('EXPIRED');
  });

  test('CONTRACT-04: Strict capacity policy rejects new context when maxActiveContexts is exceeded', async () => {
    const dm = new DialogueStateManager({ maxActiveContexts: 1 });
    dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');

    expect(() => {
      dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');
    }).toThrow(/REJECT_NEW_CONTEXT/);
  });

  test('CONTRACT-05: Strict cancellation with no domain execution and pure cancel handling', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet(scenarioSet);

    await channel.handleIncomingVoice('Прими заказ 1001');
    const cancelRes = await channel.handleIncomingVoice('Отмена');

    expect(cancelRes).toBe(true);
    const ctx = dm.listContexts()[0];
    expect(ctx.status).toBe('CANCELLED');
    expect(dm.getExecutionLogs().length).toBe(0);
  });

  test('CONTRACT-06: Strict Ambiguity prompt template enforcement without fallback values', async () => {
    const dm = new DialogueStateManager();
    const channel = new VoiceChannel(dm);
    channel.registerScenarioSet(scenarioSet);

    await channel.handleIncomingVoice('Прими заказ 1001');
    await channel.handleIncomingVoice('Прими заказ 1002');

    const ambResult = await channel.handleIncomingVoice('Картой');
    expect(ambResult.status).toBe('AMBIGUOUS_CONTEXT');
    expect(ambResult.clarificationPrompt).toContain('1001');
    expect(ambResult.clarificationPrompt).toContain('1002');
  });

});
