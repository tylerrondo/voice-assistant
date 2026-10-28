import { test, expect } from '@playwright/test';
import { NannyCustomerSessionClient } from '../../../src/platform/nanny-customer-session';

test.describe('nanny customer session', () => {
  test('logs in with customer credentials and keeps token only in memory', async () => {
    const requests: Array<{ url: string; body: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), body: String(init?.body) });
      if (String(input).endsWith('/auth/login')) {
        return new Response(JSON.stringify({ auth_hash: 'customer-auth-hash' }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { token: 'customer-token', u_hash: 'customer-u-hash' } }), { status: 200 });
    };
    const client = new NannyCustomerSessionClient('https://dev2.example.test/api/v1/', fetchImpl);
    const session = await client.login('customer@example.test', 'customer-password');

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe('https://dev2.example.test/api/v1/auth/login');
    expect(new URLSearchParams(requests[0].body).get('login')).toBe('customer@example.test');
    expect(new URLSearchParams(requests[0].body).get('password')).toBe('customer-password');
    expect(requests[1].url).toBe('https://dev2.example.test/api/v1/token');
    expect(new URLSearchParams(requests[1].body).get('auth_hash')).toBe('customer-auth-hash');
    expect(session).toEqual({ token: 'customer-token', u_hash: 'customer-u-hash' });
    expect(client.isAuthenticated()).toBe(true);
    expect(client.getSession()).toEqual(session);

    client.clear();
    expect(client.isAuthenticated()).toBe(false);
    expect(client.getSession()).toBeNull();
  });

  test('does not retain a previous session when a later login fails', async () => {
    let loginCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      loginCalls += 1;
      if (loginCalls === 1) return new Response(JSON.stringify({ auth_hash: 'auth-1' }), { status: 200 });
      if (loginCalls === 2) return new Response(JSON.stringify({ data: { token: 'token-1', u_hash: 'hash-1' } }), { status: 200 });
      return new Response('{}', { status: 401 });
    };
    const client = new NannyCustomerSessionClient('https://dev2.example.test/api/v1', fetchImpl);
    await client.login('customer@example.test', 'valid-password');
    await expect(client.login('customer@example.test', 'bad-password')).rejects.toThrow('CUSTOMER_AUTH_FAILED');
    expect(client.isAuthenticated()).toBe(false);
    expect(client.getSession()).toBeNull();
  });

  test('rejects insecure non-local API origins', () => {
    expect(() => new NannyCustomerSessionClient('http://dev2.example.test/api/v1', fetch)).toThrow('CUSTOMER_API_HTTPS_REQUIRED');
  });
});
