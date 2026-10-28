import { test, expect } from '@playwright/test';
import { createNannyBackendResolvers } from '../../../src/platform/nanny-backend-resolvers';

test.describe('nanny backend resolvers', () => {
  test('resolves a real candidate ID using customer-authenticated read-only templates', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : undefined;
      requests.push({ url, body });
      if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
        return new Response(JSON.stringify([{ lat: '30.4278', lon: '-9.5981' }]), { status: 200 });
      }
      if (url.startsWith('https://timeapi.io/api/timezone/coordinate')) {
        return new Response(JSON.stringify({ timeZone: 'Africa/Casablanca' }), { status: 200 });
      }
      if (url.endsWith('/query/template/1')) {
        return new Response(JSON.stringify({ status: 'success', data: [{ id_city: 'city-4' }] }), { status: 200 });
      }
      if (url.endsWith('/query/template/2')) {
        return new Response(JSON.stringify({ status: 'success', data: [
          { id_user: 'backend-user-93', name: 'Мария', family: 'Иванова' },
          { id_user: 'backend-user-12', name: 'Анна', family: 'Петрова' },
        ] }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const session = { token: 'customer-token', u_hash: 'customer-hash', u_id: 'customer-42' };
    const resolvers = createNannyBackendResolvers(
      'https://dev2.example.test/api/v1',
      () => session,
      fetchMock,
    );
    const payload = {
      date: '2099-05-10',
      start_time: '15:00',
      end_time: '20:00',
      location: 'Agadir',
      selected_nanny: '1',
      candidate_index: 1,
    };
    const location = await resolvers.resolveBookingLocation(payload, {} as any);
    expect(location).toMatchObject({
      latitude: 30.4278,
      longitude: -9.5981,
      timeZone: 'Africa/Casablanca',
    });
    expect(location.when.toISOString()).toContain('2099-05-10');
    // Dispatcher payloads may be cloned from dialogue slots; selection must resolve by booking context, not object identity.
    await expect(resolvers.resolveSelectedNanny({ ...payload }, {} as any)).resolves.toBe('backend-user-93');
    expect(requests.map(request => new URL(request.url).pathname)).toEqual([
      '/search',
      '/api/timezone/coordinate',
      '/api/v1/query/template/1',
      '/api/v1/query/template/2',
    ]);
    for (const request of requests.filter(item => item.body?.includes('customer-token'))) {
      expect(request.body).toContain('customer-token');
      expect(request.body).toContain('customer-hash');
      expect(request.body).not.toContain('admin');
      expect(request.body).not.toContain('u_a_role');
    }
  });

  test('fails closed without a customer session and does not call any API', async () => {
    let calls = 0;
    const resolvers = createNannyBackendResolvers(
      'https://dev2.example.test/api/v1',
      () => null,
      async () => {
        calls += 1;
        return new Response('{}', { status: 200 });
      },
    );
    await expect(resolvers.resolveBookingLocation({ location: 'Agadir' }, {} as any)).rejects.toThrow('CUSTOMER_SESSION_REQUIRED');
    expect(calls).toBe(0);
  });
});
