import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureService } from '../src/application/AdventureService.js';
import { CookingService } from '../src/application/CookingService.js';
import { HuntService } from '../src/application/HuntService.js';
import { resolveActivityCooldown } from '../src/domain/ActivityCooldownPolicy.js';
import { normalizeCookingRecipe } from '../src/domain/CookingRecipePolicy.js';
import { applyFightBuffs } from '../src/domain/FightBuffPolicy.js';
import { SQLiteFightBuffRepository } from '../src/infrastructure/SQLiteFightBuffRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function recipe(overrides = {}) {
  return {
    id: 'spicy-wyvern-stew',
    name: 'Spicy Wyvern Stew',
    areaNumber: 1,
    ingredients: [
      { itemDefinitionId: 'wyvern-meat', quantity: 2 },
      { itemDefinitionId: 'red-herb', quantity: 1 },
    ],
    buff: { code: 'attack_boost_minor', fights: 2 },
    ...overrides,
  };
}

function ingredient(id, definitionId, { source = 'test' } = {}) {
  return {
    id,
    definitionId,
    name: definitionId,
    slot: 'accessory',
    rarity: 'common',
    rarityTier: 1,
    attackBonus: 0,
    effectCode: 'none',
    effect: { code: 'none', name: 'Ingredient', description: 'Cooking ingredient.' },
    visualAssetId: null,
    source,
  };
}

function seedIngredients(repository, playerId) {
  repository.addItem(playerId, ingredient('meat-1', 'wyvern-meat'));
  repository.addItem(playerId, ingredient('meat-2', 'wyvern-meat'));
  repository.addItem(playerId, ingredient('herb-1', 'red-herb'));
}

test('cooking recipes are item-to-buff contracts with fight counts and no wall-clock duration fields', () => {
  const normalized = normalizeCookingRecipe(recipe());
  assert.deepEqual(normalized.buff, { code: 'attack_boost_minor', fights: 2 });
  assert.equal(Object.isFrozen(normalized), true);

  assert.throws(
    () => normalizeCookingRecipe(recipe({ buff: { code: 'attack_boost_minor', fights: 2, durationSeconds: 600 } })),
    (error) => error.code === 'unsupported_cooking_buff_field',
  );
  assert.throws(
    () => normalizeCookingRecipe({ ...recipe(), expiresAt: '2026-09-13T12:00:00.000Z' }),
    (error) => error.code === 'unsupported_cooking_recipe_field',
  );
  assert.throws(
    () => normalizeCookingRecipe(recipe({ buff: { code: 'generated_script_buff', fights: 2 } })),
    (error) => error.code === 'unsupported_cooking_buff_code',
  );
});

test('allowlisted attack food changes authoritative combat stats while stat-only buffs do not alter cooldowns', () => {
  const applied = applyFightBuffs({ attack: 10, defense: 2, maxHp: 40, speed: 10, critChance: 0.05 }, ['attack_boost_minor']);
  assert.equal(applied.stats.attack, 11);
  assert.equal(applied.appliedAttackIncreasePercent, 10);

  const cooldown = resolveActivityCooldown({
    activity: 'hunt',
    baseCooldownSeconds: 15,
    buffCodes: ['attack_boost_minor'],
  });
  assert.equal(cooldown.effectiveCooldownSeconds, 15);
  assert.equal(cooldown.modifiers.length, 0);
});

test('cooking consumes eligible ordinary item instances atomically and activates a durable fight-count buff', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'cook-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'cook-user', displayName: 'Cook' });
  seedIngredients(repository, player.id);
  const events = [];
  const service = new CookingService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    recipes: [recipe()],
  });
  const buffs = new SQLiteFightBuffRepository({ database: repository.db });

  const result = service.cook(player.id, 'spicy-wyvern-stew');
  assert.deepEqual([...result.consumedItemIds], ['meat-1', 'meat-2', 'herb-1']);
  assert.equal(repository.listItems(player.id).length, 0);
  assert.equal(result.buff.code, 'attack_boost_minor');
  assert.equal(result.buff.remainingFights, 2);
  assert.equal(buffs.listActive(player.id)[0].remainingFights, 2);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'FoodCooked');
  assert.equal(events[0].remainingFights, 2);

  assert.throws(() => service.cook(player.id, 'spicy-wyvern-stew'), (error) => error.code === 'cooking_buff_already_active');
  repository.close();
});

test('cooking never consumes Honey-owned items when satisfying ingredient requirements', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'protected-cook-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'protected-cook-user', displayName: 'Cook' });
  repository.addItem(player.id, ingredient('premium-meat', 'wyvern-meat', { source: 'honey-purchase' }));
  repository.addItem(player.id, ingredient('meat-2', 'wyvern-meat'));
  repository.addItem(player.id, ingredient('herb-1', 'red-herb'));
  const service = new CookingService({ repository, eventBus: { publish() {} }, recipes: [recipe()] });

  assert.throws(() => service.cook(player.id, 'spicy-wyvern-stew'), (error) => {
    assert.equal(error.code, 'cooking_ingredients_missing');
    assert.deepEqual(error.missing, [{ itemDefinitionId: 'wyvern-meat', missing: 1 }]);
    return true;
  });
  assert.ok(repository.getItem('premium-meat'));
  repository.close();
});

test('Hunt applies a food buff to the current fight and decrements it once only after each resolved fight', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'hunt-buff-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'hunt-buff-user', displayName: 'Buffed Hunter' });
  const buffs = new SQLiteFightBuffRepository({ database: repository.db });
  buffs.activate({ playerId: player.id, buffCode: 'attack_boost_minor', sourceRecipeId: 'stew', fights: 2 });

  const service = new HuntService({
    repository,
    eventBus: { publish() {} },
    fightBuffRepository: buffs,
    rng: () => 0,
    huntCooldownSeconds: 0,
  });

  const first = service.hunt(player.id);
  assert.equal(first.character.attackPower, 7);
  assert.equal(buffs.listActive(player.id)[0].remainingFights, 1);

  repository.setPlayerHealth(player.id, 40);
  const second = service.hunt(player.id);
  assert.equal(second.character.attackPower, 7);
  assert.deepEqual(buffs.listActive(player.id), []);

  repository.setPlayerHealth(player.id, 40);
  const third = service.hunt(player.id);
  assert.equal(third.character.attackPower, 6);
  repository.close();
});

test('ordinary Adventure also spends exactly one remaining fight after resolution', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'adventure-buff-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'adventure-buff-user', displayName: 'Buffed Adventurer' });
  const buffs = new SQLiteFightBuffRepository({ database: repository.db });
  buffs.activate({ playerId: player.id, buffCode: 'attack_boost_minor', sourceRecipeId: 'stew', fights: 1 });
  const service = new AdventureService({
    repository,
    eventBus: { publish() {} },
    fightBuffRepository: buffs,
    rng: () => 0,
    rewardRng: () => 0.99,
    storyRng: () => 0.99,
    adventureCooldownSeconds: 0,
  });

  const result = service.adventure(player.id);
  assert.equal(result.fightBuffs.modifiers[0].code, 'attack_boost_minor');
  assert.equal(result.fightBuffs.consumed[0].beforeFights, 1);
  assert.equal(result.fightBuffs.consumed[0].remainingFights, 0);
  assert.deepEqual(buffs.listActive(player.id), []);
  repository.close();
});
