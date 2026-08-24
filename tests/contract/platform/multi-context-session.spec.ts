import { test, expect } from '@playwright/test';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';

test.describe('CONTRACT: PLATFORM-010 Multi-Context Session Manager Suite', () => {

  test('CONTRACT-01: Context has system-generated unique contextId', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    expect(typeof ctxA.contextId).toBe('string');
    expect(typeof ctxB.contextId).toBe('string');
    expect(ctxA.contextId).not.toBe(ctxB.contextId);
  });

  test('CONTRACT-02: Creation of second context preserves first context in WAITING_FOR_SLOT', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    expect(dm.getContext(ctxA.contextId)?.status).toBe('WAITING_FOR_SLOT');
    expect(dm.getContext(ctxB.contextId)?.status).toBe('WAITING_FOR_SLOT');
    expect(dm.listContexts().length).toBe(2);
  });

  test('CONTRACT-03: Context switching preserves slots across independent contexts', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    dm.activateContext(ctxA.contextId);
    expect(dm.getActiveState()?.slots.orderId).toBe(1001);

    dm.activateContext(ctxB.contextId);
    expect(dm.getActiveState()?.slots.orderId).toBe(1002);
  });

  test('CONTRACT-04: Cancellation addresses strictly selected context', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    dm.cancelContext(ctxA.contextId);
    expect(dm.getContext(ctxA.contextId)?.status).toBe('CANCELLED');
    expect(dm.getContext(ctxB.contextId)?.status).toBe('WAITING_FOR_SLOT');
  });

  test('CONTRACT-05: Expiration addresses strictly selected context', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    dm.expireContext(ctxA.contextId);
    expect(dm.getContext(ctxA.contextId)?.status).toBe('EXPIRED');
    expect(dm.getContext(ctxB.contextId)?.status).toBe('WAITING_FOR_SLOT');
  });

  test('CONTRACT-06: Execution log contains contextId and strict actionType without fallback', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    dm.fillSlot('payment', 'card', ctxA.contextId);

    const logs = dm.getExecutionLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].contextId).toBe(ctxA.contextId);
    expect(logs[0].event.type).toBe('driver.order.accepted');
    expect(logs[0].event.payload).toEqual({ orderId: 1001, payment: 'card' });
  });

  test('CONTRACT-07: Idempotency is context-aware and does not conflict between orders', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    dm.fillSlot('payment', 'card', ctxA.contextId);
    dm.fillSlot('payment', 'card', ctxA.contextId); // duplicate

    dm.fillSlot('payment', 'cash', ctxB.contextId);

    const logs = dm.getExecutionLogs();
    const matchA = logs.filter(l => l.contextId === ctxA.contextId);
    const matchB = logs.filter(l => l.contextId === ctxB.contextId);

    expect(matchA.length).toBe(1);
    expect(matchB.length).toBe(1);
  });

  test('CONTRACT-08: Runtime capacity policy rejects new context when maxActiveContexts is reached', async () => {
    const dm = new DialogueStateManager({ maxActiveContexts: 2 });
    dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    expect(() => {
      dm.createContext('ACCEPT_ORDER', { orderId: 1003 }, ['orderId', 'payment'], 'driver.order.accepted');
    }).toThrow(/REJECT_NEW_CONTEXT/);
  });

});
