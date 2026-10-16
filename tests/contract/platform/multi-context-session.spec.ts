import { test, expect } from '@playwright/test';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';

test.describe('CONTRACT: PLATFORM-010 Multi-Context Session Manager Suite', () => {

  const identity = { ownerId: 'platform-010-owner', sessionId: 'platform-010-session' };

  test('CONTRACT-01: Context has system-generated unique contextId', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);

    expect(typeof ctxA.contextId).toBe('string');
    expect(typeof ctxB.contextId).toBe('string');
    expect(ctxA.contextId).not.toBe(ctxB.contextId);
  });

  test('CONTRACT-02: Creation of second context preserves first context in WAITING_FOR_SLOT', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);

    expect(dm.getContext(ctxA.contextId, identity)?.status).toBe('WAITING_FOR_SLOT');
    expect(dm.getContext(ctxB.contextId, identity)?.status).toBe('WAITING_FOR_SLOT');
    expect(dm.listContexts(identity).length).toBe(2);
  });

  test('CONTRACT-03: Context switching preserves slots across independent contexts', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);

    dm.activateContext(ctxA.contextId, identity);
    expect(dm.getActiveState(identity)?.slots.orderId).toBe(1001);

    dm.activateContext(ctxB.contextId, identity);
    expect(dm.getActiveState(identity)?.slots.orderId).toBe(1002);
  });

  test('CONTRACT-04: Cancellation addresses strictly selected context', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);

    await dm.cancelContext(ctxA.contextId, identity);
    expect(dm.getContext(ctxA.contextId, identity)?.status).toBe('CANCELLED');
    expect(dm.getContext(ctxB.contextId, identity)?.status).toBe('WAITING_FOR_SLOT');
  });

  test('CONTRACT-05: Expiration addresses strictly selected context', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);

    await dm.expireContext(ctxA.contextId, identity);
    expect(dm.getContext(ctxA.contextId, identity)?.status).toBe('EXPIRED');
    expect(dm.getContext(ctxB.contextId, identity)?.status).toBe('WAITING_FOR_SLOT');
  });

  test('CONTRACT-06: Execution log contains contextId and strict actionType without fallback', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    await dm.fillSlot('payment', 'card', ctxA.contextId, identity);
    const completedA = dm.getContext(ctxA.contextId, identity)!;
    const executionA = dm.createExecution(completedA, identity);
    await dm.dispatchAction(executionA.executionId, completedA.slots, identity);

    const logs = dm.getExecutionLogs(identity);
    expect(logs.length).toBe(1);
    expect(logs[0].contextId).toBe(ctxA.contextId);
    expect(logs[0].event.type).toBe('driver.order.accepted', {}, identity);
    expect(logs[0].event.payload).toEqual({ orderId: 1001, payment: 'card' });
  });

  test('CONTRACT-07: Idempotency is context-aware and does not conflict between orders', async () => {
    const dm = new DialogueStateManager({ actionDispatcher: async (_event, _ctx, ex) => ({ status: 'SUCCEEDED', executionId: ex.executionId, attempt: ex.attempt }) });
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);

    await dm.fillSlot('payment', 'card', ctxA.contextId, identity);
    await dm.fillSlot('payment', 'card', ctxA.contextId, identity); // duplicate

    await dm.fillSlot('payment', 'cash', ctxB.contextId, identity);

    const completedA = dm.getContext(ctxA.contextId, identity)!;
    const executionA = dm.createExecution(completedA, identity);
    await dm.dispatchAction(executionA.executionId, completedA.slots, identity);
    await dm.dispatchAction(executionA.executionId, completedA.slots, identity);

    const completedB = dm.getContext(ctxB.contextId, identity)!;
    const executionB = dm.createExecution(completedB, identity);
    await dm.dispatchAction(executionB.executionId, completedB.slots, identity);

    const logs = dm.getExecutionLogs(identity);
    const matchA = logs.filter(l => l.contextId === ctxA.contextId);
    const matchB = logs.filter(l => l.contextId === ctxB.contextId);

    expect(matchA.length).toBe(1);
    expect(matchB.length).toBe(1);
  });

  test('CONTRACT-08: Runtime capacity policy rejects new context when maxActiveContexts is reached', async () => {
    const dm = new DialogueStateManager({ maxActiveContexts: 2 });
    dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);

    expect(() => {
      dm.createContext('ACCEPT_ORDER', { orderId: 1003 }, ['orderId', 'payment'], 'driver.order.accepted', {}, identity);
    }).toThrow(/REJECT_NEW_CONTEXT/);
  });

});
