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
  if (tokenResponse.status !== 'success' || !token || !uHash) {
    throw new Error('customer token acquisition: successful status, token, or u_hash missing');
  }

  // Deliberately stop here: quote/order template semantics are not yet validated,
  // and this smoke test must never create a real booking.
  console.log('PASS customer session: token and u_hash received; values withheld');
  console.log('LIVE NANNY CUSTOMER SESSION SMOKE TEST PASSED (read-only; no order created)');
}

main().catch((error) => {
  console.error(`LIVE NANNY CUSTOMER SESSION SMOKE TEST FAILED: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
