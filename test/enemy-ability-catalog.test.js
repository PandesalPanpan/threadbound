import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_ABILITY_CATALOG } from '../src/domain/CombatIntentPolicy.js';
import { ALLOWED_ENEMY_ABILITIES, ArcManifestValidator } from '../src/application/ArcManifestValidator.js';

function manifestWithAbilities(enemyAbility, bossAbility) {
  return {
    manifestVersion: 1,
    arc: {
      id: 'pressure-arc',
      title: 'Pressure Arc',
      premise: 'A test arc for constrained combat profiles.',
      progression: { metric: 'dungeon_clears', target: 1 },
    },
    lore: [],
    enemies: [{ id: 'pressure-enemy', name: 'Pressure Enemy', baseHp: 12, retaliation: 2, abilities: [enemyAbility] }],
    bosses: [{ id: 'pressure-boss', name: 'Pressure Boss', baseHp: 24, retaliation: 4, abilities: [bossAbility] }],
    dungeons: [{
      id: 'pressure-dungeon',
      name: 'Pressure Dungeon',
      recommendedPlayers: 1,
      encounters: ['pressure-enemy'],
      bossId: 'pressure-boss',
      rewardPoolId: 'pressure-pool',
    }],
    itemPools: [{
      id: 'pressure-pool',
      items: [{ id: 'pressure-relic', namePattern: 'Pressure Relic', rarity: 'common', attackBonus: 1, effects: ['none'] }],
    }],
    achievements: [],
    historicalConsequences: [],
  };
}

test('manifest validation derives its enemy ability allow-list from the domain catalog', () => {
  assert.deepEqual([...ALLOWED_ENEMY_ABILITIES].sort(), Object.keys(ENEMY_ABILITY_CATALOG).sort());
});

test('Arc Manifests can opt generated enemies into heavy or recovery pressure', () => {
  const validator = new ArcManifestValidator();
  const result = validator.validate(manifestWithAbilities('heavy_pressure', 'self_mend'));

  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('Arc Manifests still reject mechanics outside the constrained domain vocabulary', () => {
  const validator = new ArcManifestValidator();
  const result = validator.validate(manifestWithAbilities('execute_arbitrary_code', 'self_mend'));

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((entry) => entry.code === 'unsupported_enemy_ability'), true);
});
