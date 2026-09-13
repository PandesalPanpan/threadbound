import assert from 'node:assert/strict';
import test from 'node:test';
import { DuelService } from '../src/application/DuelService.js';
import { GuildHallService } from '../src/application/GuildHallService.js';
import { SQLiteDuelRepository } from '../src/infrastructure/SQLiteDuelRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteSimulatedAdventurerRepository } from '../src/infrastructure/SQLiteSimulatedAdventurerRepository.js';

function setup() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'human-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'duel-human', displayName: 'Human Adventurer' });
  const events = [];
  const service = new DuelService({
    repository,
    eventBus: { publish(event) { events.push(event); } },
    random: () => 0.99,
    idFactory: () => 'duel-generated',
  });
  return { repository, player, events, service };
}

test('Duel resolves through the shared automatic battle engine without mutating normal HP or economy', () => {
  const { repository, player, events, service } = setup();
  repository.addThreadDust(player.id, 100);
  const before = repository.getPlayer(player.id);

  const result = service.duel(player.id, 'guild-lio', { duelId: 'duel-lio-1' });
  const after = repository.getPlayer(player.id);

  assert.equal(result.outcome, 'win');
  assert.equal(result.battle.receipt.kind, 'automatic-battle-result');
  assert.equal(result.battle.receipt.winnerId, player.id);
  assert.equal(result.battle.receipt.loserId, 'guild-lio');
  assert.ok(result.battle.details.turnCount > 0);
  assert.equal(result.battle.details.turns[0].actor.id, player.id);
  assert.equal(result.replayed, false);
  assert.deepEqual(result.record, { wins: 1, losses: 0, draws: 0, total: 1 });
  assert.deepEqual(result.opponentRecord, { wins: 0, losses: 1, draws: 0, total: 1 });

  assert.equal(after.currentHealth, before.currentHealth, 'Duel must not consume persistent Hunt/Adventure HP');
  assert.equal(after.threadDust, before.threadDust, 'Duel must not award or remove Gold');
  assert.equal(events.length, 1, 'one explicit Duel should publish one concise result event');
  assert.equal(events[0].type, 'DuelResolved');
  assert.equal(events[0].opponentId, 'guild-lio');
  assert.match(events[0].receiptText, /Victory/);
  repository.close();
});

test('strong Guild Hall rival can defeat the human using the same stat/equipment battle rules', () => {
  const { repository, player, service } = setup();
  const result = service.duel(player.id, 'guild-rook', { duelId: 'duel-rook-1' });

  assert.equal(result.outcome, 'loss');
  assert.equal(result.battle.receipt.outcomeLabel, 'Defeat');
  assert.equal(result.battle.receipt.winnerId, 'guild-rook');
  assert.deepEqual(result.record, { wins: 0, losses: 1, draws: 0, total: 1 });
  repository.close();
});

test('Duel persistence is immutable/idempotent and rejects a mismatched replay', () => {
  const { repository } = setup();
  const duels = new SQLiteDuelRepository({ database: repository.db });
  const first = duels.recordResult({
    duelId: 'retry-key',
    challengerId: 'human-player',
    opponentId: 'guild-lio',
    outcome: 'win',
    winnerId: 'human-player',
    loserId: 'guild-lio',
    turnCount: 7,
  });
  const replay = duels.recordResult({
    duelId: 'retry-key',
    challengerId: 'human-player',
    opponentId: 'guild-lio',
    outcome: 'win',
    winnerId: 'human-player',
    loserId: 'guild-lio',
    turnCount: 7,
  });

  assert.equal(first.applied, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(duels.recordFor('human-player'), { wins: 1, losses: 0, draws: 0, total: 1 });
  assert.throws(() => duels.recordResult({
    duelId: 'retry-key',
    challengerId: 'human-player',
    opponentId: 'guild-lio',
    outcome: 'loss',
    winnerId: 'guild-lio',
    loserId: 'human-player',
    turnCount: 7,
  }), (error) => error.code === 'duel_replay_mismatch');
  repository.close();
});

test('Guild Hall leaderboard projects authoritative human and simulated Duel records', () => {
  const { repository, player, service } = setup();
  service.duel(player.id, 'guild-lio', { duelId: 'duel-leaderboard-1' });
  const simulatedRepository = new SQLiteSimulatedAdventurerRepository({ database: repository.db });
  const guildHall = new GuildHallService({ repository: simulatedRepository, gameRepository: repository });
  const leaderboard = guildHall.browse('area-1-town').leaderboard;
  const human = leaderboard.find((entry) => entry.id === player.id);
  const lio = leaderboard.find((entry) => entry.id === 'guild-lio');

  assert.deepEqual(human.duelRecord, { wins: 1, losses: 0, draws: 0, total: 1 });
  assert.deepEqual(lio.duelRecord, { wins: 0, losses: 1, draws: 0, total: 1 });
  repository.close();
});

test('Duel rejects unavailable opponents and active-dungeon overlap instead of touching unrelated state', () => {
  const { repository, player, service } = setup();
  assert.throws(
    () => service.duel(player.id, 'not-a-guild-adventurer'),
    (error) => error.code === 'duel_opponent_unavailable',
  );
  repository.close();
});
