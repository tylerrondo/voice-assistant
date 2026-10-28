import type { NannyBackendDispatcherConfig, NannyBookingLocation } from './nanny-backend-action-dispatcher';
import type { DialogueContext } from './dialogue-manager';

type Session = { token: string; u_hash: string; u_id: string };
type Candidate = { id_user?: string | number; name?: string; family?: string; id?: string | number; [key: string]: unknown };

function formPost(url: string, fields: Record<string, string>, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(10000),
  });
}

async function readJson(response: Response): Promise<any> {
  if (!response.ok) throw new Error('BACKEND_READ_FAILED');
  const body = await response.json();
  if (body?.status !== 'success' || body?.code === '404') throw new Error('BACKEND_READ_REJECTED');
  return body;
}

function localDate(dateText: unknown, timeZone: string): string {
  const value = String(dateText ?? '').trim().toLowerCase();
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  const local = { year: part('year'), month: part('month'), day: part('day') };
  const localDay = (offset: number) => {
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    return date.toISOString().slice(0, 10);
  };
  if (/^(сегодня|today)$/i.test(value)) return localDay(0);
  if (/^(завтра|tomorrow)$/i.test(value)) return localDay(1);
  if (/^послезавтра$/i.test(value)) return localDay(2);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('BOOKING_DATE_UNSUPPORTED');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('BOOKING_DATE_UNSUPPORTED');
  }
  return value;
}

function timeParts(value: unknown): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) throw new Error('BOOKING_TIME_UNSUPPORTED');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('BOOKING_TIME_UNSUPPORTED');
  return [hour, minute];
}

async function geocode(address: string, fetchImpl: typeof fetch): Promise<{ latitude: number; longitude: number }> {
  if (!address.trim()) throw new Error('BOOKING_ADDRESS_REQUIRED');
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', address.trim());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  const response = await fetchImpl(url.toString(), { headers: { 'Accept-Language': 'ru,en' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('GEOCODING_FAILED');
  const rows = await response.json() as Array<{ lat?: string; lon?: string }>;
  const latitude = Number(rows[0]?.lat);
  const longitude = Number(rows[0]?.lon);
  if (!rows.length || !Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('ADDRESS_NOT_FOUND');
  return { latitude, longitude };
}

async function resolveTimeZone(latitude: number, longitude: number, fetchImpl: typeof fetch): Promise<string> {
  const url = new URL('https://timeapi.io/api/timezone/coordinate');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('TIMEZONE_LOOKUP_FAILED');
  const body = await response.json() as { timeZone?: string; timeZoneName?: string };
  const zone = body.timeZone ?? body.timeZoneName;
  if (!zone || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(zone)) throw new Error('TIMEZONE_LOOKUP_FAILED');
  return zone;
}

function zonedDateTime(date: string, hour: number, minute: number, timeZone: string): Date {
  // Convert a wall-clock booking time in the resolved location zone to an absolute instant.
  const target = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour, minute);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    instant += target - represented;
  }
  const result = new Date(instant);
  if (Number.isNaN(result.getTime())) throw new Error('BOOKING_DATETIME_INVALID');
  return result;
}

async function getCandidates(baseUrl: string, session: Session, location: NannyBookingLocation, fetchImpl: typeof fetch): Promise<Candidate[]> {
  const auth = { token: session.token, u_hash: session.u_hash };
  const cityResponse = await readJson(await formPost(`${baseUrl}/query/template/1`, {
    ...auth,
    data: JSON.stringify({
      ':drive_latitude': String(location.latitude),
      ':drive_longitude': String(location.longitude),
      ':max_distance': '100',
    }),
  }, fetchImpl));
  const cities = Array.isArray(cityResponse.data) ? cityResponse.data : [];
  const cityIds = cities.map((city: any) => String(city.id_city ?? '')).filter(Boolean);
  if (!cityIds.length) return [];
  const localHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: location.timeZone, hour: '2-digit', hourCycle: 'h23' }).format(location.when));
  const template = localHour >= 22 || localHour < 6 ? '3' : '2';
  const fields: Record<string, string> = {
    ...auth,
    data: JSON.stringify({
      ':city_id_list': cityIds.join(','),
      ...(template === '3' ? { ':client_id': session.u_id } : {}),
    }),
  };
  const result = await readJson(await formPost(`${baseUrl}/query/template/${template}`, fields, fetchImpl));
  return Array.isArray(result.data) ? result.data : [];
}

export function createNannyBackendResolvers(
  baseUrl: string,
  getSession: () => Session | null,
  fetchImpl: typeof fetch = fetch,
): Pick<NannyBackendDispatcherConfig, 'resolveBookingLocation' | 'resolveSelectedNanny'> {
  let resolved: { payload: Record<string, any>; location: NannyBookingLocation; candidates: Candidate[] } | null = null;
  const resolveBookingLocation = async (payload: Record<string, any>, _context: DialogueContext): Promise<NannyBookingLocation> => {
    const session = getSession();
    if (!session) throw new Error('CUSTOMER_SESSION_REQUIRED');
    const point = await geocode(String(payload.location ?? ''), fetchImpl);
    const timeZone = await resolveTimeZone(point.latitude, point.longitude, fetchImpl);
    const [hour, minute] = timeParts(payload.start_time);
    const date = localDate(payload.date, timeZone);
    const when = zonedDateTime(date, hour, minute, timeZone);
    if (when.getTime() < Date.now() - 60_000) throw new Error('BOOKING_TIME_IN_PAST');
    const location = { ...point, timeZone, when };
    const candidates = await getCandidates(baseUrl.replace(/\/+$/, ''), session, location, fetchImpl);
    resolved = { payload, location, candidates };
    return location;
  };
  const resolveSelectedNanny = async (payload: Record<string, any>, _context: DialogueContext): Promise<string | null> => {
    const current = resolved;
    if (!current || current.payload !== payload) return null;
    const selected = String(payload.selected_nanny ?? '').trim().toLowerCase();
    if (!selected) return null;
    const index = Number(payload.candidate_index ?? selected);
    const candidate = Number.isInteger(index) && index >= 1
      ? current.candidates[index - 1]
      : current.candidates.find(item => {
          const id = String(item.id_user ?? item.id ?? '');
          const name = `${item.name ?? ''} ${item.family ?? ''}`.trim().toLowerCase();
          return id === selected || name === selected;
        });
    const id = candidate?.id_user ?? candidate?.id;
    return id == null || String(id).trim() === '' ? null : String(id);
  };
  return { resolveBookingLocation, resolveSelectedNanny };
}
