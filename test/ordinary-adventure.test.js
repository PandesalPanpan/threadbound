import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureService } from '../src/application/AdventureService.js';
import { ADVENTURE_COOLDOWN_SECONDS, resolveAdventureRewards } from '../src/domain/AdventureRewardPolicy.js';
import { resolveOrdinaryAdventure } from '../src/domain/AdventureEncounter.js';
import { pickAreaAdventureEncounter } from '../src/content/AreaContentCatalog.js';
import { itemRewardProfileForArea } from '../src/content/AreaContentCatalog.js';
import { SQLitePlayerProgressionRepository } from '../src/infrastructure/SQLitePlayerProgressionRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function baselinePlayer(overrides = {}) {
  return {
    id: 'player-1',
    name: 'Adventurer',
    displayName: 'Adventurer',
    attack: 10,
    defense: 2,
    maxHp: 40,
    speed: 10,
    critChance: 0,
    equipment: {},
    ...overrides,
  };
}

test('ordinary Adventure resolves through the shared automatic battle engine using the Area encounter snapshot', () => {
  const result = resolveOrdinaryAdventure({
    player: baselinePlayer(),
    currentHealth: 40,
    areaNumber: 1,
    encounterRoll: 0,
    random: () => 0.99,
  });

  assert.equal(result.areaNumber, 1);
  assert.equal(result.enemy.id, 'thread-wolf');
  assert.equal(result.enemy.hp, 24);
  assert.equal(result.battle.context.activity, 'adventure');
  assert.equal(result.battle.context.areaNumber, 1);
  assert.ok(result.battle.turns.length > 0);
  assert.equal(typeof result.victory, 'boolean');
  assert.ok(result.remainingHp >= 0 && result.remainingHp <= 40);
});

test('ordinary Adventure fails closed when the current Area has no configured encounter', () => {
  assert.throws(
    () => resolveOrdinaryAdventure({
      player: baselinePlayer(),
      currentHealth: 40,
      areaNumber: 2,
      random: () => 0.99,
    }),
    (error) => error.code === 'adventure_unavailable_in_area',
  );
});

test('Adventure reward policy is more rewarding than Area 1 Hunt and projects constrained story/drop outcomes', () => {
  const reward = resolveAdventureRewards({ areaNumber: 1, victory: true, lootRoll: 0, storyRoll: 0 });
  assert.equal(reward.gold, 6);
  assert.equal(reward.experience, 30);
  assert.equal(reward.drop, true);
  assert.equal(reward.storyEvent.id, 'area-trail-signs');

  const defeat = resolveAdventureRewards({ areaNumber: 1, victory: false, lootRoll: 0, storyRoll: 0 });
  assert.deepEqual(defeat, { gold: 0, experience: 0, drop: false, storyEvent: null, dropChance: 0 });
});

test('AdventureService reads persisted Area, commits rewards/progression, and publishes authoritative cooldown projection', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'adventure-user', displayName: 'Adventurer' });
  repository.db.prepare('UPDATE players SET base_attack = 1, max_health = 1000, current_health = 1000 WHERE id = ?').run(player.id);
  const events = [];
  const now = new Date('2026-09-13T00:00:00.000Z');
  const service = new AdventureService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
    rewardRng: () => 0.99,
    storyRng: () => 0.99,
    now: () => now,
  });

  const before = repository.getPlayer(player.id).currentHealth;
  const result = service.adventure(player.id);
  const after = repository.getPlayer(player.id).currentHealth;
  const expectedEncounter = pickAreaAdventureEncounter(1, 0.99);

  assert.equal(result.area.id, 'area-1');
  assert.equal(result.enemy.id, expectedEncounter.id);
  assert.equal(after, result.remainingHp);
  assert.ok(after <= before);
  assert.equal(result.rewards.gold, result.victory ? 6 : 0);
  assert.equal(result.rewards.experience, result.victory ? 30 : 0);
  const playerSkill = result.battle.turns.find((turn) => turn.actorId === player.id && turn.metadata.actionType === 'skill');
  assert.ok(playerSkill, 'a real Area Adventure can build Mana to a signature skill cast');
  assert.equal(playerSkill.metadata.skillId, 'threadsong');
  assert.equal(playerSkill.actorManaBefore, 100);
  assert.equal(playerSkill.actorManaAfter, 0);
  assert.ok(result.battleReplay, 'ordinary Adventure returns the authoritative replay projection');
  const enemyReplay = result.battleReplay.details.combatants.find((combatant) => combatant.id === `adventure-enemy:${expectedEncounter.id}`);
  assert.equal(enemyReplay.signatureSkill.id, expectedEncounter.skillCode);
  assert.equal(result.cooldown.remainingSeconds, ADVENTURE_COOLDOWN_SECONDS);
  assert.equal(result.cooldown.nextReadyAt, '2026-09-13T00:00:45.000Z');

  const receiptEvent = events.find((event) => event.type === 'AdventureResolved');
  assert.ok(receiptEvent);
  assert.equal(receiptEvent.playerId, player.id);
  assert.equal(receiptEvent.areaId, 'area-1');
  assert.equal(receiptEvent.areaNumber, 1);
  assert.equal(receiptEvent.enemyId, expectedEncounter.id);
  assert.equal(receiptEvent.battleReplay.receipt.outcome, result.battle.outcome);
  assert.equal(receiptEvent.gold, result.victory ? 6 : 0);
  assert.equal(receiptEvent.experienceGained, result.victory ? 30 : 0);
  assert.equal(receiptEvent.nextAdventureReadyAt, '2026-09-13T00:00:45.000Z');
});

