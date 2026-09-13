import assert from 'node:assert/strict';
import test from 'node:test';
import { GuildHallService } from '../src/application/GuildHallService.js';
import { SimulatedAdventurerSimulationService } from '../src/application/SimulatedAdventurerSimulationService.js';
import { SQLiteDuelRepository } from '../src/infrastructure/SQLiteDuelRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteSimulatedAdventurerRepository } from '../src/infrastructure/SQLiteSimulatedAdventurerRepository.js';

test('Guild Hall bot profile projection exposes persisted stats, equipment, personality, achievements, and bounded recent history', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'profile-human' });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'profile-human-user', displayName: 'Profile Human' });
  const simulatedRepository = new SQLiteSimulatedAdventurerRepository({ database: gameRepository.db });
  const duelRepository = new SQLiteDuelRepository({ database: gameRepository.db });
  const guildHall = new GuildHallService({
    repository: simulatedRepository,
    gameRepository,
    duelRepository,
    nowFactory: () => new Date('2026-09-13T00:00:00.000Z'),
  });
  const simulation = new SimulatedAdventurerSimulationService({ repository: simulatedRepository });

  try {
    const seeded = guildHall.browse('area-1-town');
    const initialRook = seeded.leaderboard.find((entry) => entry.id === 'guild-rook');
    assert.equal(initialRook.personality, 'A veteran rival who returns to the first Guild Hall between harder expeditions.');
    assert.equal(initialRook.activityProfile.id, 'dedicated');
    assert.equal(initialRook.strongRival, true);
    assert.equal(initialRook.level, 15);
    assert.equal(initialRook.highestUnlockedAreaNumber, 5);
    assert.equal(initialRook.history.huntCount, 260);
    assert.equal(initialRook.history.adventureCount, 72);
    assert.equal(initialRook.history.duelCount, 0);
    assert.deepEqual(initialRook.history.recent, []);
    assert.equal(Object.keys(initialRook.equipment).length, 5);
    assert.equal(initialRook.equipment.weapon.name, 'Veteran Blade');
    assert.equal(initialRook.equipment.armor.name, 'Veteran Armor');
    assert.ok(initialRook.stats.attack > 10);
    assert.deepEqual(initialRook.achievements, ['first-hunt', 'veteran-rival']);
    assert.equal(Object.hasOwn(initialRook, 'honey'), false);

    const progressed = simulation.simulate({ adventurerId: 'guild-rook', now: '2026-09-13T04:00:00.000Z' });
    assert.equal(progressed.appliedActions, 2);
    duelRepository.recordResult({
      duelId: 'profile-history-duel',
      challengerId: player.id,
      opponentId: 'guild-rook',
      outcome: 'loss',
      winnerId: 'guild-rook',
      loserId: player.id,
      turnCount: 8,
    });

    const refreshed = guildHall.browse('area-1-town');
    const rook = refreshed.leaderboard.find((entry) => entry.id === 'guild-rook');
    assert.deepEqual(rook.duelRecord, { wins: 1, losses: 0, draws: 0, total: 1 });
    assert.equal(rook.history.duelCount, 1);
    assert.equal(rook.history.lastSimulatedAt, '2026-09-13T04:00:00.000Z');
    assert.ok(rook.history.recent.length >= 3);
    assert.ok(rook.history.recent.length <= 5);
    assert.ok(rook.history.recent.some((entry) => entry.type === 'duel' && entry.outcome === 'win' && entry.opponentId === player.id));
    assert.ok(rook.history.recent.some((entry) => ['hunt', 'adventure'].includes(entry.type) && entry.experienceAward >= 0));
  } finally {
    gameRepository.close();
  }
});

test('Duel recent history is participant-relative, immutable read data, and limit bounded', () => {
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:' });
  const duels = new SQLiteDuelRepository({ database: gameRepository.db });
  try {
    duels.recordResult({
      duelId: 'duel-1',
      challengerId: 'human-a',
      opponentId: 'guild-lio',
      outcome: 'win',
      winnerId: 'human-a',
      loserId: 'guild-lio',
      turnCount: 4,
    });
    duels.recordResult({
      duelId: 'duel-2',
      challengerId: 'human-b',
      opponentId: 'guild-lio',
      outcome: 'loss',
      winnerId: 'guild-lio',
      loserId: 'human-b',
      turnCount: 6,
    });

    const recent = duels.listRecentFor('guild-lio', 1);
    assert.equal(recent.length, 1);
    assert.equal(Object.isFrozen(recent), true);
    assert.equal(Object.isFrozen(recent[0]), true);
    assert.equal(recent[0].duelId, 'duel-2');
    assert.equal(recent[0].outcome, 'win');
    assert.equal(recent[0].opponentId, 'human-b');
    assert.equal(recent[0].turnCount, 6);

    const all = duels.listRecentFor('guild-lio', 99);
    assert.equal(all.length, 2);
    assert.deepEqual(new Set(all.map((entry) => entry.outcome)), new Set(['win', 'loss']));
  } finally {
    gameRepository.close();
  }
});
