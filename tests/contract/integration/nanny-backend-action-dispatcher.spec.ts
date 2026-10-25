import { test, expect } from '@playwright/test';
import { createNannyBackendActionDispatcher } from '../../../src/platform/nanny-backend-action-dispatcher';
import type { ActionExecution, DialogueContext } from '../../../src/platform/dialogue-manager';

const context = {
  contextId: 'ctx-nanny-1',
  version: 1,
  ownerId: 'customer-1',
  sessionId: 'session-1',
  intent: 'ORDER_NANNY',
  slots: {},
  missingSlots: [],
  status: 'DISPATCHING',
  createdAt: 1,
  updatedAt: 1,
  expiresAt: 100000,
  actionType: 'nanny.order.confirmed',
  scenarioId: 'order-nanny',
} as DialogueContext;

const execution = (overrides: Partial<ActionExecution> = {}): ActionExecution => ({
  executionId: 'exec-nanny-1',
  idempotencyKey: 'idemp_ctx-nanny-1_exec-nanny-1_nanny.order.confirmed',
  ownerId: 'customer-1',
  sessionId: 'session-1',
  contextId: 'ctx-nanny-1',
  scenarioId: 'order-nanny',
  intent: 'ORDER_NANNY',
  actionType: 'nanny.order.confirmed',
  payload: {
    date: '2026-10-26',
    start_time: '15:00',
    end_time: '20:00',
    children_count: 2,
    children_ages: '3 и 5 лет',
    location: 'Центр',
    requirements: 'без особых требований',
    selected_nanny: 'nanny-93',
    confirmation: 'CONFIRMED',
  },
  status: 'DISPATCHING',
  attempt: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const config = (fetchImpl: typeof fetch) => ({
  baseUrl: 'https://example.test/taxi_dev2/c/children/api/v1/',
  session: { token: 'test-token', u_hash: 'test-hash' },
  customerIdentity: { chatId: 'customer-chat-1' },
  resolveBookingLocation: async () => ({
    latitude: 30.4,
    longitude: -9.6,
    timeZone: 'Africa/Casablanca',
    when: new Date('2026-10-26T14:00:00.000Z'),
  }),
  fetchImpl,
});

test.describe('Nanny backend ActionDispatcher adapter', () => {
  test('sends confirmed booking to the existing nanny_pricing create contract with stable idempotency key', async () => {
    let requestUrl = '';
    let requestBody = '';
    const fetchImpl: typeof fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ status: 'success', data: { b_id: 731, duplicate: false } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const dispatcher = createNannyBackendActionDispatcher(config(fetchImpl));
    const exec = execution();
    const result = await dispatcher(
      { type: 'nanny.order.confirmed', payload: exec.payload },
      context,
      exec,
    );

    expect(result).toEqual({ status: 'SUCCEEDED', executionId: exec.executionId, attempt: 1 });
    expect(requestUrl).toBe('https://example.test/taxi_dev2/c/children/api/v1/script/template/nanny_pricing');
    const form = new URLSearchParams(requestBody);
    expect(form.get('token')).toBe('test-token');
    expect(form.get('u_hash')).toBe('test-hash');
    expect(form.get('chatId')).toBe('customer-chat-1');
    expect(form.get('u_a_role')).toBe('1');

    const templateData = JSON.parse(form.get('s_t_data') || '{}');
    expect(templateData.action).toBe('create');
    expect(templateData.request_key).toBe(exec.idempotencyKey);
    expect(templateData.time_zone).toBe('Africa/Casablanca');
    expect(templateData.order.b_start_latitude).toBe('30.4');
    expect(templateData.order.b_start_longitude).toBe('-9.6');
    expect(templateData.order.b_passengers_count).toBe(2);
    expect(templateData.order.b_options.childrenProfiles).toBe('2');
    expect(templateData.order.b_options.childrenAges).toBe('3 и 5 лет');
    expect(templateData.order.b_options.requirements).toBe('без особых требований');
  });

  test('returns UNKNOWN on transport failure because the server may have committed the order', async () => {
    const fetchImpl: typeof fetch = async () => { throw new Error('network down'); };
    const dispatcher = createNannyBackendActionDispatcher(config(fetchImpl));
    const exec = execution();

    const result = await dispatcher({ type: 'nanny.order.confirmed', payload: exec.payload }, context, exec);
    expect(result).toEqual({
      status: 'UNKNOWN',
      executionId: exec.executionId,
      attempt: exec.attempt,
      errorCode: 'NETWORK_ERROR',
    });
  });

  test('does not call the backend for invalid booking data or unsupported events', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: 'success', data: { b_id: 731 } }), { status: 200 });
    };
    const dispatcher = createNannyBackendActionDispatcher(config(fetchImpl));
    const invalid = execution({ payload: { ...execution().payload, children_count: 0 } });

    const invalidResult = await dispatcher({ type: 'nanny.order.confirmed', payload: invalid.payload }, context, invalid);
    const unsupportedResult = await dispatcher({ type: 'driver.order.accepted', payload: { orderId: 731 } }, context, execution());

    expect(invalidResult.status).toBe('FAILED');
    expect(unsupportedResult.status).toBe('FAILED');
    expect(calls).toBe(0);
  });
});
