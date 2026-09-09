import { Character } from '../domain/Character.js';
import { AdventureRun } from '../domain/AdventureRun.js';
import { publicCombatSkills } from '../domain/CombatSkillCatalog.js';

function participant(state, playerId) {
  return state?.participants?.find((candidate) => candidate.playerId === playerId) || null;
}

function previewResult({ before, outcome, playerId, kind, targetPlayerId = null }) {
  const after = outcome.state;
  const actorBefore = participant(before, playerId);
  const actorAfter = participant(after, playerId);
  const targetBefore = targetPlayerId ? participant(before, targetPlayerId) : null;
  const targetAfter = targetPlayerId ? participant(after, targetPlayerId) : null;
  const enemyBefore = before.enemy;
  const damage = Number(outcome.damage || 0);
  const healed = Number(outcome.healed || outcome.restoredHp || 0);
  return {
    available: true,
    kind,
    damage,
    healed,
    retaliation: Number(outcome.retaliation || 0),
    critical: Boolean(outcome.critical),
    criticalMultiplier: outcome.criticalMultiplier === null || outcome.criticalMultiplier === undefined ? null : Number(outcome.criticalMultiplier),
    enemyHpBefore: enemyBefore?.hp ?? null,
    enemyMaxHp: enemyBefore?.maxHp ?? null,
    enemyHpAfter: enemyBefore ? Math.max(0, Number(enemyBefore.hp || 0) - damage) : null,
    actorHpBefore: actorBefore?.hp ?? null,
    actorHpAfter: actorAfter?.hp ?? null,
    actorMaxHp: actorBefore?.maxHp ?? actorAfter?.maxHp ?? null,
    targetPlayerId,
    targetHpBefore: targetBefore?.hp ?? null,
    targetHpAfter: targetAfter?.hp ?? null,
    targetMaxHp: targetBefore?.maxHp ?? targetAfter?.maxHp ?? null,
    phaseAfter: after.phase,
  };
}

function unavailable(reason) {
  return { available: false, reason: String(reason || 'Unavailable') };
}

/**
 * Read-only Application Service used by the browser Presentation Model.
 *
 * It previews commands by running the real AdventureRun aggregate against a clone of
 * persisted state. No browser formula duplicates combat rules and no preview is saved or
 * published. This is intentionally a query-side simulation of the authoritative Domain
 * Model, so preview numbers cannot drift from the command path as combat evolves.
 */
export class CombatPreviewService {
  constructor({ repository }) {
    this.repository = repository;
  }

  preview(playerId, runId) {
    const runState = runId ? this.repository.getRun(runId) : null;
    if (!runState || !['combat', 'boss'].includes(runState.phase)) return null;
    if (!runState.participants.some((candidate) => candidate.playerId === playerId)) return null;

    const player = this.repository.getPlayer(playerId);
    if (!player) return null;
    const equipped = player.equippedItemId ? this.repository.getItem(player.equippedItemId) : null;
    const character = new Character({ ...player, equippedItem: equipped });
    const attunementCode = equipped?.effect?.attunementCode ?? null;

    const simulate = (kind, action, targetPlayerId = null) => {
      try {
        const run = new AdventureRun(runState);
        const outcome = action(run);
        return previewResult({ before: runState, outcome, playerId, kind, targetPlayerId });
      } catch (error) {
        return unavailable(error instanceof Error ? error.message : error);
      }
    };

    const woundedTarget = runState.participants.find((candidate) => candidate.hp > 0 && candidate.hp < candidate.maxHp && candidate.playerId !== playerId)
      || runState.participants.find((candidate) => candidate.hp > 0 && candidate.hp < candidate.maxHp)
      || null;
    const downedTarget = runState.participants.find((candidate) => candidate.hp <= 0 && candidate.playerId !== playerId) || null;

    const actions = {
      attack: simulate('damage', (run) => run.attack({
        playerId,
        attackPower: character.attackPower,
        equipmentEffect: equipped?.effectCode ?? 'none',
        attunementCode,
      })),
      guard: simulate('guard', (run) => run.guard({ playerId, attunementCode })),
      interrupt: simulate('interrupt', (run) => run.interrupt({ playerId, attunementCode })),
      mend: woundedTarget
        ? simulate('heal', (run) => run.mend({ playerId, targetPlayerId: woundedTarget.playerId, attunementCode }), woundedTarget.playerId)
        : unavailable('No wounded Weaver needs Mend.'),
      revive: downedTarget
        ? simulate('revive', (run) => run.revive({ playerId, targetPlayerId: downedTarget.playerId, attunementCode }), downedTarget.playerId)
        : unavailable('No downed Weaver needs Revive.'),
    };

    const skills = {};
    for (const skill of publicCombatSkills()) {
      skills[skill.id] = simulate(
        skill.kind === 'party-heal' ? 'heal' : 'damage',
        (run) => run.useSkill({ playerId, skillId: skill.id, attackPower: character.attackPower, attunementCode }),
      );
    }

    return {
      runId: runState.id,
      runVersion: runState.version,
      actions,
      skills,
    };
  }
}
