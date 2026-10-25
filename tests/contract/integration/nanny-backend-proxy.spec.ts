import { test, expect } from '@playwright/test';
import { createNannyBackendProxyHandler } from '../../../src/platform/nanny-backend-proxy';
import type { ActionExecution, DialogueContext } from '../../../src/platform/dialogue-manager';

const session = { ownerId: 'owner-1', sessionId: 'session-1' };
const context = {
  contextId: 'ctx-1', version: 1, ownerId: session.ownerId, sessionId: session.sessionId,
  intent: 'ORDER_NANNY', slots: {}, missingSlots: [], status: 'DISPATCHING',
  createdAt: 1, updatedAt: 1, expiresAt: 10000, actionType: 'nanny.order.confirmed',
  scenarioId: 'order-nanny',
} as DialogueContext;
const execution = {
  executionId: 'exec-1', idempotencyKey: 'stable-key-1', ownerId: session.ownerId,
  sessionId: session.sessionId, contextId: context.contextId, scenarioId: 'order-nanny',
  intent: 'ORDER_NANNY', actionType: 'nanny.order.confirmed',
  payload: {
    date: '2026-10-26', start_time: '15:00', end_time: '20:00', children_count: 1,
    location: 'Agadir', selected_nanny: 'candidate-1', confirmation: 'CONFIRMED',
  },
  status: 'DISPATCHING', attempt: 1, createdAt: 1, updatedAt: 1,
} as ActionExecution;
const body = { event: { type: 'nanny.order.confirmed', payload: execution.payload }, context, execution };

const dependencies = (
  fetchImpl: typeof fetch,
  authenticate: (request: Request) => Promise<{ ownerId: string; sessionId: string } | null> = async () => session,
) => ({
  authenticate,
  resolveCustomerIdentity: async () => ({ chatId: 'real-customer-1' }),
  resolveBookingLocation: async () => ({
    latitude: 30.4278, longitude: -9.5981, timeZone: 'Africa/Casablanca',
    when: new Date('2026-10-26T14:00:00.000Z'),
  }),
  resolveSelectedNanny: async () => 'backend-nanny-17',
  backend: {
    baseUrl: 'https://children.example.test/api/v1',
    session: { token: 'server-only-token', u_hash: 'server-only-hash' },
    fetchImpl,
  },
});

test.describe('nanny backend server proxy', () => {
  test('rejects unauthenticated requests before resolving or calling backend', async () => {
    let calls = 0;
    const handler = createNannyBackendProxyHandler(dependencies(async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }, async () => null));
    const response = await handler(new Request('https://app.example.test/api/nanny/dispatch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(response.status).toBe(401);
    expect(calls).toBe(0);
  });

  test('rejects an execution belonging to a different authenticated session', async () => {
    const handler = createNannyBackendProxyHandler(dependencies(async () => {
      throw new Error('backend must not be called');
    }, async () => ({ ownerId: 'someone-else', sessionId: 'other-session' })));
    const response = await handler(new Request('https://app.example.test/api/nanny/dispatch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('SESSION_IDENTITY_MISMATCH');
  });

  test('dispatches through server-held credentials and returns the backend result', async () => {
    const requests: Array<{ url: string; body: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), body: String(init?.body) });
      const data = String(input).includes('nanny_pricing')
        ? { status: 'success', data: { b_id: 731, duplicate: false } }
        : { status: 'success' };
      return new Response(JSON.stringify(data), { status: 200 });
    };
    const handler = createNannyBackendProxyHandler(dependencies(fetchImpl));
    const response = await handler(new Request('https://app.example.test/api/nanny/dispatch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('SUCCEEDED');
    expect(requests).toHaveLength(2);
    const createForm = new URLSearchParams(requests[0].body);
    expect(createForm.get('token')).toBe('server-only-token');
    expect(createForm.get('chatId')).toBe('real-customer-1');
    expect(new URLSearchParams(requests[1].body).get('u_id')).toBe('backend-nanny-17');
  });
});
