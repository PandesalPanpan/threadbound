import express from 'express';
import session from 'express-session';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from './oauth/pkce.js';
import { ThreadedApiError } from './threaded/ThreadedGateway.js';
import { EventBus } from './application/EventBus.js';
import { AchievementProjector } from './application/AchievementProjector.js';
import { GameService } from './application/GameService.js';
import { HoneyPurchaseService } from './application/HoneyPurchaseService.js';
import { PartyService } from './application/PartyService.js';

const LOCAL_PROFILES = Object.freeze({
  a: Object.freeze({ id: 'local:a', name: 'Local Weaver A', username: 'local-a' }),
  b: Object.freeze({ id: 'local:b', name: 'Local Weaver B', username: 'local-b' }),
  c: Object.freeze({ id: 'local:c', name: 'Local Weaver C', username: 'local-c' }),
  d: Object.freeze({ id: 'local:d', name: 'Local Weaver D', username: 'local-d' }),
});

function gamePage(authMode) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Threadbound</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;background:#111;color:#eee}button,input,select{padding:10px 14px;margin:4px}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.55}section{border:1px solid #444;border-radius:10px;padding:16px;margin:14px 0}.muted{color:#aaa}.item,.member{padding:10px;border:1px solid #555;border-radius:8px;margin:8px 0}.rare{border-color:#ddd}a{color:#9ecbff}.actions{display:flex;flex-wrap:wrap;gap:6px}</style></head><body><h1>Threadbound</h1><p class="muted">Persistent cooperative roguelite — guard allies, mend wounds, revive fallen Weavers.</p><div id="status" data-testid="app-status">Loading…</div><section id="identity"></section><section id="character"></section><section id="party"></section><section id="dungeon"></section><section id="inventory"></section><section id="achievements"></section><section id="world"></section><section id="honey"></section><form action="/disconnect" method="post"><button type="submit">Sign out</button></form><script>window.THREADBOUND_AUTH_MODE=${JSON.stringify(authMode)}</script><script type="module" src="/game.js"></script></body></html>`;
}

function localLoginForms() {
  return `<h2>Local development login</h2><p>No Threaded server is required. Open another private/incognito window and choose a different Weaver to test co-op locally.</p><div>${Object.entries(LOCAL_PROFILES).map(([slot, profile]) => `<form method="post" action="/auth/local" style="display:inline"><input type="hidden" name="slot" value="${slot}"><button type="submit" data-testid="local-login-${slot}">Enter as ${profile.name}</button></form>`).join('')}</div><p><small>Local auth is rejected when NODE_ENV=production. Honey purchases are unavailable because Threaded remains the authoritative wallet owner.</small></p>`;
}

function homePage({ connected, authMode }) {
  const login = authMode === 'local' ? localLoginForms() : '<p><a data-testid="threaded-login" href="/auth/threaded">Connect with Threaded</a></p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Threadbound</title></head><body style="font-family:system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 16px"><h1>Threadbound</h1><p>A separate persistent RPG. Production identity and Honey come from Threaded; standalone local auth is available only for development/testing.</p>${connected ? '<p>Connected successfully. <a data-testid="enter-game" href="/game">Enter Threadbound</a></p>' : login}</body></html>`;
}

