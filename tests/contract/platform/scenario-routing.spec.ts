import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel, type ScenarioSet, type ScenarioDefinition } from '../../../src/platform/voice-channel';
import {
  DialogueEngine,
  type DialogueInput
} from '../../../src/platform/dialogue-channel';
import { TelegramBotAdapter, MockTelegramClient } from '../../../src/platform/telegram-bot-adapter';
import { TelegramVoiceTransport } from '../../../src/platform/telegram-voice-transport';
import { MockSTTProvider } from '../../../src/platform/stt-provider';

// Mock Web Adapter without Scenario parameter
class MockWebAdapter {
  constructor(private engine: DialogueEngine) {}
  async submit(input: DialogueInput, identity: { ownerId: string; sessionId: string }) {
    return this.engine.processInput(input, identity);
  }
}

test.describe('CONTRACT: SC-INTEGRATION-005 Generic Dialogue Scenario Routing & Session Binding Suite', () => {
  const sessionUser = { ownerId: 'user-sr-501', sessionId: 'sess-sr-501' };
  let dm: DialogueStateManager;
  let vc: VoiceChannel;
  let engine: DialogueEngine;
  let nannyScenarioSet: ScenarioSet;

  test.beforeEach(() => {
    dm = new DialogueStateManager();
    vc = new VoiceChannel(dm);

    const scenarioRaw = fs.readFileSync(path.resolve(currentDir, '../../../scenario-nanny-order.json'), 'utf8');
    nannyScenarioSet = JSON.parse(scenarioRaw);
    vc.registerScenarioSet(nannyScenarioSet);

    engine = new DialogueEngine(dm, vc);
  });

  test('SR-01: New Text -> Scenario Resolution (resolves order-nanny and fills date)', async () => {
    const res = await engine.processInput({
      modality: 'text',
      raw_input: 'нужна няня завтра'
    }, sessionUser);

    expect(res.status).toBe('WAITING_FOR_SLOT');
    const ctx = dm.getActiveState(sessionUser);
    expect(ctx).toBeDefined();
    expect(ctx?.scenarioId).toBe('order-nanny');
    expect(ctx?.slots.date).toBe('завтра');
  });

  test('SR-02: New Voice -> Scenario Resolution (resolves order-nanny from transcript)', async () => {
    const res = await engine.processInput({
      modality: 'voice',
      transcript: 'нужна няня завтра'
    }, sessionUser);

    expect(res.status).toBe('WAITING_FOR_SLOT');
    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.scenarioId).toBe('order-nanny');
    expect(ctx?.slots.date).toBe('завтра');
  });

  test('SR-03: Existing Context ignores new Scenario matching and continues active scenario', async () => {
    // 1. Initial turn activates order-nanny
    await engine.processInput({
      modality: 'text',
      raw_input: 'нужна няня завтра'
    }, sessionUser);

    let ctx = dm.getActiveState(sessionUser);
    expect(ctx?.scenarioId).toBe('order-nanny');
    expect(ctx?.slots.date).toBe('завтра');

    // Register a competing scenario that triggers on phrases like 'в три' or 'с трех'
    const competingSet: ScenarioSet = {
      version: 1,
      id: 'competing-set',
      scenarios: [{
        id: 'competing-scenario',
        intent: 'COMPETING_INTENT',
        triggerPhrases: ['в три', 'с трех'],
        requiredSlots: ['time']
      }]
    };
    vc.registerScenarioSet(competingSet);

    // 2. Next message sends 'в три' -> must stay in order-nanny context and fill start_time!
    const res2 = await engine.processInput({
      modality: 'text',
      raw_input: 'в три'
    }, sessionUser);

    ctx = dm.getActiveState(sessionUser);
    expect(ctx?.scenarioId).toBe('order-nanny');
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(res2.slots.start_time).toBe('15:00');

    // 3. Third message provides time ('до восьми')
    await engine.processInput({
      modality: 'voice',
      transcript: 'до восьми'
    }, sessionUser);

    ctx = dm.getActiveState(sessionUser);
    expect(ctx?.scenarioId).toBe('order-nanny');
    expect(ctx?.slots.end_time).toBe('20:00');
  });

  test('SR-04: Button uses Context Scenario without adapter passing scenario', async () => {
    // 1. Text activates dialogue
    await engine.processInput({
      modality: 'text',
      raw_input: 'нужна няня завтра'
    }, sessionUser);

    // 2. Button message arrives with slotName and slotValue
    const resBtn = await engine.processInput({
      modality: 'button',
      payload: {
        slotName: 'start_time',
        slotValue: '15:00'
      }
    }, sessionUser);

    expect(resBtn.slots.start_time).toBe('15:00');
    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(ctx?.scenarioId).toBe('order-nanny');
  });

  test('SR-05: Button without Context returns SCENARIO_NOT_FOUND (no guesswork)', async () => {
    const freshUser = { ownerId: 'fresh-user-5', sessionId: 'fresh-sess-5' };
    const res = await engine.processInput({
      modality: 'button',
      payload: {
        slotName: 'selected_nanny',
        slotValue: 'xyz-42'
      }
    }, freshUser);

    expect(res.status).toBe('SCENARIO_NOT_FOUND');
    expect(dm.getActiveState(freshUser)).toBeFalsy();
  });

  test('SR-06: Independent Service Scenario routes correctly without nanny terminology', async () => {
    const serviceScenario: ScenarioDefinition = {
      id: 'book-service',
      name: 'Услуги уборки',
      triggerPhrases: ['заказать уборку', 'клининг'],
      intent: 'BOOK_SERVICE',
      requiredSlots: ['selected_service', 'confirmation'],
      candidateBinding: {
        targetSlot: 'selected_service',
        idField: 'serviceId',
        labelField: 'title'
      },
      clarificationPrompts: {
        selected_service: 'Выберите тип уборки:',
        confirmation: 'Подтверждаете запись?'
      }
    };

    vc.registerScenarioSet({
      version: 1,
      id: 'service-set',
      scenarios: [serviceScenario]
    });

    const userS = { ownerId: 'user-service-6', sessionId: 'sess-service-6' };

    // New conversation matches book-service without nanny keywords
    const res = await engine.processInput({
      modality: 'text',
      raw_input: 'хочу заказать уборку'
    }, userS);

    expect(res.status).toBe('WAITING_FOR_SLOT');
    const ctx = dm.getActiveState(userS);
    expect(ctx?.scenarioId).toBe('book-service');
    expect(ctx?.intent).toBe('BOOK_SERVICE');
  });

  test('SR-07: Ambiguous Scenario returns SCENARIO_AMBIGUOUS without arbitrary choice', async () => {
    const ambiguousScenario: ScenarioDefinition = {
      id: 'order-nanny-duplicate',
      name: 'Дубликат сценария няни',
      triggerPhrases: ['нужна няня'],
      priority: 0,
      intent: 'DUPLICATE_NANNY'
    };

    vc.registerScenarioSet({
      version: 1,
      id: 'duplicate-set',
      scenarios: [ambiguousScenario]
    });

    const userAmb = { ownerId: 'user-amb-7', sessionId: 'sess-amb-7' };

    const res = await engine.processInput({
      modality: 'text',
      raw_input: 'нужна няня'
    }, userAmb);

    expect(res.status).toBe('SCENARIO_AMBIGUOUS');
    expect(dm.getActiveState(userAmb)).toBeFalsy();
  });

  test('SR-08: Priority Resolution selects scenario with highest priority via VoiceChannel.resolveIntent', async () => {
    const highPriorityScenario: ScenarioDefinition = {
      id: 'order-nanny-vip',
      name: 'VIP няня',
      triggerPhrases: ['нужна няня'],
      priority: 10,
      intent: 'ORDER_VIP_NANNY',
      requiredSlots: ['date']
    };

    vc.registerScenarioSet({
      version: 1,
      id: 'vip-set',
      scenarios: [highPriorityScenario]
    });

    const userVip = { ownerId: 'user-vip-8', sessionId: 'sess-vip-8' };

    const res = await engine.processInput({
      modality: 'text',
      raw_input: 'нужна няня'
    }, userVip);

    expect(res.status).toBe('WAITING_FOR_SLOT');
    const ctx = dm.getActiveState(userVip);
    expect(ctx?.scenarioId).toBe('order-nanny-vip');
    expect(ctx?.intent).toBe('ORDER_VIP_NANNY');
  });

  test('SR-09: No Match returns generic SCENARIO_NOT_FOUND', async () => {
    const userNo = { ownerId: 'user-no-9', sessionId: 'sess-no-9' };
    const res = await engine.processInput({
      modality: 'text',
      raw_input: 'какая погода в Париже'
    }, userNo);

    expect(res.status).toBe('SCENARIO_NOT_FOUND');
    expect(dm.getActiveState(userNo)).toBeFalsy();
  });

  test('SR-10: Telegram Adapter handleUpdate does not receive Scenario parameter', async () => {
    const mockClient = new MockTelegramClient();
    const mockSTT = new MockSTTProvider();
    const transport = new TelegramVoiceTransport(mockSTT, { getFileBuffer: async () => Buffer.from('') } as any);
    const botAdapter = new TelegramBotAdapter(engine, transport, mockClient);

    const tgUser = { id: 801 };
    const tgChat = { id: 901 };

    await botAdapter.handleUpdate({
      message: {
        from: tgUser,
        chat: tgChat,
        text: 'нужна няня завтра'
      }
    });

    const ctx = dm.getActiveState({ ownerId: '801', sessionId: '901' });
    expect(ctx?.scenarioId).toBe('order-nanny');
    expect(ctx?.slots.date).toBe('завтра');
  });

  test('SR-11: Web Adapter does not receive Scenario parameter', async () => {
    const webAdapter = new MockWebAdapter(engine);
    const webUser = { ownerId: 'web-501', sessionId: 'tab-501' };

    await webAdapter.submit({ modality: 'text', raw_input: 'нужна няня завтра' }, webUser);

    const ctx = dm.getActiveState(webUser);
    expect(ctx?.scenarioId).toBe('order-nanny');
    expect(ctx?.slots.date).toBe('завтра');
  });

  test('SR-12: Same Context across modalities without passing Scenario on each step', async () => {
    const userMix = { ownerId: 'u-mix-5', sessionId: 's-mix-5' };

    // 1. Text
    await engine.processInput({ modality: 'text', raw_input: 'нужна няня завтра' }, userMix);
    // 2. Button
    await engine.processInput({ modality: 'button', payload: { slotName: 'start_time', slotValue: '15:00' } }, userMix);
    // 3. Voice
    await engine.processInput({ modality: 'voice', transcript: 'до восьми' }, userMix);
    // 4. Text
    await engine.processInput({ modality: 'text', raw_input: 'Центр' }, userMix);

    // Verify strictly single context maintained across modalities
    expect(dm.listContexts(userMix).length).toBe(1);
    const ctx = dm.getActiveState(userMix);
    expect(ctx?.scenarioId).toBe('order-nanny');
    expect(ctx?.slots.date).toBe('завтра');
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(ctx?.slots.end_time).toBe('20:00');
    expect(ctx?.slots.location).toBe('Центр');
  });

  test('SR-13: Scenario persistence — ctx.scenarioId remains permanent source of truth', async () => {
    await engine.processInput({ modality: 'text', raw_input: 'нужна няня завтра' }, sessionUser);
    const ctxInitial = dm.getActiveState(sessionUser);
    expect(ctxInitial?.scenarioId).toBe('order-nanny');

    // Follow-up message
    await engine.processInput({ modality: 'text', raw_input: 'до восьми' }, sessionUser);
    const ctxFollowUp = dm.getActiveState(sessionUser);
    expect(ctxFollowUp?.scenarioId).toBe('order-nanny');
    expect(ctxFollowUp?.contextId).toBe(ctxInitial?.contextId);
  });

  // Architectural Static Checks (AT-09 .. AT-15)
  test('AT-09: telegram-bot-adapter.ts does NOT contain resolveIntent, resolveScenario, registerScenarioSet', () => {
    const filePath = path.resolve(currentDir, '../../../src/platform/telegram-bot-adapter.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toContain('resolveIntent');
    expect(content).not.toContain('resolveScenario');
    expect(content).not.toContain('registerScenarioSet');
  });

  test('AT-10: telegram-dialogue-adapter.ts does NOT contain resolveIntent, resolveScenario, registerScenarioSet', () => {
    const filePath = path.resolve(currentDir, '../../../src/platform/telegram-dialogue-adapter.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toContain('resolveIntent');
    expect(content).not.toContain('resolveScenario');
    expect(content).not.toContain('registerScenarioSet');
  });

  test('AT-11: MockWebAdapter does NOT contain Scenario selection logic', () => {
    const adapterCode = MockWebAdapter.toString();
    expect(adapterCode).not.toContain('resolveIntent');
    expect(adapterCode).not.toContain('ScenarioDefinition');
  });

  test('AT-12: DialogueEngine uses existing VoiceChannel.resolveIntent and does not implement custom trigger matching', () => {
    const filePath = path.resolve(currentDir, '../../../src/platform/dialogue-channel.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('this.vc.resolveIntent');
    expect(content).not.toContain('triggerPhrases');
    expect(content).not.toContain('aliases');
  });

  test('AT-13: Adapters handleUpdate does NOT accept ScenarioDefinition parameter', () => {
    const filePath = path.resolve(currentDir, '../../../src/platform/telegram-bot-adapter.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toContain('optionalScenario');
    expect(content).toMatch(/handleUpdate\(\s*update:\s*TelegramUpdate\s*\)/);
  });

  test('AT-14: DialogueEngine.processInput signature does NOT accept ScenarioDefinition', () => {
    const filePath = path.resolve(currentDir, '../../../src/platform/dialogue-channel.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toContain('explicitScenario');
    expect(content).toMatch(/processInput\(\s*input:\s*DialogueInput,\s*identity:\s*SessionIdentity\s*\)/);
  });

  test('AT-15: TelegramBotAdapter does NOT import ScenarioDefinition', () => {
    const filePath = path.resolve(currentDir, '../../../src/platform/telegram-bot-adapter.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toContain('ScenarioDefinition');
  });
});
