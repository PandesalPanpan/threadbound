import { automaticBattleSkill } from './AutomaticBattleSkillCatalog.js';
import { projectCombatantWithAutomaticEffects } from './AutomaticBattleEffectPolicy.js';

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function skillDamage(actor, target, bonus = 0) {
  const projectedActor = projectCombatantWithAutomaticEffects(actor);
  const projectedTarget = projectCombatantWithAutomaticEffects(target);
  return Math.max(0, integer(projectedActor.attack, 1) - Math.max(0, integer(projectedTarget.defense, 0)) + integer(bonus));
}

function living(collection = []) {
  return collection.filter((combatant) => Number(combatant?.hp) > 0);
}

function adjustedDamage(actor, target, bonus, { multiplier = 1, executeBelowHpRatio = null, executeBonus = 0 } = {}) {
  const base = skillDamage(actor, target, bonus);
  const maxHp = Math.max(1, Number(target.maxHp || 1));
  const hpRatio = Math.max(0, Number(target.hp || 0) / maxHp);
  const execute = executeBelowHpRatio != null && hpRatio <= executeBelowHpRatio;
  return Math.max(0, Math.floor(base * multiplier) + (execute ? integer(executeBonus) : 0));
}

function otherTargets(primary, enemies) {
  return living(enemies).filter((combatant) => combatant.id !== primary.id);
}

function areaDamage(actor, primary, enemies, effect) {
  return otherTargets(primary, enemies).map((combatant) => ({
    targetId: combatant.id,
    damage: adjustedDamage(actor, combatant, effect.splashBonus || 0, { multiplier: effect.splashMultiplier || 1 }),
  }));
}

function areaEffects(primary, enemies, effects) {
  return [primary, ...otherTargets(primary, enemies)].filter((combatant) => combatant.hp > 0).map((combatant) => ({
    targetId: combatant.id,
    effects: effects.map((effect) => ({ ...effect })),
  }));
}

function allyHealing(actor, players, amount) {
  return living(players).filter((combatant) => combatant.id !== actor.id).map((combatant) => ({
    targetId: combatant.id,
    healing: Math.min(integer(amount), Math.max(0, Number(combatant.maxHp || 0) - Number(combatant.hp || 0))),
  }));
}

function allyMana(actor, players, amount) {
  return living(players).filter((combatant) => combatant.id !== actor.id).map((combatant) => ({ targetId: combatant.id, amount: integer(amount) }));
}

/**
 * Resolve an allowlisted signature skill into a constrained effect payload.
 * The catalog contains data only; this policy interprets its small effect
 * vocabulary and the simulator owns every HP, Mana, status, and defeat change.
 */
export function resolveAutomaticBattleSkill({ actor, target, skill, players = [], enemies = [] } = {}) {
  if (!actor || !target || !skill) throw new Error('Automatic battle skill resolution requires actor, target, and skill.');
  const skillId = String(skill.id || skill.skillId || '').trim().toLowerCase();
  const definition = automaticBattleSkill(skillId);
  const effect = definition.effect;
  const foes = actor.team === 'enemies' ? players : enemies;
  const allies = actor.team === 'enemies' ? enemies : players;
  const damage = adjustedDamage(actor, target, effect.damageBonus || 0, {
    multiplier: effect.damageMultiplier ?? (effect.kind === 'party-heal' ? 0 : 1),
    executeBelowHpRatio: effect.executeBelowHpRatio,
    executeBonus: effect.executeBonus || 0,
  });
  const action = {
    targetDamage: damage,
    metadata: { kind: 'skill', skillId, emphasis: effect.kind },
  };

  if (effect.splash === 'all') action.targetDamages = areaDamage(actor, target, foes, effect);
  else if (effect.splash === 'one') {
    const splashTarget = otherTargets(target, foes)[0];
    action.targetDamages = splashTarget ? [{
      targetId: splashTarget.id,
      damage: adjustedDamage(actor, splashTarget, effect.splashBonus || 0, { multiplier: effect.splashMultiplier || 1 }),
    }] : [];
  }

  if (effect.targetEffects?.length) action.targetEffects = effect.targetEffects.map((entry) => ({ ...entry }));
  if (effect.targetEffectsAll && effect.targetEffects?.length) {
    action.targetEffectsByTarget = areaEffects(target, foes, effect.targetEffects);
    delete action.targetEffects;
  }
  if (effect.selfEffects?.length) action.selfEffects = effect.selfEffects.map((entry) => ({ ...entry }));
  if (effect.allyEffects?.length) {
    action.allyEffects = living(allies)
      .filter((combatant) => combatant.id !== actor.id)
      .map((combatant) => ({ targetId: combatant.id, effects: effect.allyEffects.map((entry) => ({ ...entry })) }));
  }
  if (effect.selfDamage) action.selfDamage = Math.min(integer(effect.selfDamage), Math.max(0, Number(actor.hp || 0) - 1));
  if (effect.selfHealing) action.selfHealing = integer(effect.selfHealing);
  if (effect.lifestealPercent) action.lifestealPercent = Number(effect.lifestealPercent);
  if (effect.allyHeal) action.allyHealing = allyHealing(actor, allies, effect.allyHeal);
  if (effect.allyMana) action.allyMana = allyMana(actor, allies, effect.allyMana);
  return action;
}
