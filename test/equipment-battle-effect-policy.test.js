import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EQUIPMENT_EFFECT_CATALOG,
  applyEquipmentBattleEffects,
  createEquipmentAwareAutomaticBasicAttackResolver,
  equipmentBattleEffectDefinition,
  normalizeEquipmentBattleEffectDefinition,
} from '../src/domain/EquipmentBattleEffectPolicy.js';
import { simulateAutomaticBattle } from '../src/domain/AutomaticBattleSimulator.js';

function baseAction(damage = 3) {
  return { targetDamage: damage, metadata: { kind: 'basic-attack' } };
}

test('equipment effect catalog is constrained data backed by the automatic effect vocabulary', () => {
  assert.deepEqual(Object.keys(EQUIPMENT_EFFECT_CATALOG), [
    'none',
    'opening_strike',
    'boss_bane',
    'quick_hunt',
    'ember_edge',
    'venom_edge',
    'frost_edge',
    'mind_edge',
  ]);
  assert.deepEqual(equipmentBattleEffectDefinition('quick_hunt').mechanics, []);
  assert.equal(equipmentBattleEffectDefinition('ember_edge').mechanics[0].effect.type, 'fire');
  assert.equal(equipmentBattleEffectDefinition('venom_edge').mechanics[0].effect.type, 'poison');
  assert.equal(equipmentBattleEffectDefinition('frost_edge').mechanics[0].effect.type, 'ice');
  assert.equal(equipmentBattleEffectDefinition('mind_edge').mechanics[0].effect.type, 'psychic');
});

test('effect definition validation rejects arbitrary mechanics and executable-looking effect types', () => {
  assert.throws(() => normalizeEquipmentBattleEffectDefinition({
    code: 'unsafe',
    name: 'Unsafe',
    description: 'Must fail.',
    mechanics: [{ kind: 'run-code', trigger: 'on-hit', script: 'process.exit()' }],
  }), /Unsupported equipment effect mechanic kind/);

  assert.throws(() => normalizeEquipmentBattleEffectDefinition({
    code: 'unsafe-status',
    name: 'Unsafe Status',
    description: 'Must fail.',
    mechanics: [{ kind: 'apply-effect', trigger: 'on-hit', effect: { type: 'execute', potency: 99, remainingTurns: 99 } }],
  }), /Unsupported automatic battle effect type/);
});

test('legacy opening strike and boss bane resolve through authoritative data', () => {
  const actor = { id: 'hero' };
  const normalTarget = { id: 'wolf' };
  const bossTarget = { id: 'boss', isBoss: true };

  const opening = applyEquipmentBattleEffects({
    actor,
    target: normalTarget,
    turns: [],
    baseAction: baseAction(),
    effectCodes: ['opening_strike'],
  });
  assert.equal(opening.targetDamage, 5);
  assert.equal(opening.metadata.equipmentBonusDamage, 2);

  const laterOpening = applyEquipmentBattleEffects({
    actor,
    target: normalTarget,
    turns: [{ actorId: 'hero', targetId: 'wolf' }],
    baseAction: baseAction(),
    effectCodes: ['opening_strike'],
  });
  assert.equal(laterOpening.targetDamage, 3);

  const bossBane = applyEquipmentBattleEffects({
    actor,
    target: bossTarget,
    turns: [],
    baseAction: baseAction(),
    effectCodes: ['boss_bane'],
  });
  assert.equal(bossBane.targetDamage, 5);
});

test('serialized item effect payload cannot inject mechanics; effectCode selects the authoritative catalog', () => {
  const action = applyEquipmentBattleEffects({
    actor: {
      id: 'hero',
      equipment: {
        weapon: {
          id: 'weapon-1',
          effectCode: 'ember_edge',
          effect: {
            mechanics: [{ kind: 'bonus-damage', amount: 999999 }],
            script: 'arbitrary-code',
          },
        },
      },
    },
    target: { id: 'wolf' },
    turns: [],
    baseAction: baseAction(),
  });

  assert.equal(action.targetDamage, 3);
  assert.deepEqual(action.targetEffects, [{ type: 'fire', potency: 2, remainingTurns: 2 }]);
  assert.deepEqual(action.metadata.equipmentEffects.map((entry) => entry.effectCode), ['ember_edge']);
});

test('unknown persisted effect codes fail closed instead of becoming executable generated mechanics', () => {
  assert.throws(() => applyEquipmentBattleEffects({
    actor: { id: 'hero', equipmentEffectCodes: ['totally_generated_code'] },
    target: { id: 'wolf' },
    turns: [],
    baseAction: baseAction(),
  }), /Unsupported equipment effect code/);
});

test('equipment-aware automatic attacks feed elemental effects into resistance-aware shared simulation', () => {
  const resolver = createEquipmentAwareAutomaticBasicAttackResolver({ random: () => 0.99 });
  const result = simulateAutomaticBattle(
    { resolveAction: resolver, maxTurns: 2 },
    {
      combatants: [
        {
          id: 'hero',
          hp: 20,
          maxHp: 20,
          attack: 4,
          defense: 0,
          speed: 10,
          critChance: 0,
          equipment: { weapon: { id: 'ember-weapon', effectCode: 'ember_edge' } },
        },
        {
          id: 'wolf',
          hp: 20,
          maxHp: 20,
          attack: 1,
          defense: 0,
          speed: 1,
          critChance: 0,
          resistances: { fire: 'resistant' },
        },
      ],
    },
  );

  const firstTurn = result.turns[0];
  assert.equal(firstTurn.actorId, 'hero');
  assert.deepEqual(firstTurn.metadata.equipmentEffects.map((entry) => entry.appliedEffect), ['fire']);
  assert.equal(firstTurn.metadata.effectApplications[0].resistanceLevel, 'resistant');
  assert.equal(firstTurn.metadata.effectApplications[0].incomingPotency, 2);
  assert.equal(firstTurn.metadata.effectApplications[0].appliedPotency, 1);
  assert.equal(result.combatants.find((entry) => entry.id === 'wolf').effects[0].type, 'fire');
  assert.equal(result.combatants.find((entry) => entry.id === 'wolf').effects[0].potency, 1);
});
