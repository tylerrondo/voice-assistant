import { test, expect } from '@playwright/test';
import * as path from 'path';

const scenarioFilePath = path.resolve(__dirname, '../../../scenario-platform-015-action-dispatch-reliability.json');

test.describe('E2E: PLATFORM-015 Action Dispatch Reliability Suite', () => {

  const sessionA = { ownerId: 'driver-001', sessionId: 'session-A' };
  const sessionB = { ownerId: 'driver-002', sessionId: 'session-B' };

  async function setupApp(page: any) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    await page.goto(appUrl);
    await expect(page.locator('body')).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(scenarioFilePath);
  }

  test('E2E-RELIABILITY-01: Full Voice -> Intent -> Context -> Dispatch execution (HIGH-8)', async ({ page }) => {
    await setupApp(page);

    const res = await page.evaluate(async (id) => {
      const vc = (window as any).__VOICE_CHANNEL__;
      const dm = (window as any).__DIALOGUE_MANAGER__;

      let dispatchedEvent: any = null;
      dm.setActionDispatcher(async (ev: any, ctx: any, ex: any) => {
        dispatchedEvent = ev;
        return { status: 'SUCCEEDED', executionId: ex.executionId, attempt: ex.attempt };
      });

      const voiceRes = await vc.handleIncomingVoice('заказ 1001', id);
      const logs = dm.getExecutionLogs(id);

      return { voiceRes, dispatchedEvent, logsCount: logs.length, execution: logs[0] };
    }, sessionA);

    expect(res.voiceRes.status).toBe('SUCCEEDED');
    expect(res.dispatchedEvent.payload.orderId).toBe(1001);
    expect(res.logsCount).toBe(1);
    expect(res.execution.status).toBe('SUCCEEDED');
  });

  test('E2E-RELIABILITY-02: Retry succeeds on second attempt', async ({ page }) => {
    await setupApp(page);

    const res = await page.evaluate(async (id) => {
      const dm = (window as any).__DIALOGUE_MANAGER__;
      let count = 0;
      dm.setActionDispatcher(async (ev: any, ctx: any, ex: any) => {
        count++;
        if (count === 1) return { status: 'FAILED', executionId: ex.executionId, errorCode: 'TIMEOUT', attempt: ex.attempt };
        return { status: 'SUCCEEDED', executionId: ex.executionId, attempt: ex.attempt };
      });

      const ctx = dm.createContext('ORDER_DISPATCH', { orderId: 2002 }, ['orderId'], 'order.dispatch.completed', {}, id);
      const ex = dm.createExecution(ctx, id);
      const dispatchRes = await dm.dispatchAction(ex.executionId, { orderId: 2002 }, id);
      return { dispatchRes, execution: dm.getExecution(ex.executionId, id) };
    }, sessionA);

    expect(res.dispatchRes.status).toBe('SUCCEEDED');
    expect(res.execution.attempt).toBe(2);
  });

  test('E2E-RELIABILITY-03: Permanent failure terminates without infinite retry', async ({ page }) => {
    await setupApp(page);

    const res = await page.evaluate(async (id) => {
      const dm = (window as any).__DIALOGUE_MANAGER__;
      dm.setActionDispatcher(async (ev: any, ctx: any, ex: any) => {
        return { status: 'FAILED', executionId: ex.executionId, errorCode: 'INVALID_ACTION', attempt: ex.attempt };
      });

      const ctx = dm.createContext('ORDER_DISPATCH', { orderId: 3003 }, ['orderId'], 'order.dispatch.completed', {}, id);
      const ex = dm.createExecution(ctx, id);
      return dm.dispatchAction(ex.executionId, { orderId: 3003 }, id);
    }, sessionA);

    expect(res.status).toBe('FAILED');
    expect(res.attempt).toBe(1);
  });

  test('E2E-RELIABILITY-04: UNKNOWN dispatch leaves context uncompleted', async ({ page }) => {
    await setupApp(page);

    const res = await page.evaluate(async (id) => {
      const dm = (window as any).__DIALOGUE_MANAGER__;
      dm.setActionDispatcher(async (ev: any, ctx: any, ex: any) => {
        return { status: 'UNKNOWN', executionId: ex.executionId, errorCode: 'NO_RESPONSE', attempt: ex.attempt };
      });

      const ctx = dm.createContext('ORDER_DISPATCH', { orderId: 4004 }, ['orderId'], 'order.dispatch.completed', {}, id);
      const ex = dm.createExecution(ctx, id);
      const dispatchRes = await dm.dispatchAction(ex.executionId, { orderId: 4004 }, id);
      return { dispatchRes, ctx: dm.getContext(ctx.contextId, id) };
    }, sessionA);

    expect(res.dispatchRes.status).toBe('UNKNOWN');
    expect(res.ctx.status).not.toBe('COMPLETED');
  });

  test('E2E-RELIABILITY-05: Duplicate concurrent dispatch creates exactly 1 side effect', async ({ page }) => {
    await setupApp(page);

    const sideEffects = await page.evaluate(async (id) => {
      let count = 0;
      const dm = (window as any).__DIALOGUE_MANAGER__;
      dm.setActionDispatcher(async (ev: any, ctx: any, ex: any) => {
        count++;
        await new Promise(r => setTimeout(r, 15));
        return { status: 'SUCCEEDED', executionId: ex.executionId, attempt: ex.attempt };
      });

      const ctx = dm.createContext('ORDER_DISPATCH', { orderId: 5005 }, ['orderId'], 'order.dispatch.completed', {}, id);
      const ex = dm.createExecution(ctx, id);

      await Promise.all([
        dm.dispatchAction(ex.executionId, { orderId: 5005 }, id),
        dm.dispatchAction(ex.executionId, { orderId: 5005 }, id)
      ]);
      return count;
    }, sessionA);

    expect(sideEffects).toBe(1);
  });

  test('E2E-RELIABILITY-06: Payload mismatch rejects second dispatch', async ({ page }) => {
    await setupApp(page);

    const threw = await page.evaluate(async (id) => {
      const dm = (window as any).__DIALOGUE_MANAGER__;
      const ctx = dm.createContext('ORDER_DISPATCH', { orderId: 6006 }, ['orderId'], 'order.dispatch.completed', {}, id);
      const ex = dm.createExecution(ctx, id);

      try {
        await dm.dispatchAction(ex.executionId, { orderId: 7777 }, id);
        return false;
      } catch (e) {
        return true;
      }
    }, sessionA);

    expect(threw).toBe(true);
  });

  test('E2E-RELIABILITY-07 & 08: Context and Session isolation during dispatch', async ({ page }) => {
    await setupApp(page);

    const isolated = await page.evaluate(async ({ sA, sB }) => {
      const dm = (window as any).__DIALOGUE_MANAGER__;
      const ctxA = dm.createContext('ORDER_DISPATCH', { orderId: 1001 }, ['orderId'], 'order.dispatch.completed', {}, sA);
      const exA = dm.createExecution(ctxA, sA);

      try {
        await dm.dispatchAction(exA.executionId, { orderId: 1001 }, sB);
        return false;
      } catch (e) {
        return true;
      }
    }, { sA: sessionA, sB: sessionB });

    expect(isolated).toBe(true);
  });

});
