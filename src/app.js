import { readFile } from 'node:fs/promises';
import express from 'express';
import session from 'express-session';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from './oauth/pkce.js';
import { ThreadedApiError } from './threaded/ThreadedGateway.js';
import { EventBus } from './application/EventBus.js';
import { AchievementProjector } from './application/AchievementProjector.js';
import { ArcAchievementProjector } from './application/ArcAchievementProjector.js';
import { WorldHistoryProjector } from './application/WorldHistoryProjector.js';
import { CodexService } from './application/CodexService.js';
import { ArcManifestService } from './application/ArcManifestService.js';
import { ActivityStreamService } from './application/ActivityStreamService.js';
import { CombatPreviewService } from './application/CombatPreviewService.js';
import { GameService } from './application/GameService.js';
import { HuntService } from './application/HuntService.js';
import { SimpleDungeonService } from './application/SimpleDungeonService.js';
import { HoneyPurchaseService } from './application/HoneyPurchaseService.js';
import { InventoryService } from './application/InventoryService.js';
import { PartyService } from './application/PartyService.js';
import { RunCommandIdempotencyService } from './application/RunCommandIdempotencyService.js';
import { VISUAL_ASSETS, VISUAL_ASSET_CATALOG_VERSION } from './content/VisualAssetCatalog.js';
import { decorateRunUpgradeOffers } from './domain/RunUpgradeOfferPolicy.js';
import { RealtimeHub } from './infrastructure/RealtimeHub.js';
import { SQLiteActivityStreamRepository } from './infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteInventoryRepository } from './infrastructure/SQLiteInventoryRepository.js';
import { SQLiteRunCommandRepository } from './infrastructure/SQLiteRunCommandRepository.js';
import { SQLiteSessionStore } from './infrastructure/SQLiteSessionStore.js';

const LOCAL_PROFILES = Object.freeze({
  a: Object.freeze({ id: 'local:a', name: 'Local Weaver A', username: 'local-a' }),
  b: Object.freeze({ id: 'local:b', name: 'Local Weaver B', username: 'local-b' }),
  c: Object.freeze({ id: 'local:c', name: 'Local Weaver C', username: 'local-c' }),
  d: Object.freeze({ id: 'local:d', name: 'Local Weaver D', username: 'local-d' }),
});
const INITIAL_STREAM_LIMIT = 30;

function sharedHead(title) {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1020"><title>${title}</title><link rel="stylesheet" href="/threadbound-theme.css">`;
}

function topNav(active, authMode = 'threaded') {
  const workshop = authMode === 'local' ? `<a data-testid="nav-workshop" href="/arc-workshop"${active === 'workshop' ? ' aria-current="page"' : ''}>Workshop</a>` : '';
  return `<nav class="threadbound-topnav" aria-label="Threadbound"><a class="brand" href="/game">THREADBOUND</a><div class="nav-links"><a data-testid="nav-game" href="/game"${active === 'game' ? ' aria-current="page"' : ''}>Play</a><a data-testid="nav-codex" href="/codex"${active === 'codex' ? ' aria-current="page"' : ''}>Codex</a>${workshop}</div></nav>`;
}

function gamePage(authMode) {
  return `<!doctype html><html lang="en"><head>${sharedHead('Threadbound')}<link rel="stylesheet" href="/adventure-stream.css"></head><body>${topNav('game', authMode)}<main class="threadbound-page threadbound-game-page"><header class="page-hero"><div><span class="eyebrow">THE LOOM IS MOVING</span><h1>Threadbound</h1><p>Hunt for gear, grow stronger, then challenge dangerous dungeons with your party.</p></div></header><div id="status" data-testid="app-status">Loading…</div><section id="identity"></section><section id="stream" data-testid="adventure-stream"></section><section id="character"></section><section id="party"></section><section id="dungeon"></section><section id="inventory"></section><section id="achievements"></section><section id="world"></section><section id="honey"></section><form class="signout" action="/disconnect" method="post"><button type="submit">Sign out</button></form></main><script>window.THREADBOUND_AUTH_MODE=${JSON.stringify(authMode)}</script><script src="/run-command-idempotency.js"></script><script type="module" src="/game.js"></script><script type="module" src="/adventure-stream.js"></script><script type="module" src="/adventure-meta-commands.js"></script><script type="module" src="/simple-loop.js"></script></body></html>`;
}

