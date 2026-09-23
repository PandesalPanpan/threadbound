import test from 'node:test';
import assert from 'node:assert/strict';
import { HuntService } from '../src/application/HuntService.js';
import { resolveAutomaticHunt } from '../src/domain/HuntEncounter.js';
import { itemRewardProfileForArea } from '../src/content/AreaContentCatalog.js';
import { SQLitePlayerProgressionRepository } from '../src/infrastructure/SQLitePlayerProgressionRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { AreaProgression } from '../src/domain/AreaProgression.js';
import { ItemGenerator } from '../src/domain/ItemGenerator.js';

test('automatic Hunt preserves the familiar baseline while shared simulator owns turn history and HP', () => {
  const result = resolveAutomaticHunt({
    player: {
      id: 'hero',
      name: 'Adventurer',
      attack: 6,
      defense: 2,
      maxHp: 40,
      speed: 10,
      critChance: 0.05,
      equipment: {},
    },
    currentHealth: 40,
    enemyRoll: 0.99,
    random: () => 0.99,
  });

  assert.equal(result.enemy.id, 'thread-wolf');
  assert.equal(result.victory, true);
  assert.equal(result.remainingHp, 32);
  assert.equal(result.damageTaken, 8);
  assert.equal(result.attacksRequired, 3);
  assert.equal(result.battle.context.activity, 'hunt');
  assert.equal(result.battle.winnerId, 'hero');
  assert.deepEqual(result.battle.turns.map((turn) => turn.actorId), [
    'hero', 'hunt-enemy:thread-wolf', 'hero', 'hunt-enemy:thread-wolf', 'hero',
  ]);
  assert.equal(result.battle.turns[0].metadata.kind, 'basic-attack');
});

test('Hunt consumes shared Speed and constrained equipment-effect semantics', () => {
  const result = resolveAutomaticHunt({
    player: {
      id: 'fast-hero',
      name: 'Fast Adventurer',
      attack: 6,
      defense: 2,
      maxHp: 40,
      speed: 20,
      critChance: 0,
      equipment: {
        weapon: { id: 'opening-weapon', effectCode: 'opening_strike', attackBonus: 0 },
      },
    },
    currentHealth: 40,
    enemyRoll: 0.99,
    random: () => 0.99,
  });

  assert.equal(result.battle.turns[0].metadata.equipmentBonusDamage, 2);
  assert.equal(result.battle.turns[0].targetDamage, 8);
  assert.equal(result.battle.turns[1].actorId, 'fast-hero', 'Speed can grant a consecutive Hunt action');
  assert.equal(result.battle.turns[1].metadata.equipmentBonusDamage, 0, 'opening strike only applies to the first action');
});

test('HuntService persists the shared simulator result while retaining one-command rewards and event compatibility', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'hunt-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'hunt-user', displayName: 'Adventurer' });
  const events = [];
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    rng: () => 0.99,
  });

  const result = service.hunt(player.id);
  const event = events.find((entry) => entry.type === 'HuntResolved');

  assert.equal(result.battle.context.activity, 'hunt');
  assert.equal(result.battle.outcome, 'victory');
  assert.equal(repository.getPlayer(player.id).currentHealth, result.remainingHp);
  assert.equal(repository.getPlayer(player.id).threadDust, result.gold);
  assert.equal(event.battleOutcome, result.battle.outcome);
  assert.equal(event.battleTurnCount, result.battle.turns.length);
  assert.equal(event.remainingHp, result.remainingHp);
  assert.equal(event.gold, result.gold);
  assert.equal(event.experienceGained, result.experience);
  assert.deepEqual(event.questProgress, []);
  assert.equal(
    result.battleReplay.details.combatants.find((combatant) => combatant.id === `hunt-enemy:${result.enemy.id}`).signatureSkill.id,
    result.enemy.skillCode,
  );

  repository.close();
});

