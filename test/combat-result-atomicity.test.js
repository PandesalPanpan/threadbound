import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureService } from '../src/application/AdventureService.js';
import { HuntService } from '../src/application/HuntService.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLitePlayerProgressionRepository } from '../src/infrastructure/SQLitePlayerProgressionRepository.js';
import { SQLiteFightBuffRepository } from '../src/infrastructure/SQLiteFightBuffRepository.js';
import { SQLiteHuntCooldownRepository } from '../src/infrastructure/SQLiteHuntCooldownRepository.js';
import { SQLiteAdventureCooldownRepository } from '../src/infrastructure/SQLiteAdventureCooldownRepository.js';

const NOW = new Date('2026-09-13T00:00:00.000Z');

function setup(playerId) {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => playerId });
  const player = repository.getOrCreatePlayer({ threadedUserId: `${playerId}-user`, displayName: 'Atomic Tester' });
  repository.db.prepare('UPDATE players SET base_attack = 100, max_health = 100, current_health = 87 WHERE id = ?').run(player.id);
  const progression = new SQLitePlayerProgressionRepository({ database: repository.db });
  const buffs = new SQLiteFightBuffRepository({ database: repository.db });
  buffs.activate({ playerId: player.id, buffCode: 'attack_boost_minor', sourceRecipeId: 'test', fights: 1, appliedAt: NOW.toISOString() });
  return { repository, player, progression, buffs };
}

function failReplayInsert(repository) {
  const original = repository.recordCombatResultInTransaction.bind(repository);
  repository.recordCombatResultInTransaction = () => { throw new Error('replay store unavailable'); };
  return () => { repository.recordCombatResultInTransaction = original; };
}

test('Hunt rolls back cooldown, HP, rewards, XP, fight buffs, and replay if atomic result storage fails', () => {
  const { repository, player, progression, buffs } = setup('atomic-hunt');
  const cooldown = new SQLiteHuntCooldownRepository({ database: repository.db });
  const events = [];
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    progressionRepository: progression,
    fightBuffRepository: buffs,
    cooldownRepository: cooldown,
    huntCooldownSeconds: 45,
    now: () => NOW,
    rng: () => 0.99,
  });
  const restore = failReplayInsert(repository);

  assert.throws(() => service.hunt(player.id), /replay store unavailable/);
  assert.equal(repository.getPlayer(player.id).threadDust, 0);
  assert.equal(repository.getPlayer(player.id).currentHealth, 87);
  assert.equal(progression.get(player.id).experience, 0);
  assert.equal(buffs.listActive(player.id)[0].remainingFights, 1);
  assert.equal(cooldown.get(player.id, { now: NOW }).ready, true);
  assert.equal(repository.getCombatResult(`hunt:${player.id}:2026-09-13T00:00:45.000Z`), null);
  assert.equal(events.length, 0);

  restore();
  const result = service.hunt(player.id);
  const stored = repository.getCombatResult(`hunt:${player.id}:2026-09-13T00:00:45.000Z`);
  assert.ok(stored.result.battleReplay.arenaReplay);
  assert.deepEqual(stored.result.battleReplay, result.battleReplay);
  assert.equal(buffs.listActive(player.id).length, 0);
  repository.close();
});

test('Adventure rolls back cooldown, HP, rewards, XP, fight buffs, and replay if atomic result storage fails', () => {
  const { repository, player, progression, buffs } = setup('atomic-adventure');
  const cooldown = new SQLiteAdventureCooldownRepository({ database: repository.db });
  const events = [];
  const service = new AdventureService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    progressionRepository: progression,
    fightBuffRepository: buffs,
    cooldownRepository: cooldown,
    now: () => NOW,
    rng: () => 0.99,
    rewardRng: () => 0,
    storyRng: () => 0.99,
  });
  const restore = failReplayInsert(repository);

  assert.throws(() => service.adventure(player.id), /replay store unavailable/);
  assert.equal(repository.getPlayer(player.id).threadDust, 0);
  assert.equal(repository.getPlayer(player.id).currentHealth, 87);
  assert.equal(progression.get(player.id).experience, 0);
  assert.equal(buffs.listActive(player.id)[0].remainingFights, 1);
  assert.equal(cooldown.get(player.id, { now: NOW }).ready, true);
  assert.equal(repository.getCombatResult(`adventure:${player.id}:2026-09-13T00:00:45.000Z`), null);
  assert.equal(events.length, 0);

  restore();
  const result = service.adventure(player.id);
  const stored = repository.getCombatResult(`adventure:${player.id}:2026-09-13T00:00:45.000Z`);
  assert.ok(stored.result.battleReplay.arenaReplay);
  assert.deepEqual(stored.result.battleReplay, result.battleReplay);
  assert.equal(buffs.listActive(player.id).length, 0);
  repository.close();
});
