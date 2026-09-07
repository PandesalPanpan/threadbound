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

test('one explicit combat command becomes one useful system result message', () => {
  const { service, a } = setup();
  const started = service.recordDomainEvent({
    type: 'DungeonStarted',
    playerId: a.id,
    runId: 'run-a',
    dungeonId: 'frayed-hollow',
    enemyId: 'frayed-wisp',
    enemyName: 'Frayed Wisp',
    enemyHp: 12,
    enemyMaxHp: 12,
    actorHp: 40,
    actorMaxHp: 40,
  });
  const lowLevel = service.recordDomainEvent({ type: 'EnemyDamaged', playerId: a.id, runId: 'run-a', enemyId: 'frayed-wisp', damage: 6 });
  const resolved = service.recordDomainEvent({
    type: 'CombatActionResolved',
    action: 'attack',
    playerId: a.id,
    runId: 'run-a',
    dungeonId: 'frayed-hollow',
    enemyId: 'frayed-wisp',
    enemyName: 'Frayed Wisp',
    enemyHp: 6,
    enemyMaxHp: 12,
    actorHp: 38,
    actorMaxHp: 40,
    damage: 6,
    retaliation: 2,
    targetPlayerId: a.id,
    phase: 'combat',
  });

  assert.equal(started.kind, 'system');
  assert.match(started.body, /Frayed Wisp 12\/12 HP/);
  assert.match(started.body, /40\/40 HP/);
  assert.match(started.body, /Choose your first action/);
  assert.equal(lowLevel, null);
  assert.match(resolved.body, /attacked Frayed Wisp for 6 damage/);
  assert.match(resolved.body, /took 2/);
  assert.match(resolved.body, /38\/40/);
  assert.match(resolved.body, /Frayed Wisp 6\/12/);
  assert.equal(service.recent().length, 2);
});

test('resolved turns can surface telegraphs without a second public event', () => {
  const { service, a } = setup();
  const telegraph = service.recordDomainEvent({ type: 'EnemyIntentTelegraphed', runId: 'run-a', enemyId: 'frayed-wisp', intent: { name: 'Fraying Blow', damage: 4 } });
  const resolved = service.recordDomainEvent({
    type: 'CombatActionResolved',
    action: 'attack',
    playerId: a.id,
    runId: 'run-a',
    enemyId: 'frayed-wisp',
    enemyName: 'Frayed Wisp',
    enemyHp: 3,
    enemyMaxHp: 12,
    actorHp: 34,
    actorMaxHp: 40,
    damage: 3,
    retaliation: 2,
    targetPlayerId: a.id,
    enemyIntent: { name: 'Fraying Blow', damage: 4 },
    phase: 'combat',
  });

  assert.equal(telegraph, null);
  assert.match(resolved.body, /Fraying Blow incoming \(4\)/);
  assert.equal(service.recent().length, 1);
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
