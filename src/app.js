import express from 'express';
import session from 'express-session';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from './oauth/pkce.js';
import { ThreadedApiError } from './threaded/ThreadedGateway.js';
import { EventBus } from './application/EventBus.js';
import { AchievementProjector } from './application/AchievementProjector.js';
import { GameService } from './application/GameService.js';
import { HoneyPurchaseService } from './application/HoneyPurchaseService.js';

function gamePage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Threadbound</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 16px;background:#111;color:#eee}button{padding:10px 14px;margin:4px;cursor:pointer}section{border:1px solid #444;border-radius:10px;padding:16px;margin:14px 0}.muted{color:#aaa}.item{padding:10px;border:1px solid #555;border-radius:8px;margin:8px 0}.rare{border-color:#ddd}a{color:#9ecbff}</style></head><body><h1>Threadbound</h1><p class="muted">Persistent roguelite vertical slice — the world remembers.</p><div id="status">Loading…</div><section id="identity"></section><section id="character"></section><section id="dungeon"></section><section id="inventory"></section><section id="achievements"></section><section id="world"></section><section id="honey"></section><form action="/disconnect" method="post"><button type="submit">Disconnect Threaded</button></form><script type="module" src="/game.js"></script></body></html>`;
}

function homePage(connected) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Threadbound</title></head><body style="font-family:system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 16px"><h1>Threadbound</h1><p>A separate persistent RPG connected to Threaded identity and the authoritative Honey wallet.</p>${connected ? '<p>Connected successfully. <a href="/game">Enter Threadbound</a></p>' : '<p><a href="/auth/threaded">Connect with Threaded</a></p>'}</body></html>`;
}

export function createApp({ config, threadedGateway, repository }) {
  const app = express();
  const eventBus = new EventBus();
  const achievements = new AchievementProjector(repository);
  eventBus.subscribe((event) => achievements.handle(event));
  const gameService = new GameService({ repository, eventBus });
  const purchaseService = new HoneyPurchaseService({ repository, threadedGateway });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static('public'));
  app.use(session({ name: 'threadbound.sid', secret: config.sessionSecret, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 60 * 60 * 1000 } }));

  const requireConnection = (request, response, next) => {
    if (!request.session.threaded?.playerId) return response.status(401).json({ error: 'threaded_not_connected', message: 'Connect with Threaded first.' });
    next();
  };

  app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'threadbound' }));
  app.get('/', (request, response) => response.type('html').send(homePage(Boolean(request.session.threaded))));
  app.get('/game', (request, response) => request.session.threaded ? response.type('html').send(gamePage()) : response.redirect('/'));

  app.get('/auth/threaded', (request, response) => {
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const state = createOAuthState();
    request.session.oauth = { codeVerifier, state };
    response.redirect(threadedGateway.getAuthorizationUrl({ state, codeChallenge, scopes: ['profile:read', 'wallet:read', 'wallet:spend'] }));
  });

  app.get('/oauth/callback', async (request, response) => {
    const pending = request.session.oauth;
    const { code, state, error, error_description: errorDescription } = request.query;
    if (error) { delete request.session.oauth; return response.status(400).json({ error: 'oauth_authorization_failed', message: errorDescription || String(error) }); }
    if (!pending || !state || state !== pending.state) { delete request.session.oauth; return response.status(400).json({ error: 'invalid_oauth_state', message: 'OAuth state did not match the session that started the login.' }); }
    if (!code) { delete request.session.oauth; return response.status(400).json({ error: 'missing_authorization_code', message: 'Threaded did not return an authorization code.' }); }
    try {
      const token = await threadedGateway.exchangeAuthorizationCode({ code: String(code), codeVerifier: pending.codeVerifier });
      const [profile, wallet] = await Promise.all([threadedGateway.getCurrentUser(token.access_token), threadedGateway.getWallet(token.access_token)]);
      const player = gameService.ensurePlayer(profile);
      request.session.threaded = { accessToken: token.access_token, profile, wallet, playerId: player.id, connectedAt: new Date().toISOString() };
      delete request.session.oauth;
      return response.redirect('/game');
    } catch (caught) {
      delete request.session.oauth;
      if (caught instanceof ThreadedApiError) return response.status(caught.status || 502).json({ error: caught.code || 'threaded_api_error', message: caught.message });
      throw caught;
    }
  });

  app.get('/connected', (request, response) => {
    if (!request.session.threaded) return response.status(401).json({ connected: false, message: 'Connect with Threaded first.' });
    return response.json({ connected: true, threaded_user: request.session.threaded.profile, wallet: request.session.threaded.wallet, player_id: request.session.threaded.playerId, connected_at: request.session.threaded.connectedAt });
  });

  app.get('/api/dashboard', requireConnection, (request, response) => response.json({ threadedUser: request.session.threaded.profile, wallet: request.session.threaded.wallet, ...gameService.dashboard(request.session.threaded.playerId) }));
  app.post('/api/dungeons/:dungeonId/start', requireConnection, (request, response) => response.status(201).json({ run: gameService.startDungeon(request.session.threaded.playerId, request.params.dungeonId) }));
  app.post('/api/runs/:runId/attack', requireConnection, (request, response) => response.json(gameService.attack(request.session.threaded.playerId, request.params.runId)));
  app.post('/api/runs/:runId/upgrade', requireConnection, (request, response) => response.json({ run: gameService.chooseUpgrade(request.session.threaded.playerId, request.params.runId, String(request.body?.upgradeId || '')) }));
  app.post('/api/items/:itemId/equip', requireConnection, (request, response) => response.json(gameService.equipItem(request.session.threaded.playerId, request.params.itemId)));

  const purchaseHandler = async (request, response) => {
    const connection = request.session.threaded;
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
    const status = /not found|Unknown|active run|only be chosen|not currently in combat/i.test(knownMessage) ? 409 : 500;
    response.status(status).json({ error: status === 409 ? 'game_rule_violation' : 'internal_error', message: knownMessage });
  });

  return app;
}
