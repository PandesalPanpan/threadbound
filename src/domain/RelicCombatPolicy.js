import { RELIC_ATTUNEMENTS } from './RelicProgressionPolicy.js';

const BULWARK_PRIMED_DAMAGE = 2;
const DISRUPTOR_PRIMED_DAMAGE = 3;
const EXECUTIONER_PRIMED_DAMAGE = 4;
const MENDER_EXTRA_HEAL = 2;

function participant(state, playerId) {
  return state.participants?.find((candidate) => candidate.playerId === playerId) || null;
}

function triggeredEvent({ state, playerId, attunementCode, effect, amount = 0, skillId = null }) {
  return {
    type: 'RelicAttunementTriggered',
    runId: state.id,
    dungeonId: state.dungeonId,
    playerId,
    attunementCode,
    attunementName: RELIC_ATTUNEMENTS[attunementCode]?.name || attunementCode,
    effect,
    amount,
    skillId,
  };
}

export function applyRelicCombatAttunement({ state, events, method, args, attunementCode }) {
  if (!state || !Array.isArray(events) || !RELIC_ATTUNEMENTS[attunementCode]) return { state, events, triggered: null };
  const actor = participant(state, args?.playerId);
  if (!actor) return { state, events, triggered: null };

  let triggered = null;
  if (attunementCode === 'bulwark' && method === 'guard') {
    const succeeded = events.some((event) => event.type === 'CombatReactionSucceeded' && event.playerId === actor.playerId && event.reaction === 'guard');
    if (succeeded) {
      if (state.streamlinedSkills) {
        actor.reactionDamageBonus = Number(actor.reactionDamageBonus || 0) + BULWARK_PRIMED_DAMAGE;
        triggered = triggeredEvent({ state, playerId: actor.playerId, attunementCode, effect: 'prime_damage', amount: BULWARK_PRIMED_DAMAGE });
      } else {
        const before = Number(actor.focus || 0);
        actor.focus = Math.min(Number(actor.maxFocus || 4), before + 1);
        const gained = actor.focus - before;
        if (gained > 0) {
          events.push({ type: 'FocusChanged', playerId: actor.playerId, runId: state.id, focus: actor.focus, maxFocus: actor.maxFocus });
          triggered = triggeredEvent({ state, playerId: actor.playerId, attunementCode, effect: 'bonus_focus', amount: gained });
        }
      }
    }
  }

  if (attunementCode === 'disruptor') {
    const succeeded = events.some((event) => event.type === 'CombatReactionSucceeded' && event.playerId === actor.playerId && event.reaction === 'interrupt');
    if (succeeded) {
      actor.reactionDamageBonus = Number(actor.reactionDamageBonus || 0) + DISRUPTOR_PRIMED_DAMAGE;
      triggered = triggeredEvent({ state, playerId: actor.playerId, attunementCode, effect: 'prime_damage', amount: DISRUPTOR_PRIMED_DAMAGE, skillId: args?.skillId || null });
    }
  }

  if (attunementCode === 'executioner' && method === 'useSkill' && args?.skillId === 'severing-knot') {
    const legacyCombo = events.some((event) => event.type === 'SkillComboTriggered' && event.playerId === actor.playerId && event.combo === 'exposed');
    const streamlinedInterrupt = state.streamlinedSkills && events.some((event) => event.type === 'EnemyInterrupted' && event.playerId === actor.playerId && event.bySkillId === 'severing-knot');
    if (legacyCombo || streamlinedInterrupt) {
      actor.reactionDamageBonus = Number(actor.reactionDamageBonus || 0) + EXECUTIONER_PRIMED_DAMAGE;
      triggered = triggeredEvent({ state, playerId: actor.playerId, attunementCode, effect: 'prime_damage', amount: EXECUTIONER_PRIMED_DAMAGE, skillId: args.skillId });
    }
  }

  if (attunementCode === 'mender' && method === 'useSkill' && args?.skillId === 'mending-chorus') {
    let extraTotal = 0;
    for (const healedEvent of events.filter((event) => event.type === 'PlayerHealed' && event.bySkillId === 'mending-chorus')) {
      const target = participant(state, healedEvent.targetPlayerId);
      if (!target || target.hp <= 0 || target.hp >= target.maxHp) continue;
      const extra = Math.min(MENDER_EXTRA_HEAL, target.maxHp - target.hp);
      if (extra <= 0) continue;
      target.hp += extra;
      healedEvent.amount += extra;
      extraTotal += extra;
    }
    if (extraTotal > 0) {
      // DungeonRun already accounts for the base Chorus healing. The attunement owns
      // only its additive healing, so it must extend the same contribution total here.
      actor.healingDone = Number(actor.healingDone || 0) + extraTotal;
      triggered = triggeredEvent({ state, playerId: actor.playerId, attunementCode, effect: 'bonus_healing', amount: extraTotal, skillId: args.skillId });
    }
  }

  if (triggered) events.push(triggered);
  return { state, events, triggered };
}

export const RELIC_COMBAT_VALUES = Object.freeze({
  bulwarkPrimedDamage: BULWARK_PRIMED_DAMAGE,
  disruptorPrimedDamage: DISRUPTOR_PRIMED_DAMAGE,
  executionerPrimedDamage: EXECUTIONER_PRIMED_DAMAGE,
  menderExtraHeal: MENDER_EXTRA_HEAL,
});
