import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStreamService, MAX_CHAT_LENGTH } from '../src/application/ActivityStreamService.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function setup({ retention = 2000 } = {}) {
  let playerSequence = 0;
  let streamSequence = 0;
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++playerSequence}` });
  const streamRepository = new SQLiteActivityStreamRepository({
    database: gameRepository.db,
    idFactory: () => `stream-${++streamSequence}`,
    retention,
  });
  const service = new ActivityStreamService({ streamRepository, gameRepository });
  const a = gameRepository.getOrCreatePlayer({ threadedUserId: 'local:a', displayName: 'Local Weaver A' });
  const b = gameRepository.getOrCreatePlayer({ threadedUserId: 'local:b', displayName: 'Local Weaver B' });
  return { gameRepository, streamRepository, service, a, b };
}

test('player chat is persisted, trimmed, ordered, and attributed', () => {
  const { service, a, b } = setup();
  const first = service.postChat({ playerId: a.id, body: '  hello from A  ' });
  const second = service.postChat({ playerId: b.id, body: 'hello back' });

  assert.equal(first.kind, 'chat');
  assert.equal(first.actorName, 'Local Weaver A');
  assert.equal(first.body, 'hello from A');
  assert.deepEqual(service.recent().map((entry) => entry.id), [first.id, second.id]);
});

test('chat rejects empty and oversized messages', () => {
  const { service, a } = setup();
  assert.throws(() => service.postChat({ playerId: a.id, body: '   ' }), (error) => error.code === 'invalid_chat_message');
  assert.throws(() => service.postChat({ playerId: a.id, body: 'x'.repeat(MAX_CHAT_LENGTH + 1) }), (error) => error.code === 'invalid_chat_message');
});

test('domain actions project to visually distinct system entries with useful names', () => {
  const { service, a, b } = setup();
  const started = service.recordDomainEvent({ type: 'DungeonStarted', playerId: a.id, runId: 'run-a', dungeonId: 'frayed-hollow' });
  const strike = service.recordDomainEvent({ type: 'EnemyDamaged', playerId: a.id, runId: 'run-a', enemyId: 'hollow-stalker', damage: 9 });
  const heal = service.recordDomainEvent({ type: 'PlayerHealed', playerId: b.id, targetPlayerId: a.id, runId: 'run-a', amount: 8 });

  assert.equal(started.kind, 'system');
  assert.equal(started.eventType, 'DungeonStarted');
  assert.equal(started.body, 'Local Weaver A entered Frayed Hollow.');
  assert.equal(strike.body, 'Local Weaver A struck Hollow Stalker for 9 damage.');
  assert.equal(heal.body, 'Local Weaver B mended Local Weaver A for 8 HP.');
});

test('duplicate participant completion notifications are ignored while the aggregate completion is kept', () => {
  const { service, a, b } = setup();
  const aggregate = service.recordDomainEvent({ type: 'DungeonCompleted', runId: 'run-a', dungeonId: 'frayed-hollow', participantIds: [a.id, b.id] });
  const perPlayer = service.recordDomainEvent({ type: 'DungeonCompleted', playerId: a.id, runId: 'run-a', dungeonId: 'frayed-hollow', participantIds: [a.id, b.id] });

  assert.match(aggregate.body, /Local Weaver A, Local Weaver B cleared Frayed Hollow/);
  assert.equal(perPlayer, null);
  assert.equal(service.recent().length, 1);
});

test('stream repository retains only the configured newest entries', () => {
  const { service, a } = setup({ retention: 3 });
  for (let index = 0; index < 5; index += 1) service.postChat({ playerId: a.id, body: `message ${index}` });
  assert.deepEqual(service.recent().map((entry) => entry.body), ['message 2', 'message 3', 'message 4']);
});
