import { test, expect } from '@playwright/test';

test.describe('Nanny customer session UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any;
      w.__AUTH_OWNER_ID__ = 'e2e-owner';
      w.__AUTH_SESSION_ID__ = 'e2e-session';
      w.__NANNY_BACKEND_CONFIG__ = {
        baseUrl: 'https://dev2.example.test/api/v1',
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
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__NANNY_CUSTOMER_SESSION__?.token))).toBe(true);

    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page.locator('#nanny-customer-auth-status')).toHaveText('Выполнен выход');
    await expect.poll(() => page.evaluate(() => (window as any).__NANNY_CUSTOMER_SESSION__)).toBeUndefined();
  });

  test('blocks nanny dispatch without a customer-owned session and makes no API call', async ({ page }) => {
    let apiCalls = 0;
    await page.route('https://dev2.example.test/api/v1/**', async route => {
      apiCalls += 1;
      await route.abort();
    });
    await page.goto('/');
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
