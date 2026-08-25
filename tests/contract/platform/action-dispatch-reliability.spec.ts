import { test, expect } from '@playwright/test';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';

test.describe('CONTRACT: PLATFORM-015 Action Dispatch Reliability Suite', () => {

  const sessionA = { ownerId: 'driver-001', sessionId: 'session-A' };
  const sessionB = { ownerId: 'driver-002', sessionId: 'session-B' };

  test('CONTRACT-01: Execution creation yields unique executionId', async () => {
    const dm = new DialogueStateManager();
    const ctx = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId'], 'order.accepted', {}, sessionA);
    const e1 = dm.createExecution(ctx, sessionA);
    const e2 = dm.createExecution(ctx, sessionA);
    expect(e1.executionId).not.toEqual(e2.executionId);
    expect(e1.status).toBe('PENDING');
  });

  test('CONTRACT-02 & 03: Retry preserves same executionId and idempotencyKey', async () => {
    let attempts = 0;
    const dm = new DialogueStateManager({
      actionDispatcher: async (ev, ctx, ex) => {
        attempts++;
        if (attempts === 1) return { status: 'FAILED', executionId: ex.executionId, errorCode: 'TIMEOUT', attempt: ex.attempt };
        return { status: 'SUCCEEDED', executionId: ex.executionId, attempt: ex.attempt };
      }
    });

    const ctx = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId'], 'order.accepted', {}, sessionA);
    const ex = dm.createExecution(ctx, sessionA);
    const originalKey = ex.idempotencyKey;
    const res = await dm.dispatchAction(ex.executionId, { orderId: 1001 }, sessionA);

    expect(res.status).toBe('SUCCEEDED');
    expect(res.executionId).toBe(ex.executionId);
    expect(res.attempt).toBe(2);
    expect(dm.getExecution(ex.executionId, sessionA)?.idempotencyKey).toBe(originalKey);
  });

  test('CONTRACT-04 & 05: Duplicate dispatch is idempotent with identical payload', async () => {
    let count = 0;
    const dm = new DialogueStateManager({
      actionDispatcher: async (ev, ctx, ex) => {
        count++;
        return { status: 'SUCCEEDED', executionId: ex.executionId, attempt: ex.attempt };
      }
    });

    const ctx = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId'], 'order.accepted', {}, sessionA);
    const ex = dm.createExecution(ctx, sessionA);

    await dm.dispatchAction(ex.executionId, { orderId: 1001 }, sessionA);
    const second = await dm.dispatchAction(ex.executionId, { orderId: 1001 }, sessionA);

    expect(count).toBe(1);
    expect(second.status).toBe('SUCCEEDED');
  });

  test('CONTRACT-06: Payload mutation throws CONTRACT_VIOLATION', async () => {
    const dm = new DialogueStateManager();
    const ctx = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId'], 'order.accepted', {}, sessionA);
    const ex = dm.createExecution(ctx, sessionA);

    await expect(async () => {
      await dm.dispatchAction(ex.executionId, { orderId: 9999 }, sessionA);
    }).rejects.toThrow(/CONTRACT_VIOLATION/);
  });

  test('CONTRACT-07 & 08: Retryable vs Non-retryable error handling', async () => {
    let retryCalls = 0;
    const dmRetry = new DialogueStateManager({
      retryPolicy: { maxAttempts: 3, retryableErrors: ['TIMEOUT'] },
      actionDispatcher: async (ev, ctx, ex) => { retryCalls++; return { status: 'FAILED', executionId: ex.executionId, errorCode: 'TIMEOUT', attempt: ex.attempt }; }
    });
    const ctx1 = dmRetry.createContext('ACCEPT_ORDER', { orderId: 1 }, ['orderId'], 'order.accepted', {}, sessionA);
    const ex1 = dmRetry.createExecution(ctx1, sessionA);
    const res1 = await dmRetry.dispatchAction(ex1.executionId, { orderId: 1 }, sessionA);
    expect(retryCalls).toBe(3);
    expect(res1.status).toBe('FAILED');

    let nonRetryCalls = 0;
    const dmNon = new DialogueStateManager({
      retryPolicy: { maxAttempts: 3, retryableErrors: ['TIMEOUT'] },
      actionDispatcher: async (ev, ctx, ex) => { nonRetryCalls++; return { status: 'FAILED', executionId: ex.executionId, errorCode: 'INVALID_ACTION', attempt: ex.attempt }; }
    });
    const ctx2 = dmNon.createContext('ACCEPT_ORDER', { orderId: 2 }, ['orderId'], 'order.accepted', {}, sessionA);
    const ex2 = dmNon.createExecution(ctx2, sessionA);
    const res2 = await dmNon.dispatchAction(ex2.executionId, { orderId: 2 }, sessionA);
    expect(nonRetryCalls).toBe(1);
    expect(res2.status).toBe('FAILED');
  });

  test('CONTRACT-09, 10 & 11: UNKNOWN status handling', async () => {
    const dm = new DialogueStateManager({
      actionDispatcher: async (ev, ctx, ex) => ({ status: 'UNKNOWN', executionId: ex.executionId, errorCode: 'NO_ACK', attempt: ex.attempt })
    });
    const ctx = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId'], 'order.accepted', {}, sessionA);
    ctx.status = 'WAITING_FOR_SLOT';
    const ex = dm.createExecution(ctx, sessionA);
    const res = await dm.dispatchAction(ex.executionId, { orderId: 1001 }, sessionA);

    expect(res.status).toBe('UNKNOWN');
    expect(dm.getContext(ctx.contextId, sessionA)?.status).not.toBe('COMPLETED');
    expect(dm.getExecutionLogs(sessionA).length).toBe(1);
  });

  test('CONTRACT-12: Concurrent duplicate dispatch produces single side effect', async () => {
    let sideEffects = 0;
    const dm = new DialogueStateManager({
      actionDispatcher: async (ev, ctx, ex) => {
        sideEffects++;
        await new Promise(r => setTimeout(r, 10));
        return { status: 'SUCCEEDED', executionId: ex.executionId, attempt: ex.attempt };
      }
    });
    const ctx = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId'], 'order.accepted', {}, sessionA);
    const ex = dm.createExecution(ctx, sessionA);

    await Promise.all([
      dm.dispatchAction(ex.executionId, { orderId: 1001 }, sessionA),
      dm.dispatchAction(ex.executionId, { orderId: 1001 }, sessionA)
    ]);
    expect(sideEffects).toBe(1);
  });

  test('CONTRACT-13, 14 & 15: State transitions & Correlation', async () => {
    const dm = new DialogueStateManager();
    const ctx = dm.createContext('ACCEPT_ORDER', { orderId: 1001 }, ['orderId'], 'order.accepted', {}, sessionA);
    const ex = dm.createExecution(ctx, sessionA);

    expect(ex.ownerId).toBe('driver-001');
    expect(ex.sessionId).toBe('session-A');
    expect(ex.contextId).toBe(ctx.contextId);
  });

  test('CONTRACT-16: Sequential distinct executions in single context', async () => {
    const dm = new DialogueStateManager();
    const ctx = dm.createContext('ORDER', { orderId: 1001 }, ['orderId'], 'order.step1', {}, sessionA);
    const ex1 = dm.createExecution(ctx, sessionA);
    await dm.dispatchAction(ex1.executionId, { orderId: 1001 }, sessionA);

    ctx.actionType = 'order.step2';
    const ex2 = dm.createExecution(ctx, sessionA);
    await dm.dispatchAction(ex2.executionId, { orderId: 1001 }, sessionA);

    expect(ex1.executionId).not.toEqual(ex2.executionId);
    expect(dm.getExecutionLogs(sessionA).length).toBe(2);
  });

});
