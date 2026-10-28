/**
 * Browser-side customer session for the MultiBot children API.
 *
 * Credentials belong to the signed-in customer. Do not put bot/service credentials here,
 * persist tokens in localStorage, or fall back to a shared service account.
 */
export interface NannyCustomerSession {
  token: string;
  u_hash: string;
}

export interface NannyApiConfig {
  /** Full API base, including /api/v1. Use the dev2 URL for integration testing. */
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class NannyCustomerApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private session: NannyCustomerSession | null = null;

  constructor(config: NannyApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\\/+$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  get authenticated(): boolean {
    return Boolean(this.session?.token && this.session?.u_hash);
  }

  /**
   * Uses the platform's existing auth-hash -> token flow.
   * Password and auth_hash are never retained after the request.
   */
  async login(login: string, password: string): Promise<void> {
    if (!login.trim() || !password) throw new Error('LOGIN_FIELDS_REQUIRED');

    const authParams = new URLSearchParams({
      login,
      password,
      type: 'e-mail',
    });
    const authResponse = await this.fetchImpl(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: authParams,
    });
    if (!authResponse.ok) throw new Error('AUTH_FAILED');

    const auth = await authResponse.json() as { auth_hash?: string };
    if (!auth.auth_hash) throw new Error('AUTH_HASH_MISSING');

    const tokenResponse = await this.fetchImpl(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ auth_hash: auth.auth_hash }),
    });
    if (!tokenResponse.ok) throw new Error('TOKEN_REQUEST_FAILED');

    const tokenData = await tokenResponse.json() as {
      data?: { token?: string; u_hash?: string };
    };
    const token = tokenData.data?.token;
    const u_hash = tokenData.data?.u_hash;
    if (!token || !u_hash) throw new Error('TOKEN_RESPONSE_INVALID');

    // Replace the previous session atomically only after both steps succeed.
    this.session = { token, u_hash };
  }

  logout(): void {
    this.session = null;
  }

  /**
   * Call an existing public script template with the signed-in customer's session.
   * The template contract remains owned by MultiBot; callers must supply its documented
   * s_t_data shape. No privileged bot token is ever injected.
   */
  async callTemplate<T = unknown>(
    templateName: string,
    s_t_data: Record<string, unknown>,
    extraFields: Record<string, string> = {},
  ): Promise<T> {
    if (!this.session) throw new Error('CUSTOMER_LOGIN_REQUIRED');
    if (!/^[a-zA-Z0-9_-]+$/.test(templateName)) throw new Error('INVALID_TEMPLATE_NAME');

    const form = new URLSearchParams({
      token: this.session.token,
      u_hash: this.session.u_hash,
      is_var: '1',
      s_t_data: JSON.stringify(s_t_data),
      ...extraFields,
    });
    const response = await this.fetchImpl(
      `${this.baseUrl}/script/template/${encodeURIComponent(templateName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: form,
      },
    );
    if (!response.ok) throw new Error(`TEMPLATE_HTTP_${response.status}`);
    return await response.json() as T;
  }

  /**
   * Use for existing customer-authorized API routes such as nanny search and set_offer.
   * The caller supplies the exact endpoint and documented form fields.
   */
  async postForm<T = unknown>(path: string, fields: Record<string, string>): Promise<T> {
    if (!this.session) throw new Error('CUSTOMER_LOGIN_REQUIRED');
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) {
      throw new Error('INVALID_API_PATH');
    }
    const form = new URLSearchParams({
      token: this.session.token,
      u_hash: this.session.u_hash,
      ...fields,
    });
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form,
    });
    if (!response.ok) throw new Error(`API_HTTP_${response.status}`);
    return await response.json() as T;
  }
}
