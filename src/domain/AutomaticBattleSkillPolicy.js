import { projectCombatantWithAutomaticEffects } from './AutomaticBattleEffectPolicy.js';

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}
function skillDamage(actor, target, bonus = 0) {
  const projectedActor = projectCombatantWithAutomaticEffects(actor);
  const projectedTarget = projectCombatantWithAutomaticEffects(target);
  return Math.max(1, integer(projectedActor.attack, 1) - Math.max(0, integer(projectedTarget.defense, 0)) + integer(bonus));
}

function living(collection = []) {
  return collection.filter((combatant) => Number(combatant?.hp) > 0);
}

/**
 * Small, data-driven skill policy used by the automatic battle presentation.
 * The simulator still owns when a skill is affordable, Mana mutation, HP
 * mutation, defeat, and event ordering; this policy only describes the
 * authoritative effect payload for a selected skill.
 */
export function resolveAutomaticBattleSkill({ actor, target, skill, players = [], enemies = [] } = {}) {
  if (!actor || !target || !skill) throw new Error('Automatic battle skill resolution requires actor, target, and skill.');
  const skillId = String(skill.id || skill.skillId || '').trim();
  if (!skillId) throw new Error('Automatic battle skill requires an id.');

  const allies = living(players).filter((combatant) => combatant.id !== actor.id);
  const foes = living(enemies).filter((combatant) => combatant.id !== target.id);
  switch (skillId) {
    case 'threadsong':
      return {
        targetDamage: skillDamage(actor, target, 7),
        targetDamages: foes.map((combatant) => ({ targetId: combatant.id, damage: Math.max(1, skillDamage(actor, combatant, 2)) })),
        allyMana: allies.map((combatant) => ({ targetId: combatant.id, amount: 12 })),
        metadata: { kind: 'skill', skillId, emphasis: 'arcane-support' },
      };
    case 'thornwake':
      return {
        targetDamage: skillDamage(actor, target, 6),
        targetEffects: [{ type: 'poison', potency: 2, remainingTurns: 2 }],
        metadata: { kind: 'skill', skillId, emphasis: 'nature-control' },
      };
    case 'shield-break':
      return {
        targetDamage: skillDamage(actor, target, 8),
        targetDamages: foes.slice(0, 1).map((combatant) => ({ targetId: combatant.id, damage: Math.max(1, skillDamage(actor, combatant, 1)) })),
        metadata: { kind: 'skill', skillId, emphasis: 'frontline-impact' },
      };
    case 'ember-burst':
      return {
        targetDamage: skillDamage(actor, target, 6),
        targetDamages: foes.map((combatant) => ({ targetId: combatant.id, damage: Math.max(1, skillDamage(actor, combatant, 1)) })),
        targetEffects: [{ type: 'fire', potency: 2, remainingTurns: 2 }],
        metadata: { kind: 'skill', skillId, emphasis: 'fire-impact' },
      };
    case 'mire-song':
      return {
        targetDamage: skillDamage(actor, target, 4),
        targetEffects: [{ type: 'poison', potency: 2, remainingTurns: 2 }],
        metadata: { kind: 'skill', skillId, emphasis: 'poison-control' },
      };
    case 'shadow-lunge':
      return {
        targetDamage: skillDamage(actor, target, 7),
        metadata: { kind: 'skill', skillId, emphasis: 'shadow-impact' },
      };
    default:
      return {
        targetDamage: skillDamage(actor, target, integer(skill.damageBonus, 4)),
        metadata: { kind: 'skill', skillId, emphasis: 'skill-impact' },
      };
  }
}
