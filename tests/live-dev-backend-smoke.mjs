/**
 * Read-only live smoke test for the nanny customer-session API.
 *
 * Verifies the exact customer login/token endpoints used by NannyCustomerSessionClient.
 * Never sends email, creates orders, prints credentials, tokens, or response bodies.
 *
 * Required environment:
 *   DEV_BACKEND_URL      HTTPS origin, e.g. https://ibronevik.ru/taxi_dev2/c/children
 *   DEV_BACKEND_LOGIN
 *   DEV_BACKEND_PASSWORD
 *   DEV_BACKEND_TEST_LATITUDE   Known dev2 test point latitude (read-only lookup)
 *   DEV_BACKEND_TEST_LONGITUDE  Known dev2 test point longitude (read-only lookup)
 */
const required = (name) => {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const baseUrl = required('DEV_BACKEND_URL').replace(/\/+$/, '');
const login = required('DEV_BACKEND_LOGIN');
const password = required('DEV_BACKEND_PASSWORD');

const parsedBase = new URL(baseUrl);
if (parsedBase.protocol !== 'https:') {
  throw new Error('DEV_BACKEND_URL must use HTTPS');
}
if (!parsedBase.pathname || parsedBase.pathname === '/') {
  throw new Error('DEV_BACKEND_URL must include the backend application path (e.g. /taxi_dev2/c/children)');
}

async function requestJson(stage, url, init) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  } catch (error) {
    const code = error && typeof error === 'object' && 'cause' in error
      ? error.cause?.code
      : undefined;
    throw new Error(`${stage}: network/TLS request failed${code ? ` (${code})` : ''}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${stage}: non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok || data?.status === 'error') {
    const code = data?.code ? `, API code ${String(data.code).slice(0, 80)}` : '';
    throw new Error(`${stage}: failed (HTTP ${response.status}${code})`);
  }
  console.log(`PASS ${stage}: HTTP ${response.status}`);
  return data;
}

async function postForm(stage, path, values) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, String(value));
  return requestJson(stage, `${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body
  });
}

async function main() {
  const auth = await postForm('nanny customer authentication', '/api/v1/auth/login', {
    login,
    password,
    type: 'e-mail'
  });
  if (auth.status !== 'success' || !auth.auth_hash) {
    throw new Error('nanny customer authentication: successful status or auth_hash missing');
  }

  const tokenResponse = await postForm('customer token acquisition', '/api/v1/token', {
    auth_hash: auth.auth_hash
  });
  const token = tokenResponse?.data?.token;
  const uHash = tokenResponse?.data?.u_hash;
  const customerId = tokenResponse?.auth_user?.u_id;
  if (tokenResponse.status !== 'success' || !token || !uHash || typeof customerId !== 'string' || !customerId.trim()) {
    throw new Error('customer token acquisition: successful status, token, u_hash, or auth_user.u_id missing');
  }

  console.log('PASS customer session: token, u_hash, and authenticated customer ID received; values withheld');

  // Read-only integration check of the same location/candidate templates used by MultiBot.
  // Coordinates are supplied as repository secrets so the check uses a known dev2 test point.
  const latitude = Number(required('DEV_BACKEND_TEST_LATITUDE'));
  const longitude = Number(required('DEV_BACKEND_TEST_LONGITUDE'));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('dev2 test coordinates are invalid');
  }
  const customerSession = { token, u_hash: uHash };
  const citiesResponse = await postForm('read-only city lookup', '/api/v1/query/template/1', {
    ...customerSession,
    data: JSON.stringify({
      ':drive_latitude': String(latitude),
      ':drive_longitude': String(longitude),
      ':max_distance': '100'
    })
  });
  if (citiesResponse.status !== 'success' || !Array.isArray(citiesResponse.data)) {
    throw new Error('read-only city lookup: expected successful response with data array');
  }
  const cityIds = citiesResponse.data.map(city => String(city?.id_city ?? '')).filter(Boolean);
  console.log(`PASS read-only city lookup: ${cityIds.length} matching city record(s); response values withheld`);
  if (cityIds.length > 0) {
    const candidatesResponse = await postForm('read-only nanny candidate lookup', '/api/v1/query/template/2', {
      ...customerSession,
      data: JSON.stringify({ ':city_id_list': cityIds.join(',') })
    });
    if (candidatesResponse.status !== 'success' || !Array.isArray(candidatesResponse.data)) {
      throw new Error('read-only nanny candidate lookup: expected successful response with data array');
    }
    const candidatesWithIds = candidatesResponse.data.filter(candidate =>
      candidate && candidate.id_user !== undefined && candidate.id_user !== null && String(candidate.id_user).trim()
    ).length;
    console.log(`PASS read-only nanny candidate lookup: ${candidatesWithIds} candidate ID(s) received; values withheld`);
  } else {
    console.log('SKIP candidate lookup: no city IDs returned for configured test point');
  }
  console.log('LIVE NANNY CUSTOMER SESSION + READ-ONLY LOOKUP SMOKE TEST PASSED (no order created)');
}

main().catch((error) => {
  console.error(`LIVE NANNY CUSTOMER SESSION SMOKE TEST FAILED: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
