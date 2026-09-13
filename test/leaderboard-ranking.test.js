import test from 'node:test';
import assert from 'node:assert/strict';
import { rankLeaderboardEntries } from '../src/domain/LeaderboardRankingPolicy.js';
import { TownService } from '../src/application/TownService.js';
import { SQLiteActivityStreamRepository } from '../src/infrastructure/SQLiteActivityStreamRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLitePlayerProgressionRepository } from '../src/infrastructure/SQLitePlayerProgressionRepository.js';

function entry(overrides = {}) {
  return {
    id: overrides.id || 'entry',
    name: overrides.name || 'Entry',
    level: overrides.level ?? 1,
    experience: overrides.experience ?? 0,
    highestUnlockedAreaNumber: overrides.highestUnlockedAreaNumber ?? 1,
    huntCount: overrides.huntCount ?? 0,
    achievements: overrides.achievements ?? [],
    equipment: overrides.equipment ?? {},
    stats: overrides.stats ?? { attack: 6, defense: 0, maxHp: 40, speed: 10 },
    ...overrides,
  };
}

test('leaderboard ranking uses canonical progression facts with deterministic tie breaks', () => {
  const ranked = rankLeaderboardEntries([
    entry({ id: 'a', name: 'Aster', level: 3, experience: 220, huntCount: 20, stats: { attack: 12, defense: 2, maxHp: 45, speed: 10 } }),
    entry({ id: 'b', name: 'Bram', level: 4, experience: 300, huntCount: 1 }),
    entry({ id: 'c', name: 'Cora', level: 3, experience: 220, huntCount: 20, stats: { attack: 15, defense: 2, maxHp: 45, speed: 10 } }),
  ]);

  assert.deepEqual(ranked.map((candidate) => candidate.id), ['b', 'c', 'a']);
  assert.deepEqual(ranked.map((candidate) => candidate.placement), [1, 2, 3]);
  assert.equal(ranked[1].power.attack, 15);
});

test('Guild Hall leaderboard combines humans and simulated adventurers from persisted authoritative state', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: (() => {
    let index = 0;
    return () => `human-${++index}`;
  })() });
  try {
    const streamRepository = new SQLiteActivityStreamRepository({ database: repository.db, idFactory: (() => {
      let index = 0;
      return () => `stream-${++index}`;
    })() });
    const first = repository.getOrCreatePlayer({ threadedUserId: 'human-one', displayName: 'Human One' });
    const second = repository.getOrCreatePlayer({ threadedUserId: 'human-two', displayName: 'Human Two' });
    const townService = new TownService({ repository });
    const progression = new SQLitePlayerProgressionRepository({ database: repository.db });
    progression.addExperience(first.id, 160);
    repository.unlockAchievement(first.id, { id: 'first-step', name: 'First Step', description: 'Started adventuring.' });

    for (let index = 0; index < 3; index += 1) {
      streamRepository.append({
        kind: 'system',
        eventType: 'HuntResolved',
        actorPlayerId: first.id,
        actorName: first.displayName,
        body: 'Hunt resolved.',
      });
    }
    streamRepository.append({
      kind: 'system',
      eventType: 'AdventureResolved',
      actorPlayerId: second.id,
      actorName: second.displayName,
      body: 'Adventure resolved.',
    });

    const town = townService.get(first.id, 'area-1-town');
    const leaderboard = town.guildHall.leaderboard;
    assert.equal(leaderboard.length, 5);
    assert.deepEqual(leaderboard.map((candidate) => candidate.placement), [1, 2, 3, 4, 5]);

    const firstRow = leaderboard.find((candidate) => candidate.id === first.id);
    assert.equal(firstRow.kind, 'human');
    assert.equal(firstRow.huntCount, 3);
    assert.equal(firstRow.adventureCount, 0);
    assert.equal(firstRow.achievementCount, 1);
    assert.deepEqual(firstRow.duelRecord, { wins: 0, losses: 0, draws: 0, total: 0 }, 'M8-06 projects an authoritative zero record before the first human Duel');

    const rook = leaderboard.find((candidate) => candidate.id === 'guild-rook');
    assert.equal(rook.kind, 'simulated');
    assert.equal(rook.strongRival, true);
    assert.ok(rook.power.equippedCount > 0);
    assert.deepEqual(rook.duelRecord, { wins: 0, losses: 0, draws: 0, total: 0 }, 'M8-06 projects the authoritative zero record before the first simulated Duel');
    assert.equal(leaderboard[0].id, 'guild-rook', 'the intentionally strong veteran should lead the foundation standings');
  } finally {
    repository.close();
  }
});
