import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../src/domain/Character.js';
import { deriveCharacterStats, publicBaseCharacterStats } from '../src/domain/CharacterStatPolicy.js';

test('canonical character stats are readable and preserve existing baseline combat values', () => {
  assert.deepEqual(publicBaseCharacterStats(), { defense: 2, speed: 10, critChance: 0.05 });
  assert.deepEqual(deriveCharacterStats({ baseAttack: 6, maxHealth: 40 }), {
    attack: 6,
    defense: 2,
    maxHp: 40,
    speed: 10,
    critChance: 0.05,
    critChancePercent: 5,
  });
});

test('Weapon Attack remains migration-compatible while explicit stat bonuses derive from the loadout', () => {
  const equipment = {
    weapon: { attackBonus: 4, critChanceBonus: 0.02 },
    helmet: { defenseBonus: 2, maxHpBonus: 3 },
    armor: { defenseBonus: 4, maxHealthBonus: 5 },
    boots: { speedBonus: 3 },
    accessory: { critChanceBonus: 0.08 },
  };

  assert.deepEqual(deriveCharacterStats({ baseAttack: 6, maxHealth: 40, equipment }), {
    attack: 10,
    defense: 8,
    maxHp: 48,
    speed: 13,
    critChance: 0.15000000000000002,
    critChancePercent: 15,
  });

  const character = new Character({
    id: 'player-1',
    threadedUserId: 'user-1',
    displayName: 'Adventurer',
    baseAttack: 6,
    maxHealth: 40,
    equippedItem: equipment.weapon,
    equipment,
  });
  assert.equal(character.attackPower, 10);
  assert.equal(character.stats.defense, 8);
  assert.equal(character.stats.maxHp, 48);
  assert.equal(character.stats.speed, 13);
  assert.equal(character.stats.critChancePercent, 15);
});

test('derived stats normalize malformed bonuses and clamp Crit Chance', () => {
  const stats = deriveCharacterStats({
    baseAttack: 6,
    maxHealth: 40,
    equipment: {
      weapon: { attackBonus: 'bad', critChanceBonus: 2 },
      armor: { defenseBonus: -99, maxHpBonus: -99, speedBonus: -99 },
    },
  });
  assert.equal(stats.attack, 6);
  assert.equal(stats.defense, 0);
  assert.equal(stats.maxHp, 1);
  assert.equal(stats.speed, 1);
  assert.equal(stats.critChance, 1);
  assert.equal(stats.critChancePercent, 100);
});
