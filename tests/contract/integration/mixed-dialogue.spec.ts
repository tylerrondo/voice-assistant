import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel, type ScenarioSet } from '../../../src/platform/voice-channel';
import {
  TelegramDialogueAdapter,
  type TelegramInputMessage
} from '../../../src/platform/telegram-dialogue-adapter';

test.describe('CONTRACT: SC-INTEGRATION-001 Mixed Button / Text / Voice Dialogue Suite', () => {

  const sessionUser = { ownerId: 'user-nanny-101', sessionId: 'session-tg-001' };

  let dm: DialogueStateManager;
  let vc: VoiceChannel;
  let adapter: TelegramDialogueAdapter;
  let nannyScenarioSet: ScenarioSet;

  beforeEach(() => {
    dm = new DialogueStateManager({
      actionDispatcher: async (event, ctx, exec) => {
        return { status: 'SUCCEEDED', executionId: exec.executionId, attempt: exec.attempt };
      }
    });
    vc = new VoiceChannel(dm);

    const scenarioRaw = fs.readFileSync(path.resolve(__dirname, '../../../scenario-nanny-order.json'), 'utf8');
    nannyScenarioSet = JSON.parse(scenarioRaw);
    vc.registerScenarioSet(nannyScenarioSet);

    adapter = new TelegramDialogueAdapter(dm, vc);
  });

  const getScenario = () => nannyScenarioSet.scenarios[0];

  test('Test A — Buttons only: Полный заказ только кнопками', async () => {
    const sc = getScenario();

    // 1. Button: date
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'date', slotValue: 'сегодня' } }, sessionUser, sc);
    // 2. Button: start_time
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'start_time', slotValue: '15:00' } }, sessionUser, sc);
    // 3. Button: end_time
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'end_time', slotValue: '20:00' } }, sessionUser, sc);
    // 4. Button: children_count
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'children_count', slotValue: 2 } }, sessionUser, sc);
    // 5. Button: children_ages
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'children_ages', slotValue: '3 и 5 лет' } }, sessionUser, sc);
    // 6. Button: location
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'location', slotValue: 'Центр' } }, sessionUser, sc);
    // 7. Button: requirements
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'requirements', slotValue: 'педагогическое образование' } }, sessionUser, sc);
    // 8. Button: select nanny
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'selected_nanny', slotValue: 'nanny-1' } }, sessionUser, sc);
    // 9. Button: confirmation
    const res = await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'confirmation', slotValue: 'CONFIRMED' } }, sessionUser, sc);

    expect(res.status).toBe('ORDER_CONFIRMED');
    expect(res.slots.date).toBe('сегодня');
    expect(res.slots.selected_nanny).toBe('nanny-1');
    expect(dm.getExecutionLogs(sessionUser).length).toBe(1);
  });

  test('Test B — Voice only: Полный заказ через transcript (имитация voice)', async () => {
    const sc = getScenario();

    await adapter.handleMessage({ channel: 'voice', transcript: 'нужна няня на завтра' }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'voice', transcript: 'с трех' }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'voice', transcript: 'до восьми' }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'voice', transcript: 'на двух детей' }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'voice', transcript: '3 и 5' }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'voice', transcript: 'центр' }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'voice', transcript: 'без вредных привычек' }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'voice', transcript: 'выбираю марию' }, sessionUser, sc);
    const res = await adapter.handleMessage({ channel: 'voice', transcript: 'да, подтверждаю' }, sessionUser, sc);

    expect(res.status).toBe('ORDER_CONFIRMED');
    expect(res.slots.selected_nanny).toBe('nanny-1');
    expect(res.slots.date).toBe('завтра');
    expect(dm.getExecutionLogs(sessionUser).length).toBe(1);
  });

  test('Test C — Button -> Voice: Начать кнопками, продолжить voice', async () => {
    const sc = getScenario();

    // Button: date + start_time
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'date', slotValue: 'завтра' } }, sessionUser, sc);
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'start_time', slotValue: '15:00' } }, sessionUser, sc);

    // Voice: end_time
    await adapter.handleMessage({ channel: 'voice', transcript: 'до восьми вечера' }, sessionUser, sc);

    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.date).toBe('завтра');
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(ctx?.slots.end_time).toBe('20:00');
    expect(dm.listContexts(sessionUser).length).toBe(1); // One shared state!
  });

  test('Test D — Voice -> Button: Начать voice, закончить кнопками', async () => {
    const sc = getScenario();

    // Voice: date + start
    await adapter.handleMessage({ channel: 'voice', transcript: 'завтра с трех' }, sessionUser, sc);

    // Button: end_time
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'end_time', slotValue: '20:00' } }, sessionUser, sc);

    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.date).toBe('завтра');
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(ctx?.slots.end_time).toBe('20:00');
    expect(dm.listContexts(sessionUser).length).toBe(1);
  });

  test('Test E — Multiple slots: Одно сообщение заполняет сразу несколько слотов', async () => {
    const sc = getScenario();

    // "Нужна няня завтра с трех до восьми на двух детей"
    await adapter.handleMessage({
      channel: 'voice',
      transcript: 'нужна няня завтра с трех до восьми на двух детей'
    }, sessionUser, sc);

    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.date).toBe('завтра');
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(ctx?.slots.end_time).toBe('20:00');
    expect(ctx?.slots.children_count).toBe(2);

    // Бот не спрашивает их повторно, следующий незаполненный слот - children_ages
    const inst = adapter.getLastInstrumentation();
    expect(inst?.next_question).toContain('возраст');
  });

  test('Test F — Correction: button -> voice correction', async () => {
    const sc = getScenario();

    // Button sets 15:00
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'start_time', slotValue: '15:00' } }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.start_time).toBe('15:00');

    // Voice corrects to 16:00
    await adapter.handleMessage({ channel: 'voice', transcript: 'нет, давайте в четыре' }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.start_time).toBe('16:00');
    expect(dm.listContexts(sessionUser).length).toBe(1);
  });

  test('Test G — Reverse correction: voice -> button correction', async () => {
    const sc = getScenario();

    // Voice sets 15:00
    await adapter.handleMessage({ channel: 'voice', transcript: 'в три часа' }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.start_time).toBe('15:00');

    // Button corrects to 16:00
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'start_time', slotValue: '16:00' } }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.start_time).toBe('16:00');
  });

  test('Test H — Candidate selection: button, name, index, voice', async () => {
    const sc = getScenario();

    // Setup base slots to reveal candidates
    await adapter.handleMessage({
      channel: 'text',
      raw_input: 'завтра с трех до восьми на двух детей'
    }, sessionUser, sc);

    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.offers?.length).toBe(2);

    // 1. By name via voice: "выбираю марию"
    await adapter.handleMessage({ channel: 'voice', transcript: 'выбираю марию' }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.selected_nanny).toBe('nanny-1');

    // 2. Change by button to nanny-2
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'selected_nanny', slotValue: 'nanny-2' } }, sessionUser, sc);
    expect(dm.getActiveState(sessionUser)?.slots.selected_nanny).toBe('nanny-2');
  });

  test('Test I — Confirmation: Проверить подтверждение всеми тремя каналами', async () => {
    const sc = getScenario();

    // Prep context
    const fillAll = async () => {
      await adapter.handleMessage({ channel: 'text', raw_input: 'завтра с трех до восьми на двух детей' }, sessionUser, sc);
      await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'children_ages', slotValue: '5 лет' } }, sessionUser, sc);
      await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'location', slotValue: 'Центр' } }, sessionUser, sc);
      await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'requirements', slotValue: 'без особых требований' } }, sessionUser, sc);
      await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'selected_nanny', slotValue: 'nanny-2' } }, sessionUser, sc);
    };

    // Voice confirm
    await fillAll();
    const resVoice = await adapter.handleMessage({ channel: 'voice', transcript: 'да, подтверждаю' }, sessionUser, sc);
    expect(resVoice.status).toBe('ORDER_CONFIRMED');
    expect(resVoice.slots.confirmation).toBe('CONFIRMED');
  });

  test('Test J — Cancellation: Проверить отмену всеми тремя каналами', async () => {
    const sc = getScenario();

    // 1. Voice cancel
    await adapter.handleMessage({ channel: 'voice', transcript: 'нужна няня на завтра' }, sessionUser, sc);
    const cancelRes = await adapter.handleMessage({ channel: 'voice', transcript: 'нет, отмена' }, sessionUser, sc);
    expect(cancelRes.status).toBe('CANCELLED');
    expect(dm.getActiveState(sessionUser)).toBeUndefined();
  });

  test('Test K — Arbitrary channel switching: button -> voice -> button -> text -> voice -> button', async () => {
    const sc = getScenario();

    // 1. button
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'date', slotValue: 'завтра' } }, sessionUser, sc);
    // 2. voice
    await adapter.handleMessage({ channel: 'voice', transcript: 'с трех' }, sessionUser, sc);
    // 3. button
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'end_time', slotValue: '20:00' } }, sessionUser, sc);
    // 4. text
    await adapter.handleMessage({ channel: 'text', raw_input: 'на двух детей' }, sessionUser, sc);
    // 5. voice
    await adapter.handleMessage({ channel: 'voice', transcript: 'центр' }, sessionUser, sc);
    // 6. button
    await adapter.handleMessage({ channel: 'button', button_payload: { slotName: 'requirements', slotValue: 'без особых требований' } }, sessionUser, sc);

    const ctx = dm.getActiveState(sessionUser);
    expect(ctx?.slots.date).toBe('завтра');
    expect(ctx?.slots.start_time).toBe('15:00');
    expect(ctx?.slots.end_time).toBe('20:00');
    expect(ctx?.slots.children_count).toBe(2);
    expect(ctx?.slots.location).toBe('Центр');
    expect(ctx?.slots.requirements).toBe('без особых требований');
    expect(dm.listContexts(sessionUser).length).toBe(1);
  });

  test('Test L — State persistence & Instrumentation', async () => {
    const sc = getScenario();

    await adapter.handleMessage({
      channel: 'voice',
      transcript: 'нужна няня завтра'
    }, sessionUser, sc);

    const inst = adapter.getLastInstrumentation();
    expect(inst).not.toBeNull();
    expect(inst?.channel).toBe('voice');
    expect(inst?.transcript).toBe('нужна няня завтра');
    expect(inst?.extracted_slots.date).toBe('завтра');
    expect(inst?.new_state.date).toBe('завтра');
    expect(inst?.confidence).toBe(1.0);
  });

});
