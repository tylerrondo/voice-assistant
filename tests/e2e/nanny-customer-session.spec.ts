import { test, expect } from '@playwright/test';

test.describe('Nanny customer session UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any;
      w.__AUTH_OWNER_ID__ = 'e2e-owner';
      w.__AUTH_SESSION_ID__ = 'e2e-session';
      w.__NANNY_BACKEND_CONFIG__ = {
        baseUrl: 'https://dev2.example.test/api/v1',
        resolveBookingLocation: async () => ({
          latitude: 30.4,
          longitude: -9.6,
          timeZone: 'Africa/Casablanca',
          when: new Date('2026-10-26T14:00:00.000Z'),
        }),
        resolveSelectedNanny: async () => 'backend-nanny-93',
      };
    });
  });

  test('logs in through /auth/login then /token and clears session on logout', async ({ page }) => {
    const requests: string[] = [];
    await page.route('https://dev2.example.test/api/v1/auth/login', async route => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          auth_hash: 'e2e-auth-hash',
          auth_user: { u_id: 'e2e-customer-id' },
        }),
      });
    });
    await page.route('https://dev2.example.test/api/v1/token', async route => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: { token: 'e2e-customer-token', u_hash: 'e2e-customer-u-hash' },
          auth_user: { u_id: 'e2e-customer-id' },
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Вход клиента для заказа няни' })).toBeVisible();
    await page.getByLabel('E-mail').fill('customer@example.test');
    await page.getByLabel('Пароль').fill('not-a-real-password');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.locator('#nanny-customer-auth-status')).toHaveText('Вход выполнен. Сессия хранится только в памяти этой вкладки.');
    await expect(page.getByLabel('Пароль')).toHaveValue('');
    expect(requests).toEqual([
      'https://dev2.example.test/api/v1/auth/login',
      'https://dev2.example.test/api/v1/token',
    ]);
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__NANNY_CUSTOMER_SESSION__?.token && (window as any).__NANNY_CUSTOMER_SESSION__?.u_id === 'e2e-customer-id'))).toBe(true);

    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page.locator('#nanny-customer-auth-status')).toHaveText('Выполнен выход');
    await expect.poll(() => page.evaluate(() => (window as any).__NANNY_CUSTOMER_SESSION__)).toBeUndefined();
  });

  test('uses the authenticated customer ID from /token in the nanny API request', async ({ page }) => {
    const createBodies: string[] = [];
    const assignmentBodies: string[] = [];
    await page.route('https://dev2.example.test/api/v1/auth/login', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', auth_hash: 'auth-hash' }),
    }));
    await page.route('https://dev2.example.test/api/v1/token', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        data: { token: 'customer-token', u_hash: 'customer-hash' },
        auth_user: { u_id: 'customer-42' },
      }),
    }));
    await page.route('https://dev2.example.test/api/v1/script/template/nanny_pricing', async route => {
      createBodies.push(route.request().postData() || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: { b_id: 731 } }),
      });
    });
    await page.route('https://dev2.example.test/api/v1/drive/get/731', async route => {
      assignmentBodies.push(route.request().postData() || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success' }),
      });
    });

    await page.goto('/');
    await page.getByLabel('E-mail').fill('customer@example.test');
    await page.getByLabel('Пароль').fill('test-password');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.locator('#nanny-customer-auth-status')).toContainText('Вход выполнен');

    const result = await page.evaluate(async () => {
      const dispatcher = (window as any).__PRODUCTION_ACTION_DISPATCHER__;
      const now = Date.now();
      const payload = {
        date: '2026-10-26',
        start_time: '15:00',
        end_time: '20:00',
        children_count: 2,
        children_ages: '3 и 5 лет',
        additional_options: [],
        location: 'Agadir',
        requirements: '',
        selected_nanny: 'nanny-93',
        confirmation: 'CONFIRMED',
      };
      return dispatcher(
        { type: 'nanny.order.confirmed', payload },
        {
          contextId: 'ctx-e2e-nanny',
          version: 1,
          ownerId: 'e2e-owner',
          sessionId: 'e2e-session',
          intent: 'ORDER_NANNY',
          slots: payload,
          missingSlots: [],
          status: 'DISPATCHING',
          createdAt: now,
          updatedAt: now,
          expiresAt: now + 300000,
          actionType: 'nanny.order.confirmed',
          scenarioId: 'order-nanny',
        },
        {
          executionId: 'e2e-nanny-dispatch',
          idempotencyKey: 'e2e-nanny-dispatch-key',
          ownerId: 'e2e-owner',
          sessionId: 'e2e-session',
          contextId: 'ctx-e2e-nanny',
          scenarioId: 'order-nanny',
          intent: 'ORDER_NANNY',
          actionType: 'nanny.order.confirmed',
          payload,
          status: 'DISPATCHING',
          attempt: 1,
          createdAt: now,
          updatedAt: now,
          event: { type: 'nanny.order.confirmed', payload },
        },
      );
    });

    expect(result).toMatchObject({ status: 'SUCCEEDED' });
    expect(createBodies).toHaveLength(1);
    expect(assignmentBodies).toHaveLength(1);
    expect(new URLSearchParams(createBodies[0]).get('u_id')).toBe('customer-42');
    expect(new URLSearchParams(assignmentBodies[0]).get('u_id')).toBe('backend-nanny-93');
    expect(new URLSearchParams(createBodies[0]).get('token')).toBe('customer-token');
  });

  test('blocks nanny dispatch without a customer-owned session and makes no API call', async ({ page }) => {
    let apiCalls = 0;
    await page.route('https://dev2.example.test/api/v1/**', async route => {
      apiCalls += 1;
      await route.abort();
    });
    await page.goto('/');
    // The production entrypoint is loaded through a dynamic import; wait until
    // mountPlatformRuntime has registered the dispatcher before exercising it.
    await expect.poll(() => page.evaluate(
      () => typeof (window as any).__PRODUCTION_ACTION_DISPATCHER__,
    )).toBe('function');
    const result = await page.evaluate(async () => {
      const dispatcher = (window as any).__PRODUCTION_ACTION_DISPATCHER__;
      return dispatcher(
        { type: 'nanny.order.confirmed', payload: {} },
        {},
        {
          executionId: 'nanny-session-guard-e2e',
          attempt: 1,
          payload: {},
          idempotencyKey: 'nanny-session-guard-e2e',
        },
      );
    });

    expect(result).toMatchObject({
      status: 'FAILED',
      errorCode: 'NANNY_CUSTOMER_SESSION_REQUIRED',
    });
    expect(apiCalls).toBe(0);
  });
});