function codexPage(authMode) {
  return `<!doctype html><html lang="en"><head>${sharedHead('Threadbound Codex')}</head><body>${topNav('codex', authMode)}<main class="threadbound-page codex-shell"><header class="page-hero"><div><span class="eyebrow">LIVING ARCHIVE</span><h1>Codex</h1><p>Relics, enemies, bosses, achievements, lore, and history from the same evolving world.</p></div></header><div id="codex-status" data-testid="codex-status">Loading…</div><div class="toolbar"><input id="codex-search" data-testid="codex-search" type="search" placeholder="Search the Loom…" autocomplete="off"><div id="codex-tabs" class="tabs"></div></div><div id="codex-counts" class="counts"></div><div class="codex-layout"><section id="codex-list" class="codex-list" aria-label="Codex entries"></section><article id="codex-detail" class="codex-detail" data-testid="codex-detail"></article></div></main><script type="module" src="/codex.js"></script></body></html>`;
}

function arcWorkshopPage(authMode) {
  return `<!doctype html><html lang="en"><head>${sharedHead('Threadbound Arc Workshop')}</head><body>${topNav('workshop', authMode)}<main class="threadbound-page workshop-shell"><header class="page-hero"><div><span class="eyebrow">WORLD AUTHORING</span><h1>Arc Workshop</h1><p>Bring an Arc Manifest from ChatGPT, Claude, Gemini, a local model, or a human-written JSON file.</p></div></header><div class="notice"><strong>No paid AI API required.</strong> Download the world context and JSON Schema, give both to your preferred AI, then upload the returned JSON here. Uploading never publishes automatically.</div><div class="actions"><button id="download-context" data-testid="download-world-context">Download world context</button><button id="download-schema" data-testid="download-manifest-schema">Download JSON Schema</button></div><div id="workshop-status" data-testid="workshop-status">Loading…</div><div class="workshop-grid"><main><section class="panel"><h2>1. Upload or paste</h2><input id="manifest-file" data-testid="manifest-file" type="file" accept="application/json,.json"><p class="muted">Maximum 512 KB. The browser reads the JSON and sends it to Threadbound's validator.</p><textarea id="manifest-editor" data-testid="manifest-editor" spellcheck="false" placeholder="Paste arc-manifest.json here…"></textarea><div class="actions"><button id="validate-manifest" data-testid="validate-manifest">Validate</button><button id="save-manifest" data-testid="save-manifest" disabled>Save valid draft</button></div></section><section class="panel"><h2>2. Validation</h2><div id="validation-result" data-testid="validation-result"><p class="muted">Validate a manifest to see errors and warnings.</p></div></section></main><aside><section class="panel"><h2>Impact preview</h2><div id="manifest-preview" data-testid="manifest-preview"><p class="muted">No manifest loaded.</p></div></section><section class="panel"><h2>Drafts & publications</h2><div id="manifest-list" data-testid="manifest-list"></div></section></aside></div></main><script type="module" src="/arc-workshop.js"></script></body></html>`;
}

function localLoginForms() {
  return `<h2>Local development login</h2><p>No Threaded server is required. Open another private/incognito window and choose a different Weaver to test co-op locally.</p><div>${Object.entries(LOCAL_PROFILES).map(([slot, profile]) => `<form method="post" action="/auth/local" style="display:inline"><input type="hidden" name="slot" value="${slot}"><button type="submit" data-testid="local-login-${slot}">Enter as ${profile.name}</button></form>`).join('')}</div><p><small>Local auth is rejected when NODE_ENV=production. Honey purchases are unavailable because Threaded remains the authoritative wallet owner.</small></p>`;
}

function homePage({ connected, authMode }) {
  const login = authMode === 'local' ? localLoginForms() : '<p><a data-testid="threaded-login" class="primary-link" href="/auth/threaded">Connect with Threaded</a></p>';
  const workshop = authMode === 'local' ? ' · <a href="/arc-workshop">Arc Workshop</a>' : '';
  return `<!doctype html><html lang="en"><head>${sharedHead('Threadbound')}</head><body><main class="threadbound-page home-shell"><header class="page-hero"><div><span class="eyebrow">PERSISTENT CO-OP ROGUELITE</span><h1>Threadbound</h1><p>Enter an evolving world tied to your Threaded identity and Honey wallet.</p></div></header><section class="panel">${connected ? `<p>Connected successfully. <a data-testid="enter-game" href="/game">Enter Threadbound</a> · <a href="/codex">Open Codex</a>${workshop}</p>` : login}</section></main></body></html>`;
}

