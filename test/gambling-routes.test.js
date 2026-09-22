import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import session from 'express-session';
import { installGamblingRoutes } from '../src/gambling-routes.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

async function fixture() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'gambling-route-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'gambling-route-user', displayName: 'Route Gambler' });
  repository.addThreadDust(player.id, 100);

  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'gambling-route-test-secret', resave: false, saveUninitialized: true }));
  app.use((request, _response, next) => {
    request.session.threaded = { playerId: player.id, source: 'local' };
    next();
  });
  app.locals.realtimeHub = { broadcast() {} };
  installGamblingRoutes(app, { repository });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const stream = new SQLiteActivityStreamRepository({ database: repository.db });
  return {
    repository,
    player,
    stream,
    request: (path, options = {}) => fetch(`${baseUrl}${path}`, options),
    close: () => new Promise((resolve) => server.close(() => { repository.close(); resolve(); })),
  };
}

function jsonPost(body, key) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(body),
  };
}

test('gambling help writes a concise authoritative stream receipt without mutating Gold', async () => {
  const f = await fixture();
  try {
    const before = f.repository.getPlayer(f.player.id).threadDust;
    const response = await f.request('/api/gambling/help', jsonPost({ game: 'blackjack' }));
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.game, 'blackjack');
    assert.equal(payload.blackjack.currency, 'Gold');
    assert.equal(f.repository.getPlayer(f.player.id).threadDust, before);

    const entries = f.stream.listRecent({ limit: 10 }).filter((entry) => entry.eventType === 'GamblingHelp');
    assert.equal(entries.length, 1);
    assert.match(entries[0].body, /^Blackjack · /);
    assert.match(entries[0].body, /type blackjack <wager> to deal/);
    assert.match(entries[0].body, /Gold carried/);
  } finally {
    await f.close();
  }
});

test('Coinflip route settles carried Gold and writes one public receipt across retries', async () => {
  const f = await fixture();
  try {
    const response = await f.request('/api/gambling/coinflip', jsonPost({ wager: 10, choice: 'heads' }, 'coinflip-route-0001'));
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.coinflip.currency, 'Gold');
    assert.equal(payload.coinflip.flip.wager, 10);
    assert.equal(payload.coinflip.replayed, false);
    assert.ok(['win', 'loss'].includes(payload.coinflip.flip.outcome));

    const entries = f.stream.listRecent({ limit: 10 }).filter((entry) => entry.eventType === 'CoinflipPlayed');
    assert.equal(entries.length, 1);
    assert.match(entries[0].body, /Route Gambler · Coinflip/);
    assert.match(entries[0].body, /Gold carried/);
    assert.equal(entries[0].metadata.game, 'coinflip');

    const replay = await f.request('/api/gambling/coinflip', jsonPost({ wager: 10, choice: 'heads' }, 'coinflip-route-0001'));
    assert.equal(replay.status, 201);
    const replayPayload = await replay.json();
    assert.equal(replayPayload.coinflip.replayed, true);
    assert.equal(replayPayload.entry, null);
    assert.equal(f.stream.listRecent({ limit: 10 }).filter((entry) => entry.eventType === 'CoinflipPlayed').length, 1);
  } finally {
    await f.close();
  }
});

test('Slots and Blackjack routes expose Gold-only compact stream receipts', async () => {
  const f = await fixture();
  try {
    const slots = await f.request('/api/gambling/slots', jsonPost({ wager: 1 }, 'slots-route-0001'));
    assert.equal(slots.status, 201);
    const slotsPayload = await slots.json();
    assert.equal(slotsPayload.slots.currency, 'Gold');
    assert.equal(slotsPayload.slots.spin.currency, 'Gold');
    assert.equal(slotsPayload.slots.spin.reels.length, 3);

    const blackjack = await f.request('/api/gambling/blackjack', jsonPost({ wager: 1 }, 'blackjack-route-0001'));
    assert.equal(blackjack.status, 201);
    const blackjackPayload = await blackjack.json();
    assert.equal(blackjackPayload.blackjack.currency, 'Gold');
    assert.equal(blackjackPayload.blackjack.round.currency, 'Gold');
    assert.equal(blackjackPayload.blackjack.round.wager, 1);

    const entries = f.stream.listRecent({ limit: 10 });
    const eventTypes = entries.map((entry) => entry.eventType);
    assert.ok(eventTypes.includes('SlotsPlayed'));
    assert.ok(eventTypes.includes('BlackjackPlayed'));
    assert.equal(eventTypes.some((type) => /Honey/i.test(String(type))), false);

    const blackjackEntry = entries.find((entry) => entry.eventType === 'BlackjackPlayed');
    assert.match(blackjackEntry.body, /You .* = \d+/);
    assert.match(blackjackEntry.body, /Dealer /);
    assert.equal(/PRIVATE THREAD REPLY/i.test(blackjackEntry.body), false);
    assert.equal(Object.prototype.hasOwnProperty.call(blackjackEntry.metadata.round, 'deck'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(blackjackEntry.metadata.round, 'privateDeck'), false);
  } finally {
    await f.close();
  }
});
