import assert from 'node:assert/strict';
import test from 'node:test';
import { ThreadedApiError, ThreadedGateway } from '../src/threaded/ThreadedGateway.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('builds a read-only PKCE authorization URL', () => {
  const gateway = new ThreadedGateway({
    baseUrl: 'https://threaded.example',
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:3001/oauth/callback',
  });

  const url = new URL(
    gateway.getAuthorizationUrl({
      state: 'state-123',
      codeChallenge: 'challenge-123',
    }),
  );

  assert.equal(url.origin, 'https://threaded.example');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'client-123');
  assert.equal(url.searchParams.get('scope'), 'profile:read wallet:read');
  assert.equal(url.searchParams.get('state'), 'state-123');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge-123');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('exchanges a public-client authorization code using the PKCE verifier', async () => {
  const calls = [];
  const gateway = new ThreadedGateway({
    baseUrl: 'https://threaded.example',
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:3001/oauth/callback',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ access_token: 'access-123', token_type: 'Bearer' });
    },
  });

  const token = await gateway.exchangeAuthorizationCode({
    code: 'authorization-code',
    codeVerifier: 'verifier-123',
  });

  assert.equal(token.access_token, 'access-123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://threaded.example/oauth/token');
  assert.equal(calls[0].options.method, 'POST');

  const body = new URLSearchParams(calls[0].options.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('client_id'), 'client-123');
  assert.equal(body.get('code'), 'authorization-code');
  assert.equal(body.get('code_verifier'), 'verifier-123');
  assert.equal(body.has('client_secret'), false);
});

test('reads profile and authoritative Honey wallet through bearer auth', async () => {
  const calls = [];
  const gateway = new ThreadedGateway({
    baseUrl: 'https://threaded.example',
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:3001/oauth/callback',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });

      if (String(url).endsWith('/me')) {
        return jsonResponse({ data: { id: '42', display_name: 'Player' } });
      }

      return jsonResponse({ data: { currency: 'honey', balance: 130 } });
    },
  });

  const profile = await gateway.getCurrentUser('access-123');
  const wallet = await gateway.getWallet('access-123');

  assert.deepEqual(profile, { id: '42', display_name: 'Player' });
  assert.deepEqual(wallet, { currency: 'honey', balance: 130 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer access-123');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer access-123');
});

test('sends spend idempotency data through the gateway boundary', async () => {
  let captured;
  const gateway = new ThreadedGateway({
    baseUrl: 'https://threaded.example',
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:3001/oauth/callback',
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return jsonResponse({
        data: {
          transaction_id: 'tx-1',
          amount: -25,
          balance: 105,
          purpose: 'game:item_purchase',
          external_reference: 'purchase-1',
        },
      });
    },
  });

  const result = await gateway.spendPoints('access-123', {
    amount: 25,
    purpose: 'game:item_purchase',
    externalReference: 'purchase-1',
    idempotencyKey: 'purchase-uuid-1',
  });

  assert.equal(result.balance, 105);
  assert.equal(captured.url, 'https://threaded.example/api/v1/integrations/wallet/spends');
  assert.equal(captured.options.headers['Idempotency-Key'], 'purchase-uuid-1');
  assert.deepEqual(JSON.parse(captured.options.body), {
    amount: 25,
    purpose: 'game:item_purchase',
    external_reference: 'purchase-1',
  });
});

test('surfaces Threaded stable error codes', async () => {
  const gateway = new ThreadedGateway({
    baseUrl: 'https://threaded.example',
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:3001/oauth/callback',
    fetchImpl: async () =>
      jsonResponse(
        {
          error: {
            code: 'idempotency_conflict',
            message: 'The idempotency key was already used differently.',
          },
        },
        409,
      ),
  });

  await assert.rejects(
    () => gateway.getWallet('bad-token'),
    (error) => {
      assert.ok(error instanceof ThreadedApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'idempotency_conflict');
      return true;
    },
  );
});