export function createApp({ config, threadedGateway, repository, codexRepository, manifestRepository }) {
  const app = express();
  const eventBus = new EventBus();
  const realtimeHub = new RealtimeHub();
  app.locals.realtimeHub = realtimeHub;
  const streamRepository = new SQLiteActivityStreamRepository({ database: repository.db });
  const inventoryRepository = new SQLiteInventoryRepository({ database: repository.db });
  const runCommandRepository = new SQLiteRunCommandRepository({ database: repository.db });
  const sessionStore = new SQLiteSessionStore({ database: repository.db });
  app.locals.sessionStore = sessionStore;
  const activityStream = new ActivityStreamService({ streamRepository, gameRepository: repository });
  const arcManifestService = new ArcManifestService({ gameRepository: repository, codexRepository, manifestRepository });
  const achievements = new AchievementProjector(repository);
  const arcAchievements = new ArcAchievementProjector({ gameRepository: repository, manifestRepository, arcManifestService });
  const history = new WorldHistoryProjector({ gameRepository: repository, codexRepository });

  const affectedPlayerIds = (event) => {
    const ids = new Set(Array.isArray(event.participantIds) ? event.participantIds : []);
    if (event.playerId) ids.add(event.playerId);
    if (event.targetPlayerId) ids.add(event.targetPlayerId);
    if (event.runId) {
      const run = repository.getRun(event.runId);
      for (const participant of run?.participants || []) ids.add(participant.playerId);
    }
    if (event.partyId) {
      const party = repository.getParty(event.partyId);
      for (const member of party?.members || []) ids.add(member.playerId);
    }
    return [...ids];
  };

  eventBus.subscribe((event) => achievements.handle(event));
  eventBus.subscribe((event) => arcAchievements.handle(event));
  eventBus.subscribe((event) => history.handle(event));
  eventBus.subscribe((event) => {
    const playerIds = affectedPlayerIds(event);
    realtimeHub.broadcast(
      { type: 'state_changed', eventType: event.type },
      playerIds.length > 0 ? { playerIds } : {},
    );
    try {
      const entry = activityStream.recordDomainEvent(event);
      if (entry) realtimeHub.broadcast({ type: 'stream_entry', entry });
    } catch (error) {
      console.error('Activity stream projection failed:', error);
    }
  });
  const gameService = new GameService({ repository, eventBus, arcManifestService });
  const huntService = new HuntService({ repository, eventBus });
  const simpleDungeonService = new SimpleDungeonService({ repository, eventBus, arcManifestService });
  const combatPreview = new CombatPreviewService({ repository });
  const inventoryService = new InventoryService({ inventoryRepository, gameRepository: repository, eventBus });
  const partyService = new PartyService({ repository, eventBus });
  const codexService = new CodexService({ gameRepository: repository, codexRepository, arcManifestService });
  const purchaseService = threadedGateway ? new HoneyPurchaseService({ repository, threadedGateway }) : null;
  const runCommandIdempotency = new RunCommandIdempotencyService({ repository: runCommandRepository });

  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '4kb' }));
  app.use(express.json({ limit: '512kb' }));
  app.use('/assets/runtime', express.static('public/assets/runtime', {
    immutable: true,
    maxAge: '1y',
  }));
  app.use(express.static('public'));
  app.use(session({ store: sessionStore, name: 'threadbound.sid', secret: config.sessionSecret, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 60 * 60 * 1000 } }));

  const requireConnection = (request, response, next) => {
    if (!request.session.threaded?.playerId) return response.status(401).json({ error: 'identity_not_connected', message: 'Sign in to Threadbound first.' });
    next();
  };
  const requireWorkshop = (request, response, next) => {
    if (!request.session.threaded?.playerId) return response.status(401).json({ error: 'identity_not_connected', message: 'Sign in to Threadbound first.' });
    if (config.authMode !== 'local' || request.session.threaded.source !== 'local') return response.status(403).json({ error: 'arc_workshop_unavailable', message: 'Arc Workshop mutation is currently restricted to standalone local development mode until production admin authorization exists.' });
    next();
  };
  const idempotentRunCommand = (request, response, next) => {
    if (request.method !== 'POST') return next();
    const idempotencyKey = String(request.get('Idempotency-Key') || '').trim();
    if (!idempotencyKey) return next();

    let claim;
    try {
      claim = runCommandIdempotency.begin({
        playerId: request.session.threaded.playerId,
        idempotencyKey,
        method: request.method,
        path: request.originalUrl.split('?')[0],
        body: request.body ?? null,
        runId: request.params.runId,
      });
    } catch (error) {
      if (error.code === 'invalid_idempotency_key') return response.status(422).json({ error: error.code, message: error.message });
      if (error.code === 'run_command_replay_mismatch' || error.code === 'run_command_in_progress') return response.status(409).json({ error: error.code, message: error.message });
      throw error;
    }

    if (claim.mode === 'replay') {
      response.setHeader('Idempotency-Replayed', 'true');
      return response.status(claim.responseStatus).json(claim.responseBody);
    }
    if (claim.mode !== 'claimed') return next();

    const originalJson = response.json.bind(response);
    response.json = (body) => {
      if (response.statusCode < 500) {
        runCommandIdempotency.complete(claim, { responseStatus: response.statusCode, responseBody: body });
        response.setHeader('Idempotency-Replayed', 'false');
      }
      return originalJson(body);
    };
    return next();
  };

  app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'threadbound', auth_mode: config.authMode }));
  app.get('/', (request, response) => response.type('html').send(homePage({ connected: Boolean(request.session.threaded), authMode: config.authMode })));
  app.get('/game', (request, response) => request.session.threaded ? response.type('html').send(gamePage(config.authMode)) : response.redirect('/'));
  app.get('/codex', (request, response) => request.session.threaded ? response.type('html').send(codexPage(config.authMode)) : response.redirect('/'));
  app.get('/arc-workshop', (request, response) => request.session.threaded && config.authMode === 'local' ? response.type('html').send(arcWorkshopPage(config.authMode)) : response.redirect('/'));

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
    const dashboard = gameService.dashboard(connection.playerId);
    const runUpgrades = decorateRunUpgradeOffers(dashboard.activeRun, dashboard.runUpgrades);
    const actionPreviews = request.query.previews === '1' && dashboard.activeRun && !dashboard.activeRun.simpleCombat
      ? combatPreview.preview(connection.playerId, dashboard.activeRun.id)
      : null;
    const dungeonReadiness = dashboard.dungeons.map((dungeon) => {
      try { return simpleDungeonService.readiness(connection.playerId, dungeon.id); }
      catch { return { dungeonId: dungeon.id, dungeonName: dungeon.name, recommendedAttack: 9, ready: false, members: [] }; }
    });
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      authSource: connection.source || 'threaded',
      threadedUser: connection.profile,
      wallet: connection.wallet,
      ...dashboard,
      runUpgrades: dashboard.activeRun?.simpleCombat ? [] : runUpgrades,
      combatSkills: dashboard.activeRun?.simpleCombat ? [] : dashboard.combatSkills,
      actionPreviews,
      simpleLoop: {
        huntAvailable: !dashboard.activeRun,
        dungeonReadiness,
      },
    });
  });

  app.get('/api/events', requireConnection, (request, response) => realtimeHub.attach(response, { playerId: request.session.threaded.playerId }));
  app.get('/api/realtime-token', requireConnection, (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    return response.json(realtimeHub.issueWebSocketToken(request.session.threaded.playerId));
  });
  app.get('/api/stream', requireConnection, (request, response) => {
    const before = String(request.query.before || '').trim() || null;
    const requested = Math.max(1, Number(request.query.limit) || INITIAL_STREAM_LIMIT);
    const limit = before ? Math.min(50, requested) : Math.min(INITIAL_STREAM_LIMIT, requested);
    response.setHeader('Cache-Control', 'no-store');
    return response.json(activityStream.page({ limit, before }));
  });
  app.post('/api/stream/messages', requireConnection, (request, response) => {
    try {
      const entry = activityStream.postChat({ playerId: request.session.threaded.playerId, body: request.body?.body });
      realtimeHub.broadcast({ type: 'stream_entry', entry });
      return response.status(201).json({ entry });
    } catch (error) {
      if (error.code === 'invalid_chat_message') return response.status(422).json({ error: error.code, message: error.message });
      throw error;
    }
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

  app.get('/api/arc-workshop/context', requireWorkshop, (request, response) => {
    const context = arcManifestService.worldContext();
    if (request.query.download === '1') response.setHeader('Content-Disposition', 'attachment; filename="threadbound-world-context.json"');
    return response.json(context);
  });
  app.get('/api/arc-workshop/schema', requireWorkshop, async (request, response) => {
    const schemaText = await readFile(new URL('../schemas/arc-manifest.schema.json', import.meta.url), 'utf8');
    if (request.query.download === '1') response.setHeader('Content-Disposition', 'attachment; filename="threadbound-arc-manifest.schema.json"');
    return response.type('application/schema+json').send(schemaText);
  });
  app.post('/api/arc-workshop/validate', requireWorkshop, (request, response) => {
    const validation = arcManifestService.validate(request.body?.manifest);
    return response.status(validation.valid ? 200 : 422).json({ validation });
  });
  app.get('/api/arc-workshop/manifests', requireWorkshop, (_request, response) => response.json({ manifests: arcManifestService.list() }));
  app.get('/api/arc-workshop/visual-assets', requireWorkshop, (_request, response) => response.json({
    version: VISUAL_ASSET_CATALOG_VERSION,
    assets: VISUAL_ASSETS.map(({ id, kind, label, description, tags }) => ({ id, kind, label, description, tags })),
  }));
  app.get('/api/arc-workshop/manifests/:id', requireWorkshop, (request, response) => {
    const record = arcManifestService.get(String(request.params.id));
    if (!record) return response.status(404).json({ error: 'arc_manifest_not_found', message: 'Arc Manifest not found.' });
    return response.json({ record });
  });
  app.post('/api/arc-workshop/manifests', requireWorkshop, (request, response) => {
    try {
      const record = arcManifestService.saveDraft(request.body?.manifest, { source: String(request.body?.source || 'manual-upload').slice(0, 64) });
      return response.status(201).json({ record });
    } catch (error) {
      if (error.code === 'arc_manifest_invalid') return response.status(422).json({ error: error.code, message: error.message, validation: error.validation });
      throw error;
    }
  });
  app.post('/api/arc-workshop/manifests/:id/publish', requireWorkshop, (request, response) => {
    try {
      const record = arcManifestService.publish(String(request.params.id));
      realtimeHub.broadcast({ type: 'state_changed', eventType: 'ArcPublished' });
      return response.json({ record });
    } catch (error) {
      if (error.code === 'arc_manifest_invalid') return response.status(422).json({ error: error.code, message: error.message, validation: error.validation });
      throw error;
    }
  });

  app.post('/api/party/create', requireConnection, (request, response) => response.status(201).json({ party: partyService.createParty(request.session.threaded.playerId) }));
  app.post('/api/party/join', requireConnection, (request, response) => response.json({ party: partyService.joinParty(request.session.threaded.playerId, request.body?.joinCode) }));
  app.post('/api/party/ready', requireConnection, (request, response) => response.json({ party: partyService.setReady(request.session.threaded.playerId, Boolean(request.body?.ready)) }));
  app.post('/api/party/leave', requireConnection, (request, response) => { partyService.leaveParty(request.session.threaded.playerId); response.json({ party: null }); });

  app.post('/api/hunt', requireConnection, (request, response) => {
    const playerId = request.session.threaded.playerId;
    const hunt = huntService.hunt(playerId);
    return response.json({ hunt, dashboard: gameService.dashboard(playerId) });
  });
  app.post('/api/recovery/potion', requireConnection, (request, response) => {
    const playerId = request.session.threaded.playerId;
    const recovery = huntService.useHealthPotion(playerId);
    return response.json({ recovery, dashboard: gameService.dashboard(playerId) });
  });
  app.post('/api/shop/health-potion', requireConnection, (request, response) => {
    const playerId = request.session.threaded.playerId;
    const purchase = huntService.buyHealthPotion(playerId);
    return response.json({ purchase, dashboard: gameService.dashboard(playerId) });
  });
  app.post('/api/dungeons/:dungeonId/start-simple', requireConnection, (request, response) => response.status(201).json({ run: simpleDungeonService.startDungeon(request.session.threaded.playerId, request.params.dungeonId) }));

  // Legacy tactical start remains during migration so old persisted journeys and focused
  // regression fixtures can still exercise the former combat model. The player UI no
  // longer calls this route.
  app.post('/api/dungeons/:dungeonId/start', requireConnection, (request, response) => response.status(201).json({ run: gameService.startDungeon(request.session.threaded.playerId, request.params.dungeonId) }));
  app.use('/api/runs/:runId', requireConnection, idempotentRunCommand);
  app.post('/api/runs/:runId/attack', requireConnection, (request, response) => response.json(gameService.attack(request.session.threaded.playerId, request.params.runId)));
  app.post('/api/runs/:runId/guard', requireConnection, (request, response) => response.json(gameService.guard(request.session.threaded.playerId, request.params.runId)));
  app.post('/api/runs/:runId/interrupt', requireConnection, (request, response) => response.json(gameService.interrupt(request.session.threaded.playerId, request.params.runId)));
  app.post('/api/runs/:runId/mend', requireConnection, (request, response) => response.json(gameService.mend(request.session.threaded.playerId, request.params.runId, String(request.body?.targetPlayerId || ''))));
  app.post('/api/runs/:runId/revive', requireConnection, (request, response) => response.json(gameService.revive(request.session.threaded.playerId, request.params.runId, String(request.body?.targetPlayerId || ''))));
  app.post('/api/runs/:runId/skills/:skillId', requireConnection, (request, response) => response.json(gameService.useSkill(request.session.threaded.playerId, request.params.runId, String(request.params.skillId || ''))));
  app.post('/api/runs/:runId/upgrade', requireConnection, (request, response) => response.json({ run: gameService.chooseUpgrade(request.session.threaded.playerId, request.params.runId, String(request.body?.upgradeId || '')) }));
  app.post('/api/items/:itemId/equip', requireConnection, (request, response) => response.json(gameService.equipItem(request.session.threaded.playerId, request.params.itemId)));
  app.post('/api/items/:itemId/salvage', requireConnection, (request, response) => {
    const playerId = request.session.threaded.playerId;
    const result = inventoryService.salvage(playerId, request.params.itemId);
    return response.json({ ...result, dashboard: gameService.dashboard(playerId) });
  });
  app.post('/api/items/:itemId/upgrade', requireConnection, (request, response) => {
    const playerId = request.session.threaded.playerId;
    const result = inventoryService.upgrade(playerId, request.params.itemId, request.body?.attunementCode || null);
    return response.json({ ...result, dashboard: gameService.dashboard(playerId) });
  });

  const purchaseHandler = async (request, response) => {
    const connection = request.session.threaded;
    if (connection.source === 'local' || !purchaseService) return response.status(409).json({ error: 'threaded_wallet_unavailable', message: 'Honey purchases require Threaded auth because Threaded owns the authoritative Honey wallet.' });
    const idempotencyKey = String(request.get('Idempotency-Key') || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) return response.status(422).json({ error: 'invalid_idempotency_key', message: 'Idempotency-Key must be between 8 and 128 characters.' });
    try {
      const result = await purchaseService.purchaseTrainingCache({ playerId: connection.playerId, threadedUserId: connection.profile.id, accessToken: connection.accessToken, idempotencyKey });
      request.session.threaded.wallet = { ...connection.wallet, balance: result.spend.balance };
      realtimeHub.broadcast({ type: 'state_changed', eventType: 'HoneyPurchaseCompleted' }, { playerIds: [connection.playerId] });
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
    const conflictCodes = new Set([
      'stale_run_version',
      'equipped_item_cannot_be_salvaged',
      'stale_relic_upgrade',
      'insufficient_thread_dust',
      'relic_upgrade_during_run',
      'relic_max_level',
      'invalid_relic_attunement',
      'relic_attunement_locked',
      'hunt_during_dungeon',
      'too_wounded_to_hunt',
      'health_already_full',
      'no_health_potions',
      'potion_during_dungeon',
      'shop_during_dungeon',
      'simple_combat_attack_only',
    ]);
    const status = conflictCodes.has(error?.code) || /not found|Unknown|active dungeon|active run|party|leader|ready|member|participant|cannot act|Mend|Revive|interrupt|enemy action|only be chosen|not currently in combat|full|state changed|salvag|Focus|cooldown|combat skill|Temper|attunement|Thread Dust|relic|simple combat|hunting/i.test(knownMessage) ? 409 : 500;
    response.status(status).json({ error: error?.code || (status === 409 ? 'game_rule_violation' : 'internal_error'), message: knownMessage });
  });

  return app;
}
