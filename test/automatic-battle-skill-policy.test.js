import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automaticBattleSkill,
  automaticBattleSkillForWeaponFamily,
  prepareAutomaticBattleCombatant,
} from '../src/domain/AutomaticBattleSkillCatalog.js';
import { resolveAutomaticBattleSkill } from '../src/domain/AutomaticBattleSkillPolicy.js';
import { simulateAutomaticBattle } from '../src/domain/AutomaticBattleSimulator.js';

test('signature skills are allowlisted, weapon families map to stable skills, and arbitrary codes fail closed', () => {
  assert.equal(automaticBattleSkillForWeaponFamily('dagger').id, 'shadow-lunge');
  assert.equal(automaticBattleSkillForWeaponFamily('axe').id, 'blood-pact');
  assert.equal(prepareAutomaticBattleCombatant({ id: 'sellsword', equipment: { weapon: { family: 'bow' } } }).skills[0].id, 'thornwake');
  assert.throws(() => automaticBattleSkill('not-a-thread-skill'), (error) => error.code === 'unknown_automatic_battle_skill');
  assert.throws(() => resolveAutomaticBattleSkill({
    actor: { id: 'hero', attack: 10, hp: 20 },
    target: { id: 'enemy', defense: 0, hp: 20, maxHp: 20 },
    skill: { id: 'generated-script', damageBonus: 999 },
  }), (error) => error.code === 'unknown_automatic_battle_skill');
});

test('skill policy gives distinct damage, area, status, healing, and support payloads', () => {
  const actor = { id: 'hero', attack: 12, hp: 18, maxHp: 30 };
  const target = { id: 'enemy-a', attack: 8, defense: 3, hp: 20, maxHp: 30 };
  const second = { id: 'enemy-b', attack: 8, defense: 1, hp: 18, maxHp: 30 };
  const ally = { id: 'ally', hp: 5, maxHp: 20, mana: 8, maxMana: 100 };
  const enemies = [target, second];

  const heavy = resolveAutomaticBattleSkill({ actor, target, skill: automaticBattleSkill('shield-break'), enemies });
  assert.equal(heavy.targetDamage, 20);
  assert.deepEqual(heavy.targetEffects, [{ type: 'defense-down', potency: 3, remainingTurns: 2 }]);

  const burst = resolveAutomaticBattleSkill({ actor, target, skill: automaticBattleSkill('ember-burst'), enemies });
  assert.equal(burst.targetDamages.length, 1);
  assert.equal(burst.targetEffectsByTarget.length, 2);
  assert.equal(burst.targetDamages[0].targetId, 'enemy-b');

  const heal = resolveAutomaticBattleSkill({
    actor: { ...actor, hp: 10, maxHp: 30, mana: 0, maxMana: 100 },
    target,
    skill: automaticBattleSkill('mending-chorus'),
    players: [{ ...actor, hp: 10, maxHp: 30, mana: 0, maxMana: 100 }, ally],
    enemies,
  });
  assert.equal(heal.targetDamage, 0);
  assert.equal(heal.selfHealing, 12);
  assert.deepEqual(heal.allyHealing, [{ targetId: 'ally', healing: 10 }]);
  assert.deepEqual(heal.allyMana, [{ targetId: 'ally', amount: 18 }]);

  const pact = resolveAutomaticBattleSkill({ actor, target, skill: automaticBattleSkill('blood-pact'), enemies });
  assert.equal(pact.selfDamage, 5);
  assert.equal(pact.lifestealPercent, 0.5);
});

test('automatic skill casts apply bounded sacrifice/lifesteal, status effects, and Mana from damage', () => {
  const bloodPact = simulateAutomaticBattle(
    {
      selectActor: () => 'hero',
      resolveAction: () => ({ targetDamage: 1 }),
      resolveSkill: resolveAutomaticBattleSkill,
      maxTurns: 1,
    },
    {
      players: [{
        id: 'hero', name: 'Hero', hp: 20, maxHp: 30, attack: 12, defense: 2, speed: 10,
        mana: 100, maxMana: 100, skills: [{ id: 'blood-pact' }],
      }],
      enemies: [{ id: 'enemy', name: 'Enemy', hp: 60, maxHp: 60, attack: 5, defense: 0, speed: 1 }],
    },
  );
  const cast = bloodPact.turns[0];
  assert.equal(cast.metadata.actionType, 'skill');
  assert.equal(cast.metadata.skillId, 'blood-pact');
  assert.equal(cast.selfDamage, 5);
  assert.equal(cast.lifestealHealing, 14);
  assert.equal(bloodPact.players[0].hp, 29);
  assert.equal(bloodPact.players[0].mana, 0);

  const manaAfterHit = simulateAutomaticBattle(
    {
      selectActor: () => 'enemy',
      resolveAction: () => ({ targetDamage: 3 }),
      maxTurns: 1,
    },
    {
      players: [{ id: 'hero', hp: 20, maxHp: 20, speed: 1, mana: 0, manaGain: 0, manaGainOnDamage: 7 }],
      enemies: [{ id: 'enemy', hp: 20, maxHp: 20, speed: 10, mana: 0, manaGain: 0 }],
    },
  );
  assert.equal(manaAfterHit.players[0].mana, 7);
  assert.ok(manaAfterHit.events.some((event) => event.type === 'ManaChanged' && event.combatantId === 'hero' && event.reason === 'damage-taken'));
});
