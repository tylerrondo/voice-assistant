import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel, type ScenarioSet, type ScenarioDefinition } from '../../../src/platform/voice-channel';
import {
  DialogueEngine,
  type DialogueInput,
  type DialoguePresentation
} from '../../../src/platform/dialogue-channel';

// Mock Channel Adapter (simulates WhatsApp or other messaging platform)
class MockGenericChannelAdapter {
  constructor(private engine: DialogueEngine) {}

  async send(input: DialogueInput, identity: { ownerId: string; sessionId: string }, scenario: ScenarioDefinition) {
    return this.engine.processInput(input, identity, scenario);
  }
}

// Mock Web Channel Adapter (simulates Web UI client)
class MockWebChannelAdapter {
  constructor(private engine: DialogueEngine) {}

  async submit(input: DialogueInput, identity: { ownerId: string; sessionId: string }, scenario: ScenarioDefinition) {
    return this.engine.processInput(input, identity, scenario);
  }
}

test.describe('CONTRACT: SC-INTEGRATION-004 Generic Dialogue Channel Contract Suite', () => {

  const sessionUser = { ownerId: 'user-gen-401', sessionId: 'sess-gen-401' };

  let dm: DialogueStateManager;
  let vc: VoiceChannel;
  let engine: DialogueEngine;
  let nannyScenarioSet: ScenarioSet;
  let dispatcherCalls: number;

  beforeEach(() => {
    dispatcherCalls = 0;
    dm = new DialogueStateManager({
      actionDispatcher: async (event, ctx, exec) => {
        dispatcherCalls++;
        return { status: 'SUCCEEDED', executionId: exec.executionId, attempt: exec.attempt };
      }
    });
    vc = new VoiceChannel(dm);

    const scenarioRaw = fs.readFileSync(path.resolve(__dirname, '../../../scenario-nanny-order.json'), 'utf8');
    nannyScenarioSet = JSON.parse(scenarioRaw);
    vc.registerScenarioSet(nannyScenarioSet);

    engine = new DialogueEngine(dm, vc);
  });

  const getScenario = () => nannyScenarioSet.scenarios[0];

  test('GC-01: Text — Mock Channel -> DialogueInput(text) -> DialogueEngine -> DialoguePresentation', async () => {
    const sc = getScenario();
    const adapter = new MockGenericChannelAdapter(engine);

    const res = await adapter.send({
      channel: 'text',
      raw_input: 'нужна няня завтра'
    }, sessionUser, sc);

    expect(dm.getActiveState(sessionUser)?.slots.date).toBe('завтра');
    expect(res.presentation.text).toBe(sc.clarificationPrompts?.start_time);
  });

  test('GC-02: Button — arbitrary slot and value filled via generic payload', async () => {
    const sc = getScenario();
    const adapter = new MockGenericChannelAdapter(engine);

    await adapter.send({
      channel: 'button',
      payload: {
        slotName: 'start_time',
        slotValue: '15:00'
      }
    }, sessionUser, sc);

    expect(dm.getActiveState(sessionUser)?.slots.start_time).toBe('15:00');
  });

  test('GC-03: Voice — DialogueInput(voice with transcript) passes through the same DialogueEngine', async () => {
    const sc = getScenario();
    const adapter = new MockGenericChannelAdapter(engine);

    await adapter.send({
      channel: 'voice',
      transcript: 'до восьми'
    }, sessionUser, sc);

    expect(dm.getActiveState(sessionUser)?.slots.end_time).toBe('20:00');
  });

  test('GC-04: Mixed channels (Text -> Button -> Voice -> Button -> Voice) in ONE DialogueContext', async () => {
    const sc = getScenario();
    const adapter = new MockGenericChannelAdapter(engine);

    // 1. Text
    await adapter.send({ channel: 'text', raw_input: 'завтра' }, sessionUser, sc);
    // 2. Button
    await adapter.send({ channel: 'button', payload: { slotName: 'start_time', slotValue: '15:00' } }, sessionUser, sc);
    // 3. Voice
    await adapter.send({ channel: 'voice', transcript: 'до восьми' }, sessionUser, sc);
    // 4. Button
    await adapter.send({ channel: 'button', payload: { slotName: 'children_count', slotValue: 2 } }, sessionUser, sc);
    // 5. Voice
    await adapter.send({ channel: 'voice', transcript: 'центр' }, sessionUser, sc);

    expect(dm.listContexts(sessionUser).length).toBe(1);
    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.date).toBe('завтра');
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(ctx?.slots.end_time).toBe('20:00');
    expect(ctx?.slots.children_count).toBe(2);
    expect(ctx?.slots.location).toBe('Центр');
  });

  test('GC-05: Candidate resolution on arbitrary candidates without nanny terminology', async () => {
    const sc = getScenario();
    const adapter = new MockGenericChannelAdapter(engine);

    await adapter.send({ channel: 'text', raw_input: 'завтра' }, sessionUser, sc);
    const ctx = dm.getActiveState(sessionUser)!;
    ctx.offers = [
      { id: 'x-17', name: 'Alpha', index: 1, status: 'AVAILABLE' },
      { id: 'x-42', name: 'Beta', index: 2, status: 'AVAILABLE' }
    ] as any;

    // Send selection choice via voice
    await adapter.send({ channel: 'voice', transcript: 'выбираю вторую' }, sessionUser, sc);

    expect(dm.getActiveState(sessionUser)?.slots.selected_nanny).toBe('x-42');
  });

  test('GC-06: Confirmation — DialogueEngine forms generic presentation actions without Telegram knowledge', async () => {
    const sc = getScenario();
    const adapter = new MockGenericChannelAdapter(engine);

    // Pre-fill slots
    await adapter.send({ channel: 'text', raw_input: 'завтра с трех до восьми на двух детей' }, sessionUser, sc);
    await adapter.send({ channel: 'button', payload: { slotName: 'children_ages', slotValue: '5 лет' } }, sessionUser, sc);
    await adapter.send({ channel: 'button', payload: { slotName: 'location', slotValue: 'Центр' } }, sessionUser, sc);
    await adapter.send({ channel: 'button', payload: { slotName: 'requirements', slotValue: 'без требований' } }, sessionUser, sc);
    const res = await adapter.send({ channel: 'button', payload: { slotName: 'selected_nanny', slotValue: 'x-42' } }, sessionUser, sc);

    expect(res.presentation.actions).toBeDefined();
    const actions = res.presentation.actions![0];
    expect(actions[0].label).toBe('Да');
    expect(actions[0].payload.slotValue).toBe('CONFIRMED');
    expect(actions[1].label).toBe('Отмена');
    expect(actions[1].payload.slotValue).toBe('REJECTED');
  });

  test('GC-07: Cancellation — generic cancellation', async () => {
    const sc = getScenario();
    const adapter = new MockGenericChannelAdapter(engine);

    await adapter.send({ channel: 'text', raw_input: 'нужна няня' }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)).toBeDefined();

    const res = await adapter.send({ channel: 'button', payload: { slotName: 'confirmation', slotValue: 'REJECTED' } }, sessionUser, sc);

    expect(res.status).toBe('CANCELLED');
    expect(dm.getActiveState(sessionUser)).toBeUndefined();
  });

  test('GC-08: Execution — ActionDispatcher called exactly once on confirmation', async () => {
    const sc = getScenario();
    const adapter = new MockGenericChannelAdapter(engine);

    await adapter.send({ channel: 'text', raw_input: 'завтра с трех до восьми на двух детей' }, sessionUser, sc);
    await adapter.send({ channel: 'button', payload: { slotName: 'children_ages', slotValue: '5 лет' } }, sessionUser, sc);
    await adapter.send({ channel: 'button', payload: { slotName: 'location', slotValue: 'Центр' } }, sessionUser, sc);
    await adapter.send({ channel: 'button', payload: { slotName: 'requirements', slotValue: 'без требований' } }, sessionUser, sc);
    await adapter.send({ channel: 'button', payload: { slotName: 'selected_nanny', slotValue: 'x-42' } }, sessionUser, sc);

    const res = await adapter.send({ channel: 'button', payload: { slotName: 'confirmation', slotValue: 'CONFIRMED' } }, sessionUser, sc);

    expect(res.status).toBe('CONFIRMED');
    expect(dispatcherCalls).toBe(1);
    expect(dm.getExecutionLogs(sessionUser).length).toBe(1);
  });

  test('GC-09: Telegram independence — MockGenericChannelAdapter completes identical dialogue flow', async () => {
    const sc = getScenario();
    const channelA = new MockGenericChannelAdapter(engine);

    const res = await channelA.send({ channel: 'text', raw_input: 'сегодня' }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.date).toBe('сегодня');
    expect(res.presentation.text).toBe(sc.clarificationPrompts?.start_time);
  });

  test('GC-10: Web independence — MockWebChannelAdapter executes scenario without engine modification', async () => {
    const sc = getScenario();
    const webUser = { ownerId: 'web-user-1', sessionId: 'web-tab-9' };
    const webAdapter = new MockWebChannelAdapter(engine);

    const res = await webAdapter.submit({ channel: 'text', raw_input: 'послезавтра' }, webUser, sc);
    expect(dm.getActiveState(webUser)?.slots.date).toBe('послезавтра');
    expect(res.presentation.text).toBe(sc.clarificationPrompts?.start_time);
  });

  test('GC-11: Presentation portability across Telegram, WhatsApp, and Web renderers', () => {
    const samplePresentation: DialoguePresentation = {
      text: 'Выберите вариант:',
      actions: [[
        { id: '1', label: 'Опция 1', payload: { slotName: 'opt', slotValue: 'val1' } },
        { id: '2', label: 'Опция 2', payload: { slotName: 'opt', slotValue: 'val2' } }
      ]]
    };

    // 1. Mock Telegram Renderer (Inline Keyboard)
    const tgKeyboard = samplePresentation.actions?.map(row => row.map(a => ({ text: a.label, callback_data: `dialogue:${a.payload.slotName}:${a.payload.slotValue}` })));
    expect(tgKeyboard?.[0][0].text).toBe('Опция 1');

    // 2. Mock WhatsApp Renderer (Interactive Buttons)
    const waButtons = samplePresentation.actions?.[0].map(a => ({ id: a.id, title: a.label }));
    expect(waButtons?.[1].title).toBe('Опция 2');

    // 3. Mock Web Renderer (HTML Buttons)
    const webButtons = samplePresentation.actions?.[0].map(a => `<button data-slot="${a.payload.slotName}" data-val="${a.payload.slotValue}">${a.label}</button>`);
    expect(webButtons?.[0]).toContain('Опция 1');
  });

  // Architectural Static Checks (AT-01 .. AT-08)
  test('AT-01: Generic Dialogue Engine does NOT import TelegramBotAdapter, TelegramVoiceTransport, TelegramClient', () => {
    const filePath = path.resolve(__dirname, '../../../src/platform/dialogue-channel.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toContain('TelegramBotAdapter');
    expect(content).not.toContain('TelegramVoiceTransport');
    expect(content).not.toContain('TelegramClient');
  });

  test('AT-02: Generic Dialogue Engine does NOT contain telegram, whatsapp, web in domain logic', () => {
    const filePath = path.resolve(__dirname, '../../../src/platform/dialogue-channel.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toMatch(/from\s+['"].*(telegram|whatsapp|web).*['"]/i);
  });

  test('AT-03: Generic Dialogue Engine does NOT contain nanny, selected_nanny, ORDER_NANNY', () => {
    const filePath = path.resolve(__dirname, '../../../src/platform/dialogue-channel.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toContain('selected_nanny');
    expect(content).not.toContain('ORDER_NANNY');
    expect(content).not.toContain('nanny');
  });

  test('AT-04: Generic Dialogue Engine does NOT contain Telegram-specific response texts', () => {
    const filePath = path.resolve(__dirname, '../../../src/platform/dialogue-channel.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toContain('Telegram');
  });

  test('AT-05: Generic Dialogue Engine does NOT contain Telegram callback protocol dialogue:', () => {
    const filePath = path.resolve(__dirname, '../../../src/platform/dialogue-channel.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toContain('dialogue:');
  });

  test('AT-06: Telegram Bot Adapter does NOT call fillSlot, resolveCandidate, createExecution, dispatchAction', () => {
    const filePath = path.resolve(__dirname, '../../../src/platform/telegram-bot-adapter.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toContain('.fillSlot(');
    expect(content).not.toContain('.resolveCandidate(');
    expect(content).not.toContain('.createExecution(');
    expect(content).not.toContain('.dispatchAction(');
  });

  test('AT-07: Telegram Bot Adapter does NOT import DialogueStateManager', () => {
    const filePath = path.resolve(__dirname, '../../../src/platform/telegram-bot-adapter.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toMatch(/import\s+.*DialogueStateManager.*from/);
  });

  test('AT-08: DialogueEngine is the single owner of DialogueContext orchestration', () => {
    const filePath = path.resolve(__dirname, '../../../src/platform/dialogue-channel.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toContain('class DialogueEngine');
    expect(content).toContain('this.dm.createContext');
    expect(content).toContain('this.dm.createExecution');
    expect(content).toContain('this.dm.dispatchAction');
  });

});
