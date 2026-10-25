/**
 * Read-only live smoke test for the Validation Bench Backend API.
 *
 * Verifies the same auth/token/data-read contract used by BackendClient.
 * Never sends mail, creates orders, prints credentials, tokens, or response bodies.
 *
 * Required environment:
 *   DEV_BACKEND_URL      HTTPS origin, e.g. https://backend.example.com
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
if (parsedBase.pathname !== '/' && parsedBase.pathname !== '') {
  throw new Error('DEV_BACKEND_URL must be the backend origin, without an API path');
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
  const auth = await postForm('backend authentication', '/api/v1/auth', {
    login,
    password,
    type: 'e-mail'
  });
  if (!auth.auth_hash) throw new Error('backend authentication: auth_hash missing');

  const tokenResponse = await postForm('token acquisition', '/api/v1/token', {
    auth_hash: auth.auth_hash
  });
  const token = tokenResponse?.data?.token;
  const uHash = tokenResponse?.data?.u_hash;
  if (!token || !uHash) throw new Error('token acquisition: token or u_hash missing');

  const query = encodeURIComponent(JSON.stringify({ site_emails: true }));
  const data = await requestJson(
    'database-backed data read',
    `${baseUrl}/api/v1/data/?json_like=${query}`,
    { method: 'GET' }
  );
  const siteEmails = data?.data?.data?.site_emails;
  if (!siteEmails || typeof siteEmails !== 'object' || Array.isArray(siteEmails) || Object.keys(siteEmails).length === 0) {
    throw new Error('database-backed data read: site_emails missing or empty');
  }
  console.log('PASS database-backed data read: site_emails available');
  console.log('LIVE DEV BACKEND SMOKE TEST PASSED (read-only)');
}

main().catch((error) => {
  console.error(`LIVE DEV BACKEND SMOKE TEST FAILED: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