test('Adventure grants level Max HP after damage, uses Area loot options, and carries its replay', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'adventure-growth-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'adventure-growth', displayName: 'Leveling Adventurer' });
  repository.db.prepare('UPDATE players SET base_attack = 5, max_health = 40, current_health = 30 WHERE id = ?').run(player.id);
  const progressionRepository = new SQLitePlayerProgressionRepository({ database: repository.db });
  progressionRepository.grantExperience(player.id, 49);
  const events = [];
  const service = new AdventureService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    progressionRepository,
    rng: () => 0.99,
    rewardRng: () => 0,
    storyRng: () => 0.99,
    now: () => new Date('2026-09-13T00:00:00.000Z'),
  });

  const result = service.adventure(player.id);
  const receipt = events.find((event) => event.type === 'AdventureResolved');
  const item = result.rewards.item;
  const profile = itemRewardProfileForArea(1);
  const expectedStats = {
    attackBonus: Number(item.attackBonus || item.stats?.attackBonus || 0),
    defenseBonus: Number(item.defenseBonus || item.stats?.defenseBonus || 0),
    maxHpBonus: Number(item.maxHpBonus || item.stats?.maxHpBonus || 0),
    speedBonus: Number(item.speedBonus || item.stats?.speedBonus || 0),
    critChanceBonus: Number(item.critChanceBonus || item.stats?.critChanceBonus || 0),
    healingPowerBonus: Number(item.healingPowerBonus || item.stats?.healingPowerBonus || 0),
    attackSpeedBonus: Number(item.attackSpeedBonus || item.stats?.attackSpeedBonus || 0),
    movementSpeedBonus: Number(item.movementSpeedBonus || item.stats?.movementSpeedBonus || 0),
  };

  assert.equal(result.enemy.id, pickAreaAdventureEncounter(1, 0.99).id);
  assert.equal(result.victory, true);
  assert.ok(result.damageTaken > 0);
  assert.equal(result.levelsGained, 1);
  assert.equal(result.maxHealthIncrease, 3);
  assert.equal(result.remainingHp, result.startingHp - result.damageTaken + 3);
  assert.equal(result.maxHealth, 43);
  assert.equal(repository.getPlayer(player.id).currentHealth, result.remainingHp);
  assert.equal(repository.getPlayer(player.id).maxHealth, 43);
  assert.ok(result.battleReplay.details.turnCount > 0);
  assert.equal(receipt.battleReplay.receipt.outcome, result.battle.outcome);
  assert.equal(receipt.remainingHp, result.remainingHp);
  assert.equal(receipt.maxHp, 43);
  assert.equal(receipt.maxHealthIncrease, 3);
  assert.equal(receipt.levelsGained, 1);
  assert.ok(item, 'the forced Area reward roll generates loot');
  assert.ok(profile.equipmentOptions[item.slot].some((option) => option.visualAssetId === item.visualAssetId));
  assert.equal(receipt.itemSlot, item.slot);
  assert.deepEqual(receipt.itemStats, expectedStats);
  repository.close();
});

test('Adventure persists its versioned result while cooldown rejects a second reward command', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'cooldown-adventure-user', displayName: 'Adventurer' });
  const events = [];
  const service = new AdventureService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
    rewardRng: () => 0.99,
    storyRng: () => 0.99,
    now: () => new Date('2026-09-13T00:00:00.000Z'),
  });
  const first = service.adventure(player.id);
  const goldAfterFirst = repository.getPlayer(player.id).gold;
  const saved = repository.getCombatResult(`adventure:${player.id}:2026-09-13T00:00:45.000Z`);
  assert.ok(saved.result.battleReplay.arenaReplay, 'the versioned arena replay is stored beside the result');
  assert.deepEqual(saved.result.battleReplay, first.battleReplay);
  assert.equal(first.cooldown.nextReadyAt, '2026-09-13T00:00:45.000Z');
  assert.throws(() => service.adventure(player.id), (error) => error.code === 'adventure_cooldown');
  assert.equal(repository.getPlayer(player.id).gold, goldAfterFirst);
  assert.equal(events.filter((event) => event.type === 'AdventureResolved').length, 1);
});

test('AdventureService refuses ordinary Adventure while the player is wounded to zero', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'blocked-adventure-user', displayName: 'Adventurer' });
  const service = new AdventureService({ repository, eventBus: { publish() {} }, rng: () => 0.99 });

  repository.setPlayerHealth(player.id, 0);
  assert.throws(() => service.adventure(player.id), (error) => error.code === 'too_wounded_to_adventure');
});
