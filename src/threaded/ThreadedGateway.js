export class ThreadedApiError extends Error {
  constructor(message, { status, code = null, payload = null } = {}) {
    super(message);
    this.name = 'ThreadedApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export class ThreadedGateway {
  constructor({ baseUrl, clientId, redirectUri, fetchImpl = globalThis.fetch }) {
    if (!baseUrl || !clientId || !redirectUri) {
      throw new Error('baseUrl, clientId, and redirectUri are required.');
    }

    if (typeof fetchImpl !== 'function') {
      throw new Error('A fetch implementation is required.');
    }

    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.fetch = fetchImpl;
  }

  getAuthorizationUrl({ state, codeChallenge, scopes = ['profile:read', 'wallet:read'] }) {
    const url = new URL('/oauth/authorize', `${this.baseUrl}/`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.toString();
  }

  async exchangeAuthorizationCode({ code, codeVerifier }) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code,
      code_verifier: codeVerifier,
    });

    return this.#request('/oauth/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  }

  async getCurrentUser(accessToken) {
    const payload = await this.#authorizedRequest('/api/v1/integrations/me', accessToken);
    return payload.data;
  }

  async getWallet(accessToken) {
    const payload = await this.#authorizedRequest('/api/v1/integrations/wallet', accessToken);
    return payload.data;
  }

  async spendPoints(accessToken, { amount, purpose, externalReference, idempotencyKey }) {
    const payload = await this.#authorizedRequest(
      '/api/v1/integrations/wallet/spends',
      accessToken,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          amount,
          purpose,
          external_reference: externalReference,
        }),
      },
    );

    return payload.data;
  }

  #authorizedRequest(path, accessToken, options = {}) {
    return this.#request(path, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  }

  async #request(path, options) {
    const response = await this.fetch(new URL(path, `${this.baseUrl}/`), options);
    const text = await response.text();

    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      throw new ThreadedApiError(
        payload?.message || payload?.error?.message || `Threaded request failed with ${response.status}.`,
        {
          status: response.status,
          code: payload?.error?.code ?? null,
          payload,
        },
      );
    }

    return payload;
  }
}
