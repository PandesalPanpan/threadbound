import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const port = Number(process.env.FAKE_THREADED_PORT || 4100);
const codes = new Map();
const spends = new Map();
let balance = 100;
const accessToken = 'fake-threaded-token';

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function authorized(request) {
  return request.headers.authorization === `Bearer ${accessToken}`;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);

  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });

  if (request.method === 'GET' && url.pathname === '/oauth/authorize') {
    const params = Object.fromEntries(url.searchParams);
    response.writeHead(200, { 'Content-Type': 'text/html' });
    return response.end(`<!doctype html><html><body><h1>Fake Threaded</h1><p>Threadbound requests: ${params.scope}</p><form method="get" action="/oauth/approve"><input type="hidden" name="redirect_uri" value="${params.redirect_uri}"><input type="hidden" name="state" value="${params.state}"><input type="hidden" name="code_challenge" value="${params.code_challenge}"><button type="submit">Authorize Threadbound</button></form></body></html>`);
  }

  if (request.method === 'GET' && url.pathname === '/oauth/approve') {
    const code = randomUUID();
    codes.set(code, { codeChallenge: url.searchParams.get('code_challenge') });
    const redirect = new URL(url.searchParams.get('redirect_uri'));
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', url.searchParams.get('state'));
    response.writeHead(302, { Location: redirect.toString() });
    return response.end();
  }

  if (request.method === 'POST' && url.pathname === '/oauth/token') {
    const body = new URLSearchParams(await readBody(request));
    const pending = codes.get(body.get('code'));
    const challenge = createHash('sha256').update(body.get('code_verifier') || '').digest('base64url');
    if (!pending || pending.codeChallenge !== challenge) return sendJson(response, 400, { error: { code: 'invalid_grant', message: 'PKCE verification failed.' } });
    return sendJson(response, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: 3600 });
  }

  if (!authorized(request)) return sendJson(response, 401, { error: { code: 'unauthenticated', message: 'Missing fake bearer token.' } });

  if (request.method === 'GET' && url.pathname === '/api/v1/integrations/me') return sendJson(response, 200, { data: { id: 1001, name: 'E2E Weaver', username: 'e2e-weaver' } });
  if (request.method === 'GET' && url.pathname === '/api/v1/integrations/wallet') return sendJson(response, 200, { data: { balance, lifetime_earned: 100 } });

  if (request.method === 'POST' && url.pathname === '/api/v1/integrations/wallet/spends') {
    const key = String(request.headers['idempotency-key'] || '');
    if (!key) return sendJson(response, 422, { error: { code: 'missing_idempotency_key', message: 'Missing key.' } });
    if (spends.has(key)) return sendJson(response, 200, { data: spends.get(key) });
    const payload = JSON.parse(await readBody(request));
    if (payload.amount > balance) return sendJson(response, 409, { error: { code: 'insufficient_honey', message: 'Not enough Honey.' } });
    balance -= payload.amount;
    const spend = { transaction_id: `fake-txn-${spends.size + 1}`, amount: payload.amount, balance };
    spends.set(key, spend);
    return sendJson(response, 201, { data: spend });
  }

  return sendJson(response, 404, { error: { code: 'not_found', message: 'Fake Threaded route not found.' } });
});

server.listen(port, '127.0.0.1', () => console.log(`Fake Threaded listening on ${port}`));
