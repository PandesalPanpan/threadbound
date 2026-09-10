import { combatSkill } from './CombatSkillCatalog.js';

/**
 * Compatibility policy for the simplified chat-first combat loop.
 *
 * DungeonRun remains the authoritative combat Domain Model for persisted legacy runs.
 * New AdventureRun aggregates opt into streamlinedSkills and pass through this policy so
 * the old Focus / Exposed vocabulary is adapted away without a destructive migration.
 */
export function prepareStreamlinedCombatState(state, method, args = {}) {
  const prepared = structuredClone(state);
  if (!prepared.streamlinedSkills) return prepared;

  for (const participant of prepared.participants || []) participant.focus = 0;
  if (prepared.enemy?.statuses) prepared.enemy.statuses.exposed = 0;

  // DungeonRun's legacy skill command still validates Focus. Seed only the transient copy
  // used for resolution; finalizeStreamlinedCombatOutcome removes that compatibility detail
  // before the aggregate state or events can escape this boundary.
  if (method === 'useSkill') {
    const skill = combatSkill(args?.skillId);
    const actor = prepared.participants?.find((participant) => participant.playerId === args?.playerId);
    if (actor) actor.focus = Math.max(Number(actor.focus || 0), Number(skill.cost || 0));
  }

  return prepared;
}

export function finalizeStreamlinedCombatOutcome(outcome) {
  if (!outcome?.state?.streamlinedSkills) return outcome;

  const state = structuredClone(outcome.state);
  for (const participant of state.participants || []) participant.focus = 0;
  if (state.enemy?.statuses) state.enemy.statuses.exposed = 0;

  const events = (outcome.events || [])
    .filter((event) => event.type !== 'FocusChanged')
    .filter((event) => !(event.type === 'EnemyStatusApplied' && event.status === 'exposed'))
    .filter((event) => !(event.type === 'SkillComboTriggered' && event.combo === 'exposed'))
    .map((event) => {
      if (event.type === 'CombatSkillUsed') return { ...event, focusCost: 0 };
      if (event.type === 'CombatReactionSucceeded') return { ...event, focusGain: 0 };
      return event;
    });

  return { ...outcome, state, events };
}
