import { test, expect } from '@playwright/test';
import { DialogueStateManager } from '../../../src/platform/dialogue-manager';

test.describe('CONTRACT: PLATFORM-010 Multi-Context Session Manager Suite', () => {
  const identity = { ownerId: 'driver-multi', sessionId: 'session-multi' };

  const create = (dm: DialogueStateManager, orderId: number) =>
    dm.createContext(
      'ACCEPT_ORDER',
      { orderId },
      ['orderId', 'payment'],
      'driver.order.accepted',
      { payment: 'Какой способ оплаты?' },
      identity
    );

  test('CONTRACT-01: Context has system-generated unique contextId', async () => {
    const dm = new DialogueStateManager();
    const ctxA = create(dm, 1001);
    const ctxB = create(dm, 1002);

    expect(typeof ctxA.contextId).toBe('string');
    expect(typeof ctxB.contextId).toBe('string');
    expect(ctxA.contextId).not.toBe(ctxB.contextId);
  });

  test('CONTRACT-02: Creation of second context preserves first context in WAITING_FOR_SLOT', async () => {
    const dm = new DialogueStateManager();
    const ctxA = create(dm, 1001);
    const ctxB = create(dm, 1002);

    expect(dm.getContext(ctxA.contextId, identity)?.status).toBe('WAITING_FOR_SLOT');
    expect(dm.getContext(ctxB.contextId, identity)?.status).toBe('WAITING_FOR_SLOT');
    expect(dm.listContexts(identity)).toHaveLength(2);
  });

  test('CONTRACT-03: Context switching preserves slots across independent contexts', async () => {
    const dm = new DialogueStateManager();
    const ctxA = create(dm, 1001);
    const ctxB = create(dm, 1002);

    expect(dm.activateContext(ctxA.contextId, identity)).toBe(true);
    expect(dm.getActiveState(identity)?.slots.orderId).toBe(1001);

    expect(dm.activateContext(ctxB.contextId, identity)).toBe(true);
    expect(dm.getActiveState(identity)?.slots.orderId).toBe(1002);
    expect(dm.getContext(ctxA.contextId, identity)?.slots.orderId).toBe(1001);
  });

  test('CONTRACT-04: Cancellation addresses strictly selected context', async () => {
    const dm = new DialogueStateManager();
    const ctxA = create(dm, 1001);
    const ctxB = create(dm, 1002);

    const cancel = await dm.cancelContext(ctxA.contextId, identity);
    expect(cancel.success).toBe(true);
    expect(dm.getContext(ctxA.contextId, identity)?.status).toBe('CANCELLED');
    expect(dm.getContext(ctxB.contextId, identity)?.status).toBe('WAITING_FOR_SLOT');
  });

  test('CONTRACT-05: Expiration addresses strictly selected context', async () => {
    const dm = new DialogueStateManager();
    const ctxA = create(dm, 1001);
    const ctxB = create(dm, 1002);

    const expired = await dm.expireContext(ctxA.contextId, identity);
    expect(expired.success).toBe(true);
    expect(dm.getContext(ctxA.contextId, identity)?.status).toBe('EXPIRED');
    expect(dm.getContext(ctxB.contextId, identity)?.status).toBe('WAITING_FOR_SLOT');
  });

  test('CONTRACT-06: Execution record carries contextId, actionType, and payload', async () => {
    const dm = new DialogueStateManager();
    const ctx = create(dm, 1001);
    const execution = dm.createExecution(ctx, identity, 'exec-multi-001');

    expect(execution.contextId).toBe(ctx.contextId);
    expect(execution.actionType).toBe('driver.order.accepted');
    expect(execution.payload).toEqual({ orderId: 1001 });
    expect(dm.getExecutionLogs(identity).map(item => item.executionId)).toContain('exec-multi-001');
  });

  test('CONTRACT-07: Idempotency is context-aware and does not conflict between orders', async () => {
    const dm = new DialogueStateManager();
    const ctxA = create(dm, 1001);
    const ctxB = create(dm, 1002);

    const firstA = dm.createExecution(ctxA, identity, 'exec-order-a');
    const duplicateA = dm.createExecution(ctxA, identity, 'exec-order-a');
    const firstB = dm.createExecution(ctxB, identity, 'exec-order-b');

    expect(duplicateA.executionId).toBe(firstA.executionId);
    expect(firstB.executionId).not.toBe(firstA.executionId);
    expect(firstA.contextId).toBe(ctxA.contextId);
    expect(firstB.contextId).toBe(ctxB.contextId);
    expect(dm.getExecutionLogs(identity)).toHaveLength(2);
  });

  test('CONTRACT-08: Runtime capacity policy rejects new context when maxActiveContexts is reached', async () => {
    const dm = new DialogueStateManager({ maxActiveContexts: 2 });
    create(dm, 1001);
    create(dm, 1002);

    expect(() => create(dm, 1003)).toThrow(/REJECT_NEW_CONTEXT/);
  });
});
