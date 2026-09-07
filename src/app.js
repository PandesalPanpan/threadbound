import express from 'express';
import session from 'express-session';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from './oauth/pkce.js';
import { ThreadedApiError } from './threaded/ThreadedGateway.js';
import { EventBus } from './application/EventBus.js';
import { AchievementProjector } from './application/AchievementProjector.js';
import { WorldHistoryProjector } from './application/WorldHistoryProjector.js';
import { CodexService } from './application/CodexService.js';
import { GameService } from './application/GameService.js';
import { HoneyPurchaseService } from './application/HoneyPurchaseService.js';
import { PartyService } from './application/PartyService.js';

const LOCAL_PROFILES = Object.freeze({
  a: Object.freeze({ id: 'local:a', name: 'Local Weaver A', username: 'local-a' }),
  b: Object.freeze({ id: 'local:b', name: 'Local Weaver B', username: 'local-b' }),
  c: Object.freeze({ id: 'local:c', name: 'Local Weaver C', username: 'local-c' }),
  d: Object.freeze({ id: 'local:d', name: 'Local Weaver D', username: 'local-d' }),
});

function topNav(active) {
  return `<nav style="display:flex;gap:12px;margin:0 0 18px"><a data-testid="nav-game" href="/game"${active === 'game' ? ' aria-current="page"' : ''}>Game</a><a data-testid="nav-codex" href="/codex"${active === 'codex' ? ' aria-current="page"' : ''}>Codex</a></nav>`;
}

function gamePage(authMode) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Threadbound</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;background:#111;color:#eee}button,input,select{padding:10px 14px;margin:4px}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.55}section{border:1px solid #444;border-radius:10px;padding:16px;margin:14px 0}.muted{color:#aaa}.item,.member{padding:10px;border:1px solid #555;border-radius:8px;margin:8px 0}.rare{border-color:#ddd}a{color:#9ecbff}.actions{display:flex;flex-wrap:wrap;gap:6px}</style></head><body>${topNav('game')}<h1>Threadbound</h1><p class="muted">Persistent cooperative roguelite — guard allies, mend wounds, revive fallen Weavers.</p><div id="status" data-testid="app-status">Loading…</div><section id="identity"></section><section id="character"></section><section id="party"></section><section id="dungeon"></section><section id="inventory"></section><section id="achievements"></section><section id="world"></section><section id="honey"></section><form action="/disconnect" method="post"><button type="submit">Sign out</button></form><script>window.THREADBOUND_AUTH_MODE=${JSON.stringify(authMode)}</script><script type="module" src="/game.js"></script></body></html>`;
}

function codexPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Threadbound Codex</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;background:#0d0d0f;color:#eee}a{color:#9ecbff}.shell{max-width:1180px;margin:0 auto;padding:24px}.hero{padding:24px 0 12px}.hero h1{margin:0 0 8px;font-size:2rem}.muted{color:#aaa}.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:18px 0}.toolbar input{flex:1;min-width:220px;padding:12px;border:1px solid #444;border-radius:10px;background:#18181c;color:#eee}.tabs{display:flex;gap:8px;flex-wrap:wrap}.tabs button{padding:9px 12px;border:1px solid #444;border-radius:999px;background:#17171b;color:#eee;cursor:pointer}.tabs button[aria-pressed="true"]{background:#eee;color:#111}.counts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 20px}.count{font-size:.85rem;padding:6px 9px;background:#19191e;border-radius:999px}.layout{display:grid;grid-template-columns:minmax(280px,420px) 1fr;gap:18px}.list,.detail{border:1px solid #34343a;border-radius:14px;background:#121216;min-height:520px}.list{padding:10px;max-height:72vh;overflow:auto}.entry{display:block;width:100%;text-align:left;padding:14px;border:0;border-bottom:1px solid #29292f;background:transparent;color:#eee;cursor:pointer}.entry:hover,.entry[aria-selected="true"]{background:#1b1b21}.badge{display:inline-block;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;padding:4px 7px;border-radius:999px;background:#282832;color:#ccc}.entry h3{margin:8px 0 5px}.entry p{margin:0;color:#aaa}.detail{padding:24px;overflow:auto}.detail h2{font-size:1.8rem;margin-top:10px}.detail .body{line-height:1.65;white-space:pre-wrap}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:18px 0}.meta div{padding:10px;border:1px solid #333;border-radius:10px}.empty{padding:28px;color:#aaa}@media(max-width:780px){.layout{grid-template-columns:1fr}.list{max-height:44vh}.detail{min-height:320px}}
  </style></head><body><div class="shell">${topNav('codex')}<header class="hero"><h1>Threadbound Codex</h1><p class="muted">The living record of discovered relics, enemies, bosses, achievements, lore, and world history.</p></header><div id="codex-status" data-testid="codex-status">Loading…</div><div class="toolbar"><input id="codex-search" data-testid="codex-search" type="search" placeholder="Search the Loom…" autocomplete="off"><div id="codex-tabs" class="tabs"></div></div><div id="codex-counts" class="counts"></div><main class="layout"><section id="codex-list" class="list" aria-label="Codex entries"></section><article id="codex-detail" class="detail" data-testid="codex-detail"></article></main></div><script type="module" src="/codex.js"></script></body></html>`;
}

function localLoginForms() {
  return `<h2>Local development login</h2><p>No Threaded server is required. Open another private/incognito window and choose a different Weaver to test co-op locally.</p><div>${Object.entries(LOCAL_PROFILES).map(([slot, profile]) => `<form method="post" action="/auth/local" style="display:inline"><input type="hidden" name="slot" value="${slot}"><button type="submit" data-testid="local-login-${slot}">Enter as ${profile.name}</button></form>`).join('')}</div><p><small>Local auth is rejected when NODE_ENV=production. Honey purchases are unavailable because Threaded remains the authoritative wallet owner.</small></p>`;
}

function homePage({ connected, authMode }) {
  const login = authMode === 'local' ? localLoginForms() : '<p><a data-testid="threaded-login" href="/auth/threaded">Connect with Threaded</a></p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Threadbound</title></head><body style="font-family:system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 16px"><h1>Threadbound</h1><p>A separate persistent RPG. Production identity and Honey come from Threaded; standalone local auth is available only for development/testing.</p>${connected ? '<p>Connected successfully. <a data-testid="enter-game" href="/game">Enter Threadbound</a> · <a href="/codex">Open Codex</a></p>' : login}</body></html>`;
}

export function createApp({ config, threadedGateway, repository, codexRepository }) {
  const app = express();
  const eventBus = new EventBus();
  const achievements = new AchievementProjector(repository);
  const history = new WorldHistoryProjector({ gameRepository: repository, codexRepository });
  eventBus.subscribe((event) => achievements.handle(event));
  eventBus.subscribe((event) => history.handle(event));
  const gameService = new GameService({ repository, eventBus });
  const partyService = new PartyService({ repository });
  const codexService = new CodexService({ gameRepository: repository, codexRepository });
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
  app.get('/codex', (request, response) => request.session.threaded ? response.type('html').send(codexPage()) : response.redirect('/'));

  app.post('/auth/local', (request, response) => {
    if (config.authMode !== 'local') return response.status(404).send('Not found');
    const slot = String(request.body?.slot || '').toLowerCase();
    const profile = LOCAL_PROFILES[slot];
    if (!profile) return response.status(422).json({ error: 'invalid_local_profile', message: 'Choose one of the configured local Weaver profiles.' });
    const player = gameService.ensurePlayer(profile);
    request.session.threaded = { source: 'local', accessToken: null, profile, wallet: { balance: null, lifetime_earned: null, unavailable: true }, playerId: player.id, connectedAt: new Date().toISOString() };
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

  app.get('/api/codex', requireConnection, (request, response) => {
    const category = String(request.query.category || 'all').toLowerCase();
    const query = String(request.query.q || '').slice(0, 120);
    response.json(codexService.browse(request.session.threaded.playerId, { category, query }));
  });
  app.get('/api/codex/:category/:id', requireConnection, (request, response) => {
    const entry = codexService.detail(request.session.threaded.playerId, String(request.params.category).toLowerCase(), String(request.params.id));
    if (!entry) return response.status(404).json({ error: 'codex_entry_not_found', message: 'Codex entry not found.' });
    return response.json({ entry });
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
