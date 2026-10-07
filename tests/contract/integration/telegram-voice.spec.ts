import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel, type ScenarioSet } from '../../../src/platform/voice-channel';
import { TelegramDialogueAdapter } from '../../../src/platform/telegram-dialogue-adapter';
import { MockSTTProvider } from '../../../src/platform/stt-provider';
import { TelegramVoiceTransport, type TelegramVoiceMessage } from '../../../src/platform/telegram-voice-transport';

test.describe('CONTRACT: SC-INTEGRATION-002 Real Telegram Voice Input + STT Integration Suite', () => {

  const sessionUser = { ownerId: 'user-voice-201', sessionId: 'sess-tg-voice-001' };

  let dm: DialogueStateManager;
  let vc: VoiceChannel;
  let adapter: TelegramDialogueAdapter;
  let mockSTT: MockSTTProvider;
  let voiceTransport: TelegramVoiceTransport;
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

    adapter = new TelegramDialogueAdapter(dm, vc);
    mockSTT = new MockSTTProvider();
    voiceTransport = new TelegramVoiceTransport(mockSTT);
  });

  const getScenario = () => nannyScenarioSet.scenarios[0];

  const fakeAudioBuffer = Buffer.from('RIFF_FAKE_AUDIO_DATA_OGG');

  // Helper pipeline simulating the Telegram Voice Transport -> Adapter flow
  const sendVoiceAudio = async (transcript: string) => {
    mockSTT.setTranscript(transcript);
    const transportRes = await voiceTransport.processVoiceMessage({
      fileBuffer: fakeAudioBuffer
    });

    if (transportRes.status === 'TRANSCRIPTION_SUCCESS' && transportRes.normalizedInput) {
      return adapter.handleMessage(transportRes.normalizedInput, sessionUser, getScenario());
    }
    return transportRes;
  };

  test('TV-01: Voice -> STT -> Dialogue', async () => {
    await sendVoiceAudio('нужна няня завтра');
    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.date).toBe('завтра');
  });

  test('TV-02: Voice сохраняет существующий context (Button -> Voice -> Voice -> Button)', async () => {
    const sc = getScenario();

    // 1. Button: date = завтра
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'date', slotValue: 'завтра' } }, sessionUser, sc);

    // 2. Voice: "с трех"
    await sendVoiceAudio('с трех');

    // 3. Voice: "до восьми"
    await sendVoiceAudio('до восьми');

    // 4. Button: children_count = 2
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'children_count', slotValue: 2 } }, sessionUser, sc);

    // Assert: Single unified context
    expect(dm.listContexts(sessionUser).length).toBe(1);
    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.date).toBe('завтра');
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(ctx?.slots.end_time).toBe('20:00');
    expect(ctx?.slots.children_count).toBe(2);
  });

  test('TV-03: Voice correction (Button 15:00 -> Voice "нет, давайте в четыре")', async () => {
    const sc = getScenario();

    // Button: 15:00
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'start_time', slotValue: '15:00' } }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.start_time).toBe('15:00');

    // Voice correction
    await sendVoiceAudio('нет, давайте в четыре');

    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.status).toBe('WAITING_FOR_SLOT');
    expect(ctx?.slots.start_time).toBe('16:00');
    expect(dm.listContexts(sessionUser).length).toBe(1);
  });

  test('TV-04: Voice candidate selection using existing VoiceChannel.resolveCandidate()', async () => {
    const sc = getScenario();

    // Track resolveCandidate calls
    let resolverCalls = 0;
    const origResolve = vc.resolveCandidate.bind(vc);
    vc.resolveCandidate = (...args) => {
      resolverCalls++;
      return origResolve(...args);
    };

    // Attach dynamic candidate set with unknown IDs
    await adapter.handleMessage({ channel: 'text', raw_input: 'завтра' }, sessionUser, sc);
    const ctx = dm.getActiveState(sessionUser)!;
    ctx.offers = [
      { id: 'xyz-17', name: 'Ирина', index: 1, status: 'AVAILABLE' },
      { id: 'xyz-42', name: 'Ольга', index: 2, status: 'AVAILABLE' }
    ] as any;

    // Voice selects second candidate
    await sendVoiceAudio('выбираю вторую');

    expect(dm.getActiveState(sessionUser)?.slots.selected_nanny).toBe('xyz-42');
    expect(resolverCalls).toBeGreaterThan(0);
  });

  test('TV-05: Voice confirmation triggers single execution dispatch', async () => {
    const sc = getScenario();

    // Fill required slots
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'date', slotValue: 'завтра' } }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'start_time', slotValue: '15:00' } }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'end_time', slotValue: '20:00' } }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'children_count', slotValue: 2 } }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'children_ages', slotValue: '5 лет' } }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'location', slotValue: 'Центр' } }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'requirements', slotValue: 'без особых требований' } }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'selected_nanny', slotValue: 'xyz-42' } }, sessionUser, sc);

    // Voice confirms
    const res = await sendVoiceAudio('да, подтверждаю');

    expect(res.status).toBe('ORDER_CONFIRMED');
    expect(dispatcherCalls).toBe(1);
    expect(dm.getExecutionLogs(sessionUser).length).toBe(1);
  });

  test('TV-06: Voice cancellation', async () => {
    const sc = getScenario();
    await adapter.handleMessage({ channel: 'text', raw_input: 'нужна няня' }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)).toBeDefined();

    // Voice cancels
    const res = await sendVoiceAudio('отменяю');

    expect(res.status).toBe('CANCELLED');
    expect(dm.getActiveState(sessionUser)).toBeUndefined();
  });

  test('TV-07: STT failure keeps context intact and allows continuation', async () => {
    const sc = getScenario();
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'date', slotValue: 'сегодня' } }, sessionUser, sc);

    // Mock STT Failure
    mockSTT.setFailure(new Error('STT_UNAVAILABLE'));

    const transportRes = await voiceTransport.processVoiceMessage({
      fileBuffer: fakeAudioBuffer
    });

    expect(transportRes.status).toBe('TRANSPORT_ERROR');
    expect(transportRes.error).toBe('STT_UNAVAILABLE');

    // DialogueContext must NOT be destroyed
    const ctx = dm.getActiveState(sessionUser);
    expect(ctx).toBeDefined();
    expect(ctx?.slots.date).toBe('сегодня');
    expect(dispatcherCalls).toBe(0);

    // Can continue seamlessly with Button or Text
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'start_time', slotValue: '15:00' } }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.start_time).toBe('15:00');
  });

  test('TV-08: Empty transcript leaves state untouched', async () => {
    const sc = getScenario();
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'date', slotValue: 'сегодня' } }, sessionUser, sc);

    // Mock empty transcript
    mockSTT.setTranscript('   ');

    const transportRes = await voiceTransport.processVoiceMessage({
      fileBuffer: fakeAudioBuffer
    });

    expect(transportRes.status).toBe('IGNORED_EMPTY_TRANSCRIPT');

    // Context remains identical
    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.date).toBe('сегодня');
    expect(dispatcherCalls).toBe(0);
  });

  // Architectural Static Checks
  test('AT-01: TelegramVoiceTransport does NOT import DialogueStateManager, VoiceChannel, ScenarioDefinition, DomainNannyService', () => {
    const transportPath = path.resolve(__dirname, '../../../src/platform/telegram-voice-transport.ts');
    const content = fs.readFileSync(transportPath, 'utf8');

    expect(content).not.toContain('DialogueStateManager');
    expect(content).not.toContain('VoiceChannel');
    expect(content).not.toContain('ScenarioDefinition');
    expect(content).not.toContain('DomainNannyService');
  });

  test('AT-02: STT provider contains no domain business logic (nanny, order, confirmation, candidate)', () => {
    const sttPath = path.resolve(__dirname, '../../../src/platform/stt-provider.ts');
    const content = fs.readFileSync(sttPath, 'utf8');

    expect(content.toLowerCase()).not.toContain('nanny');
    expect(content.toLowerCase()).not.toContain('order');
    expect(content.toLowerCase()).not.toContain('confirmation');
    expect(content.toLowerCase()).not.toContain('candidate');
  });

  test('AT-03: TelegramDialogueAdapter does NOT contain direct STT calls', () => {
    const adapterPath = path.resolve(__dirname, '../../../src/platform/telegram-dialogue-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf8');

    expect(content).not.toContain('sttProvider');
    expect(content).not.toContain('SpeechToTextProvider');
    expect(content).not.toContain('transcribe(');
  });

  test('AT-04: Voice execution uses the exact same DialogueStateManager and ActionDispatcher as Button/Text', async () => {
    const sc = getScenario();

    // Unified dispatch listener
    let dispatchedEvents: string[] = [];
    const sharedDM = new DialogueStateManager({
      actionDispatcher: async (event, ctx, exec) => {
        dispatchedEvents.push(event.type);
        return { status: 'SUCCEEDED', executionId: exec.executionId, attempt: exec.attempt };
      }
    });
    const sharedVC = new VoiceChannel(sharedDM);
    sharedVC.registerScenarioSet(nannyScenarioSet);
    const sharedAdapter = new TelegramDialogueAdapter(sharedDM, sharedVC);

    // Fill slots & confirm via voice
    const u = { ownerId: 'u-at4', sessionId: 's-at4' };
    await sharedAdapter.handleMessage({ channel: 'text', raw_input: 'завтра с трех до восьми на двух детей' }, u, sc);
    await sharedAdapter.handleMessage({ channel: 'button', button_payload: { slotName: 'children_ages', slotValue: '5 лет' } }, u, sc);
    await sharedAdapter.handleMessage({ channel: 'button', button_payload: { slotName: 'location', slotValue: 'Центр' } }, u, sc);
    await sharedAdapter.handleMessage({ channel: 'button', button_payload: { slotName: 'requirements', slotValue: 'без требований' } }, u, sc);
    await sharedAdapter.handleMessage({ channel: 'button', button_payload: { slotName: 'selected_nanny', slotValue: 'nanny-1' } }, u, sc);

    // Voice confirms
    await sharedAdapter.handleMessage({ channel: 'voice', transcript: 'подтверждаю' }, u, sc);

    expect(dispatchedEvents.length).toBe(1);
    expect(dispatchedEvents[0]).toBe('nanny.order.confirmed');
  });

});
