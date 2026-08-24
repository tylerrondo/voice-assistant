import { test, expect } from '@playwright/test';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';

test.describe('CONTRACT: PLATFORM-011 Ambiguous Input Policy Suite', () => {

  test('CONTRACT-01: Single candidate returns RESOLVED', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');

    const result = dm.resolveRouting('картой', ['payment']);
    expect(result.status).toBe('RESOLVED');
    if (result.status === 'RESOLVED') {
      expect(result.contextId).toBe(ctxA.contextId);
    }
  });

  test('CONTRACT-02: Two candidate contexts return AMBIGUOUS_CONTEXT', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    const result = dm.resolveRouting('картой', ['payment']);
    expect(result.status).toBe('AMBIGUOUS_CONTEXT');
    if (result.status === 'AMBIGUOUS_CONTEXT') {
      expect(result.candidateContextIds).toContain(ctxA.contextId);
      expect(result.candidateContextIds).toContain(ctxB.contextId);
      expect(result.candidateContextIds.length).toBe(2);
    }
  });

  test('CONTRACT-03: Explicit entity resolves to exact matching Context', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    const result = dm.resolveRouting('заказ 1002 картой', ['payment']);
    expect(result.status).toBe('RESOLVED');
    if (result.status === 'RESOLVED') {
      expect(result.contextId).toBe(ctxB.contextId);
    }
  });

  test('CONTRACT-04: Ambiguity produces zero execution in DialogueStateManager', async () => {
    const dm = new DialogueStateManager();
    dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    const result = dm.resolveRouting('картой', ['payment']);
    expect(result.status).toBe('AMBIGUOUS_CONTEXT');
    expect(dm.getExecutionLogs().length).toBe(0);
  });

  test('CONTRACT-05: Cancelled or Completed context is excluded from candidates', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    dm.cancelContext(ctxA.contextId);

    const result = dm.resolveRouting('картой', ['payment']);
    expect(result.status).toBe('RESOLVED');
    if (result.status === 'RESOLVED') {
      expect(result.contextId).toBe(ctxB.contextId);
    }
  });

  test('CONTRACT-06: No candidates matching slot returns NO_MATCH', async () => {
    const dm = new DialogueStateManager();
    dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');

    const result = dm.resolveRouting('неизвестный слот', ['address']);
    expect(result.status).toBe('NO_MATCH');
    expect(dm.getExecutionLogs().length).toBe(0);
  });

  test('CONTRACT-07: Explicit entity resolution after ambiguity switches target context', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    const r1 = dm.resolveRouting('картой', ['payment']);
    expect(r1.status).toBe('AMBIGUOUS_CONTEXT');

    const r2 = dm.resolveRouting('заказ 1002', []);
    expect(r2.status).toBe('RESOLVED');
    if (r2.status === 'RESOLVED') {
      expect(r2.contextId).toBe(ctxB.contextId);
    }
  });

  test('CONTRACT-08: ActiveContext is NOT used as silent fallback when multiple candidates exist', async () => {
    const dm = new DialogueStateManager();
    const ctxA = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId', 'payment'], 'driver.order.accepted');
    const ctxB = dm.createContext('ACCEPT_ORDER', { orderId: 1002 }, ['orderId', 'payment'], 'driver.order.accepted');

    dm.activateContext(ctxA.contextId);
    expect(dm.getActiveContextId()).toBe(ctxA.contextId);

    const result = dm.resolveRouting('картой', ['payment']);
    expect(result.status).toBe('AMBIGUOUS_CONTEXT');
  });

});