test('Hunt applies level Max HP after combat damage and publishes the post-growth Health snapshot', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'hunt-growth-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'hunt-growth', displayName: 'Leveling Hunter' });
  repository.db.prepare('UPDATE players SET base_attack = 30, max_health = 40, current_health = 30 WHERE id = ?').run(player.id);
  const progressionRepository = new SQLitePlayerProgressionRepository({ database: repository.db });
  progressionRepository.grantExperience(player.id, 49);
  const events = [];
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    progressionRepository,
    huntCooldownSeconds: 0,
    rng: () => 0.99,
  });

  const result = service.hunt(player.id);
  const receipt = events.find((event) => event.type === 'HuntResolved');
  const persisted = repository.getPlayer(player.id);

  assert.equal(result.victory, true);
  assert.ok(result.damageTaken > 0, 'the enemy acts before the stronger hunter wins');
  assert.equal(result.levelsGained, 1);
  assert.equal(result.maxHealthIncrease, 3);
  assert.equal(result.remainingHp, result.startingHp - result.damageTaken + 3);
  assert.equal(result.maxHealth, 43);
  assert.equal(persisted.currentHealth, result.remainingHp, 'later service writes must not overwrite the growth heal');
  assert.equal(persisted.maxHealth, result.maxHealth);
  assert.equal(receipt.remainingHp, result.remainingHp);
  assert.equal(receipt.maxHp, 43);
  assert.equal(receipt.currentHealth, result.remainingHp);
  assert.equal(receipt.maxHealthIncrease, 3);
  assert.equal(receipt.levelsGained, 1);
  repository.close();
});

test('Hunt item drops use the current Area official equipment profile and report actual bonuses', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'hunt-loot-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'hunt-loot', displayName: 'Loot Hunter' });
  repository.db.prepare('UPDATE players SET base_attack = 50 WHERE id = ?').run(player.id);
  const events = [];
  const service = new HuntService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    huntCooldownSeconds: 0,
    rng: () => 0.1,
  });

  const result = service.hunt(player.id);
  const receipt = events.find((event) => event.type === 'HuntResolved');
  const item = result.item;
  const profile = itemRewardProfileForArea(1);
  const expectedStats = {
    attackBonus: Number(item.attackBonus || item.stats?.attackBonus || 0),
    defenseBonus: Number(item.defenseBonus || item.stats?.defenseBonus || 0),
    maxHpBonus: Number(item.maxHpBonus || item.stats?.maxHpBonus || 0),
    speedBonus: Number(item.speedBonus || item.stats?.speedBonus || 0),
    critChanceBonus: Number(item.critChanceBonus || item.stats?.critChanceBonus || 0),
  };

  assert.equal(result.enemy.id, 'bouncebud-slime');
  assert.ok(result.victory);
  assert.ok(item, 'the seeded Area 1 loot roll produces an item');
  assert.ok(profile.equipmentOptions[item.slot].some((option) => option.visualAssetId === item.visualAssetId));
  assert.equal(receipt.itemSlot, item.slot);
  assert.deepEqual(receipt.itemStats, expectedStats);
  repository.close();
});

test('Area 4 Hunt resolves an authored enemy and generates rare gear from the Area 4 profile', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'hunt-area-four-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'hunt-area-four', displayName: 'Mirrorfen Hunter' });
  repository.db.prepare('UPDATE players SET base_attack = 1000 WHERE id = ?').run(player.id);
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  areaRepository.save(player.id, new AreaProgression({ currentAreaNumber: 4, highestUnlockedAreaNumber: 4 }));
  const service = new HuntService({
    repository,
    eventBus: { publish() {} },
    huntCooldownSeconds: 0,
    rng: () => 0.1,
    itemGenerator: new ItemGenerator({ rng: () => 0.5, idFactory: () => 'area-four-generated-item' }),
  });

  const result = service.hunt(player.id);
  const profile = itemRewardProfileForArea(4);
  assert.equal(result.enemy.id, 'glass-skulker');
  assert.ok(result.victory);
  assert.equal(result.item?.rarity, 'rare');
  assert.equal(result.item?.areaNumber, 4);
  assert.ok(profile.equipmentOptions[result.item.slot].some((option) => option.visualAssetId === result.item.visualAssetId
    && option.materialFamily === result.item.materialFamily));
  repository.close();
});
