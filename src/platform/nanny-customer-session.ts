/**
 * Customer-owned session for the nanny voice UI.
 *
 * The returned token is held only in this instance's memory. Never persist it in
 * localStorage/sessionStorage or expose bot/service credentials to browser code.
 */
export interface NannyCustomerSession {
  token: string;
  u_hash: string;
}

type AuthLoginResponse = { auth_hash?: string; data?: { auth_hash?: string } };
type TokenResponse = { data?: { token?: string; u_hash?: string } };

export class NannyCustomerSessionClient {
  private session: NannyCustomerSession | null = null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, fetchImpl: typeof fetch = fetch) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error('CUSTOMER_API_HTTPS_REQUIRED');
    }
    this.baseUrl = baseUrl.replace(/\\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  isAuthenticated(): boolean {
    return Boolean(this.session?.token && this.session?.u_hash);
  }

  getSession(): NannyCustomerSession | null {
    return this.session ? { ...this.session } : null;
  }

  clear(): void {
    this.session = null;
  }

  async login(login: string, password: string): Promise<NannyCustomerSession> {
    this.clear();
    if (!login.trim() || !password) throw new Error('LOGIN_AND_PASSWORD_REQUIRED');

    const authForm = new URLSearchParams({ login: login.trim(), password, type: 'e-mail' });
    const authResponse = await this.fetchImpl(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: authForm,
    });
    if (!authResponse.ok) throw new Error('CUSTOMER_AUTH_FAILED');

    const authData = await authResponse.json() as AuthLoginResponse;
    const authHash = authData.auth_hash ?? authData.data?.auth_hash;
    if (typeof authHash !== 'string' || !authHash) throw new Error('CUSTOMER_AUTH_INVALID_RESPONSE');

    const tokenForm = new URLSearchParams({ auth_hash: authHash });
    const tokenResponse = await this.fetchImpl(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: tokenForm,
    });
    if (!tokenResponse.ok) throw new Error('CUSTOMER_TOKEN_FAILED');

    const tokenData = await tokenResponse.json() as TokenResponse;
    const token = tokenData.data?.token;
    const uHash = tokenData.data?.u_hash;
    if (typeof token !== 'string' || !token || typeof uHash !== 'string' || !uHash) {
      throw new Error('CUSTOMER_TOKEN_INVALID_RESPONSE');
    }

    this.session = { token, u_hash: uHash };
    return { ...this.session };
  }
}