export function createApp({ config, threadedGateway, repository }) {
  const app = express();
  const eventBus = new EventBus();
  const achievements = new AchievementProjector(repository);
  eventBus.subscribe((event) => achievements.handle(event));
  const gameService = new GameService({ repository, eventBus });
  const partyService = new PartyService({ repository });
  const purchaseService = threadedGateway ? new HoneyPurchaseService({ repository, threadedGateway }) : null;

  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '4kb' }));
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static('public'));
  app.use(session({ name: 'threadbound.sid', secret: config.sessionSecret, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 60 * 60 * 1000 } }));

  const requireConnection = (request, response, next) => {
    if (!request.session.threaded?.playerId) return response.status(401).json({ error: 'identity_not_connected', message: 'Sign in to Threadbound first.' });
    next();
  };

  app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'threadbound', auth_mode: config.authMode }));
  app.get('/', (request, response) => response.type('html').send(homePage({ connected: Boolean(request.session.threaded), authMode: config.authMode })));
  app.get('/game', (request, response) => request.session.threaded ? response.type('html').send(gamePage(config.authMode)) : response.redirect('/'));

  app.post('/auth/local', (request, response) => {
    if (config.authMode !== 'local') return response.status(404).send('Not found');
    const slot = String(request.body?.slot || '').toLowerCase();
    const profile = LOCAL_PROFILES[slot];
    if (!profile) return response.status(422).json({ error: 'invalid_local_profile', message: 'Choose one of the configured local Weaver profiles.' });
    const player = gameService.ensurePlayer(profile);
    request.session.threaded = {
      source: 'local',
      accessToken: null,
      profile,
      wallet: { balance: null, lifetime_earned: null, unavailable: true },
      playerId: player.id,
      connectedAt: new Date().toISOString(),
    };
    return response.redirect('/game');
  });

  app.get('/auth/threaded', (request, response) => {
    if (config.authMode !== 'threaded' || !threadedGateway) return response.status(404).send('Not found');
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const state = createOAuthState();
    request.session.oauth = { codeVerifier, state };
    response.redirect(threadedGateway.getAuthorizationUrl({ state, codeChallenge, scopes: ['profile:read', 'wallet:read', 'wallet:spend'] }));
  });

  app.get('/oauth/callback', async (request, response) => {
    if (config.authMode !== 'threaded' || !threadedGateway) return response.status(404).send('Not found');
    const pending = request.session.oauth;
    const { code, state, error, error_description: errorDescription } = request.query;
    if (error) { delete request.session.oauth; return response.status(400).json({ error: 'oauth_authorization_failed', message: errorDescription || String(error) }); }
    if (!pending || !state || state !== pending.state) { delete request.session.oauth; return response.status(400).json({ error: 'invalid_oauth_state', message: 'OAuth state did not match the session that started the login.' }); }
    if (!code) { delete request.session.oauth; return response.status(400).json({ error: 'missing_authorization_code', message: 'Threaded did not return an authorization code.' }); }
    try {
      const token = await threadedGateway.exchangeAuthorizationCode({ code: String(code), codeVerifier: pending.codeVerifier });
      const [profile, wallet] = await Promise.all([threadedGateway.getCurrentUser(token.access_token), threadedGateway.getWallet(token.access_token)]);
      const player = gameService.ensurePlayer(profile);
      request.session.threaded = { source: 'threaded', accessToken: token.access_token, profile, wallet, playerId: player.id, connectedAt: new Date().toISOString() };
      delete request.session.oauth;
      return response.redirect('/game');
    } catch (caught) {
      delete request.session.oauth;
      if (caught instanceof ThreadedApiError) return response.status(caught.status || 502).json({ error: caught.code || 'threaded_api_error', message: caught.message });
      throw caught;
    }
  });

  app.get('/connected', (request, response) => {
    const connection = request.session.threaded;
    if (!connection) return response.status(401).json({ connected: false, message: 'Sign in first.' });
    return response.json({ connected: true, source: connection.source || 'threaded', identity: connection.profile, threaded_user: connection.source === 'local' ? null : connection.profile, wallet: connection.wallet, player_id: connection.playerId, connected_at: connection.connectedAt });
  });

  app.get('/api/dashboard', requireConnection, (request, response) => {
    const connection = request.session.threaded;
    response.json({ authSource: connection.source || 'threaded', threadedUser: connection.profile, wallet: connection.wallet, ...gameService.dashboard(connection.playerId) });
  });

  app.post('/api/party/create', requireConnection, (request, response) => response.status(201).json({ party: partyService.createParty(request.session.threaded.playerId) }));
  app.post('/api/party/join', requireConnection, (request, response) => response.json({ party: partyService.joinParty(request.session.threaded.playerId, request.body?.joinCode) }));
  app.post('/api/party/ready', requireConnection, (request, response) => response.json({ party: partyService.setReady(request.session.threaded.playerId, Boolean(request.body?.ready)) }));
  app.post('/api/party/leave', requireConnection, (request, response) => { partyService.leaveParty(request.session.threaded.playerId); response.json({ party: null }); });

  app.post('/api/dungeons/:dungeonId/start', requireConnection, (request, response) => response.status(201).json({ run: gameService.startDungeon(request.session.threaded.playerId, request.params.dungeonId) }));
  app.post('/api/runs/:runId/attack', requireConnection, (request, response) => response.json(gameService.attack(request.session.threaded.playerId, request.params.runId)));
  app.post('/api/runs/:runId/guard', requireConnection, (request, response) => response.json(gameService.guard(request.session.threaded.playerId, request.params.runId)));
  app.post('/api/runs/:runId/mend', requireConnection, (request, response) => response.json(gameService.mend(request.session.threaded.playerId, request.params.runId, String(request.body?.targetPlayerId || ''))));
  app.post('/api/runs/:runId/revive', requireConnection, (request, response) => response.json(gameService.revive(request.session.threaded.playerId, request.params.runId, String(request.body?.targetPlayerId || ''))));
  app.post('/api/runs/:runId/upgrade', requireConnection, (request, response) => response.json({ run: gameService.chooseUpgrade(request.session.threaded.playerId, request.params.runId, String(request.body?.upgradeId || '')) }));
  app.post('/api/items/:itemId/equip', requireConnection, (request, response) => response.json(gameService.equipItem(request.session.threaded.playerId, request.params.itemId)));

  const purchaseHandler = async (request, response) => {
    const connection = request.session.threaded;
    if (connection.source === 'local' || !purchaseService) return response.status(409).json({ error: 'threaded_wallet_unavailable', message: 'Honey purchases require Threaded auth because Threaded owns the authoritative Honey wallet.' });
    const idempotencyKey = String(request.get('Idempotency-Key') || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) return response.status(422).json({ error: 'invalid_idempotency_key', message: 'Idempotency-Key must be between 8 and 128 characters.' });
    try {
      const result = await purchaseService.purchaseTrainingCache({ playerId: connection.playerId, threadedUserId: connection.profile.id, accessToken: connection.accessToken, idempotencyKey });
      request.session.threaded.wallet = { ...connection.wallet, balance: result.spend.balance };
      return response.status(result.grantApplied ? 201 : 200).json({ ok: true, item: result.item || repository.getItem(result.grant.itemInstanceId), wallet: request.session.threaded.wallet, threaded_transaction_id: result.spend.transaction_id, grant_applied: result.grantApplied, grant_count: 1 });
    } catch (caught) {
      if (caught instanceof ThreadedApiError) return response.status(caught.status || 502).json({ error: caught.code || 'threaded_api_error', message: caught.message });
      if (caught.code === 'purchase_replay_mismatch') return response.status(409).json({ error: caught.code, message: caught.message });
      throw caught;
    }
  };

  app.post('/api/honey/purchases/training-cache', requireConnection, purchaseHandler);
  app.post('/spike/purchases/demo-item', requireConnection, purchaseHandler);
  app.post('/disconnect', (request, response, next) => request.session.destroy((error) => error ? next(error) : response.redirect('/')));

  app.use((error, _request, response, _next) => {
    console.error(error);
    const knownMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = error?.code === 'stale_run_version' || /not found|Unknown|active dungeon|active run|party|leader|ready|member|participant|cannot act|Mend|Revive|only be chosen|not currently in combat|full|state changed/i.test(knownMessage) ? 409 : 500;
    response.status(status).json({ error: error?.code || (status === 409 ? 'game_rule_violation' : 'internal_error'), message: knownMessage });
  });

  return app;
}
