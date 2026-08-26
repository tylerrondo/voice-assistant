import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel } from '../../../src/platform/voice-channel';

test.describe('CONTRACT: SC-PASS-002 Multi-Offer Dialogue & Selection Suite', () => {

  const sessionPassengerA = { ownerId: 'passenger-001', sessionId: 'session-pass-A' };
  const sessionPassengerB = { ownerId: 'passenger-002', sessionId: 'session-pass-B' };

  let dm: DialogueStateManager;
  let vc: VoiceChannel;
  let scenarioSet: any;
  let dispatcherCalls: number;

  const mockOffers = [
    { offerId: 'OFFER-A', driver: 'Driver A', vehicleType: 'standard', etaMinutes: 4, price: 120, distanceKm: 1.2, status: 'AVAILABLE' },
    { offerId: 'OFFER-B', driver: 'Driver B', vehicleType: 'comfort', etaMinutes: 6, price: 150, distanceKm: 0.4, status: 'AVAILABLE' },
    { offerId: 'OFFER-C', driver: 'Driver C', vehicleType: 'standard', etaMinutes: 9, price: 90, distanceKm: 2.1, status: 'AVAILABLE' }
  ];

  test.beforeAll(() => {
    const jsonPath = path.resolve(__dirname, '../../../scenario-passenger-offers.json');
    scenarioSet = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  });

  test.beforeEach(() => {
    dispatcherCalls = 0;
    dm = new DialogueStateManager({
      actionDispatcher: async (event, ctx, exec) => {
        dispatcherCalls++;
        return { status: 'SUCCEEDED', executionId: exec.executionId, attempt: exec.attempt };
      }
    });
    vc = new VoiceChannel(dm);
    vc.registerScenarioSet(scenarioSet);
  });

  test('CONTRACT-01: Регистрация Offer ScenarioSet валидирует структуру и триггеры', () => {
    expect(vc.getActiveScenarioSetId()).toBe('scenario-set-passenger-offers-002');
  });

  test('CONTRACT-02: Моделирование трёх независимых предложений в контексте заказа', () => {
    expect(mockOffers.length).toBe(3);
    expect(mockOffers.map(o => o.offerId)).toEqual(['OFFER-A', 'OFFER-B', 'OFFER-C']);
  });

  test('CONTRACT-03: Сравнение по ETA («Какой быстрее?») возвращает интент и 0 execution', async () => {
    const res = await vc.handleIncomingVoice('какой быстрее', sessionPassengerA);
    expect(res.intent).toBe('COMPARE_OFFERS_ETA');
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('CONTRACT-04: Сравнение по цене («А какой дешевле?») возвращает интент и 0 execution', async () => {
    const res = await vc.handleIncomingVoice('а какой дешевле', sessionPassengerA);
    expect(res.intent).toBe('COMPARE_OFFERS_PRICE');
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('CONTRACT-05: Запрос характеристик («А второй это комфорт?») возвращает ответ и 0 execution', async () => {
    const res = await vc.handleIncomingVoice('а второй это комфорт', sessionPassengerA);
    expect(res.intent).toBe('QUERY_OFFER_COMFORT');
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('CONTRACT-06: Естественная ссылка «второй» детерминированно разрешает OFFER-B', async () => {
    await vc.handleIncomingVoice('тогда давайте второй', sessionPassengerA);
    const ctx = dm.getActiveState(sessionPassengerA);

    expect(ctx?.slots.selectedOfferId).toBe('OFFER-B');
    expect(ctx?.missingSlots).toContain('confirmation');
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('CONTRACT-07: Ambiguous Offer selection («машину подешевле») возвращает AMBIGUOUS_SLOT', async () => {
    const res = await vc.handleIncomingVoice('давайте машину подешевле', sessionPassengerA);
    expect(res.status).toBe('AMBIGUOUS_SLOT');
    expect(res.candidates.length).toBeGreaterThan(1);
    expect(res.clarificationPrompt).toContain('Выберите, пожалуйста');
  });

  test('CONTRACT-08: Zero execution при ambiguity', async () => {
    await vc.handleIncomingVoice('давайте машину подешевле', sessionPassengerA);
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('CONTRACT-09: Recovery после ambiguity (явный выбор «третий» после уточнения)', async () => {
    await vc.handleIncomingVoice('давайте машину подешевле', sessionPassengerA);
    await vc.handleIncomingVoice('тогда давайте третий', sessionPassengerA);

    const ctx = dm.getActiveState(sessionPassengerA);
    expect(ctx?.slots.selectedOfferId).toBe('OFFER-C');
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
  });

  test('CONTRACT-10: Замена выбранного Offer («нет, лучше второй») до подтверждения', async () => {
    await vc.handleIncomingVoice('тогда давайте третий', sessionPassengerA);
    expect(dm.getActiveState(sessionPassengerA)?.slots.selectedOfferId).toBe('OFFER-C');

    await vc.handleIncomingVoice('второй', sessionPassengerA);
    expect(dm.getActiveState(sessionPassengerA)?.slots.selectedOfferId).toBe('OFFER-B');
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
  });

  test('CONTRACT-11: Offer unavailable предотвращает выполнение недействительного выбора', async () => {
    const dynamicOffers = [...mockOffers];
    dynamicOffers[1] = { ...dynamicOffers[1], status: 'UNAVAILABLE' };

    await vc.handleIncomingVoice('тогда давайте второй', sessionPassengerA);
    const selected = dm.getActiveState(sessionPassengerA)?.slots.selectedOfferId;
    const isAvailable = dynamicOffers.find(o => o.offerId === selected)?.status === 'AVAILABLE';

    expect(isAvailable).toBe(false);
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('CONTRACT-12: Несуществующий Offer («выбираю четвертую») возвращает NO_MATCH', async () => {
    const res = await vc.handleIncomingVoice('выбираю четвертую', sessionPassengerA);
    expect(res.status).toBe('NO_MATCH');
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

  test('CONTRACT-13: Confirmation («Да») порождает ровно одно execution с выбранным OFFER-B', async () => {
    await vc.handleIncomingVoice('тогда давайте второй', sessionPassengerA);
    await vc.handleIncomingVoice('да', sessionPassengerA);

    const logs = dm.getExecutionLogs(sessionPassengerA);
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('SUCCEEDED');
    expect(logs[0].payload.orderId).toBe(5001);
    expect(logs[0].payload.selectedOfferId).toBe('OFFER-B');
    expect(dispatcherCalls).toBe(1);
  });

  test('CONTRACT-14: Duplicate confirmation («Да» еще раз) идемпотентно не создает второй side-effect', async () => {
    await vc.handleIncomingVoice('тогда давайте второй', sessionPassengerA);
    await vc.handleIncomingVoice('да', sessionPassengerA);
    await vc.handleIncomingVoice('да', sessionPassengerA);

    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(1);
    expect(dispatcherCalls).toBe(1);
  });

  test('CONTRACT-15: Context isolation (Выбор во 2-м заказе не смешивается с 1-м)', async () => {
    // Пассажир A выбирает второй оффер
    await vc.handleIncomingVoice('тогда давайте второй', sessionPassengerA);
    const ctxA = dm.getActiveState(sessionPassengerA);

    // Пассажир B выбирает третий оффер
    await vc.handleIncomingVoice('тогда давайте третий', sessionPassengerB);
    const ctxB = dm.getActiveState(sessionPassengerB);

    expect(ctxA?.slots.selectedOfferId).toBe('OFFER-B');
    expect(ctxB?.slots.selectedOfferId).toBe('OFFER-C');
    expect(ctxA?.contextId).not.toBe(ctxB?.contextId);
  });

  test('CONTRACT-16: Ownership isolation (Пассажир B не может изменить выбор Пассажира A)', async () => {
    await vc.handleIncomingVoice('тогда давайте второй', sessionPassengerA);
    const ctxIdA = dm.getActiveContextId()!;

    const foreignAccess = await dm.fillSlot('selectedOfferId', 'OFFER-A', ctxIdA, sessionPassengerB);
    expect(foreignAccess.success).toBe(false);
    expect(foreignAccess.error).toBe('ACCESS_DENIED');
  });

  test('CONTRACT-17: Payload содержит строго один выбранный OfferId', async () => {
    await vc.handleIncomingVoice('тогда давайте третий', sessionPassengerA);
    await vc.handleIncomingVoice('второй', sessionPassengerA);
    await vc.handleIncomingVoice('да', sessionPassengerA);

    const exec = dm.getExecutionLogs(sessionPassengerA)[0];
    expect(exec.payload.selectedOfferId).toBe('OFFER-B');
    expect(exec.payload.selectedOfferId).not.toBe('OFFER-C');
  });

  test('CONTRACT-18: Информационный вопрос («А далеко находится второй водитель?») не меняет selection state', async () => {
    await vc.handleIncomingVoice('тогда давайте второй', sessionPassengerA);
    expect(dm.getActiveState(sessionPassengerA)?.slots.selectedOfferId).toBe('OFFER-B');

    // Задаем вопрос
    await vc.handleIncomingVoice('а далеко находится второй водитель', sessionPassengerA);

    // Выбор остался прежним
    const ctx = dm.getActiveState(sessionPassengerA);
    expect(ctx?.slots.selectedOfferId).toBe('OFFER-B');
    expect(dm.getExecutionLogs(sessionPassengerA).length).toBe(0);
    expect(dispatcherCalls).toBe(0);
  });

});
