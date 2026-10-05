import { Character } from '../domain/Character.js';
import { combatSkill, publicCombatSkills } from '../domain/CombatSkillCatalog.js';
import { AdventureRun } from '../domain/AdventureRun.js';
import { runBuildModifiers } from '../domain/RunBuildPolicy.js';
import { SQLiteEquipmentRepository } from '../infrastructure/SQLiteEquipmentRepository.js';

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

function arenaSkillCode(skillId) {
  if (skillId === 'piercing-stitch') return 'thornwake';
  if (skillId === 'severing-knot') return 'shadow-lunge';
  if (skillId === 'mending-chorus') return 'mending-chorus';
  return null;
}

function validateAndPrepareCommand(run, playerId, action, targetPlayerId, skillId) {
  const actor = run.participant(playerId);
  if (!actor || actor.hp <= 0) throw new Error('A downed player cannot act until revived.');
  const pendingIntent = run.state.enemyIntent ? structuredClone(run.state.enemyIntent) : null;
  let mappedSkillCode = null;
  let selectedSkill = null;
  let preferredSupportTargetId = null;
  const commandEvents = [];
  let focusCost = 0;
  let skillCooldown = 0;

  if (action === 'guard') {
    mappedSkillCode = 'iron-bloom';
    actor.threat = Number(actor.threat || 0) + 10;
  } else if (action === 'interrupt') {
    if (!pendingIntent) throw new Error('There is no enemy action to interrupt.');
    mappedSkillCode = 'frost-bind';
    actor.threat = Number(actor.threat || 0) + 3;
    run.state.enemy.effects = [...(run.state.enemy.effects || []), { type: 'attack-down', potency: 2, remainingTurns: 1 }];
  } else if (action === 'mend') {
    const target = run.participant(targetPlayerId);
    if (!target) throw new Error('Mend target is not a participant in this run.');
    if (target.hp <= 0) throw new Error('Mend cannot heal a downed player; use Revive.');
    if (target.hp >= target.maxHp) throw new Error('Mend target is already at full health.');
    if (Number(actor.mendCharges || 0) <= 0) throw new Error('Mend has already been used this encounter.');
    mappedSkillCode = 'mending-chorus';
    preferredSupportTargetId = target.playerId;
    actor.threat = Number(actor.threat || 0) + 2;
  } else if (action === 'revive') {
    const target = run.participant(targetPlayerId);
    if (!target) throw new Error('Revive target is not a participant in this run.');
    if (target.playerId === playerId) throw new Error('Players cannot revive themselves.');
    if (target.hp > 0) throw new Error('Revive target is not downed.');
    if (Number(actor.reviveCharges || 0) <= 0) throw new Error('Revive has already been used this run.');
    const participants = structuredClone(run.state.participants);
    const acting = participants.find((candidate) => candidate.playerId === playerId);
    const revived = participants.find((candidate) => candidate.playerId === targetPlayerId);
    revived.hp = Math.max(1, Math.ceil(revived.maxHp * 0.3));
    revived.threat = 0;
    revived.guarding = false;
    acting.reviveCharges = Math.max(0, Number(acting.reviveCharges || 0) - 1);
    acting.revives = Number(acting.revives || 0) + 1;
    acting.threat = Number(acting.threat || 0) + 4;
    run.state.participants = participants;
    commandEvents.push({ type: 'PlayerRevived', playerId, targetPlayerId, runId: run.state.id, restoredHp: revived.hp });
  } else if (action === 'skill') {
    selectedSkill = combatSkill(skillId);
    const remaining = Number(actor.skillCooldowns?.[selectedSkill.id] || 0);
    if (remaining > 0) throw new Error(`${selectedSkill.name} is on cooldown for ${remaining} more action${remaining === 1 ? '' : 's'}.`);
    if (Number(actor.focus || 0) < selectedSkill.cost) throw new Error(`${selectedSkill.name} requires ${selectedSkill.cost} Focus.`);
    mappedSkillCode = arenaSkillCode(selectedSkill.id);
    if (!mappedSkillCode) throw new Error(`${selectedSkill.name} is not available in the arena.`);
    focusCost = selectedSkill.cost;
    skillCooldown = selectedSkill.cooldown;
    if (mappedSkillCode === 'mending-chorus') {
      preferredSupportTargetId = run.state.participants.find((candidate) => candidate.hp > 0 && candidate.hp < candidate.maxHp)?.playerId || playerId;
    }
  } else if (action !== 'attack') {
    throw new Error(`Unsupported Dungeon action: ${action}.`);
  }

  const build = runBuildModifiers(run.state);
  const exposed = Number(run.state.enemy?.statuses?.exposed || 0) > 0;
  let commandCounterBonus = 0;
  if (action === 'guard' && pendingIntent?.reaction === 'guard') {
    commandCounterBonus = (run.state.reactionStyle === 'guard' ? 3 : 0) + Number(build.guardCounterBonus || 0);
  } else if ((action === 'interrupt' && pendingIntent)
    || (action === 'skill' && selectedSkill?.interrupts && pendingIntent)) {
    commandCounterBonus = 4 + Number(build.interruptCounterBonus || 0);
  }

  return {
    actor,
    pendingIntent,
    mappedSkillCode,
    selectedSkill,
    preferredSupportTargetId,
    commandEvents,
    focusCost,
    skillCooldown,
    build,
    exposed,
    commandCounterBonus,
  };
}

export class CombatPreviewService {
  constructor({ repository, equipmentRepository = null }) {
    this.repository = repository;
    this.equipmentRepository = equipmentRepository || new SQLiteEquipmentRepository({ database: repository.db });
  }

  preview(playerId, runId) {
    const runState = runId ? this.repository.getRun(runId) : null;
    if (!runState || !['combat', 'boss'].includes(runState.phase)) return null;
    if (!runState.participants.some((candidate) => candidate.playerId === playerId)) return null;

    const woundedTarget = runState.participants.find((candidate) => candidate.hp > 0 && candidate.hp < candidate.maxHp && candidate.playerId !== playerId)
      || runState.participants.find((candidate) => candidate.hp > 0 && candidate.hp < candidate.maxHp)
      || null;
    const downedTarget = runState.participants.find((candidate) => candidate.hp <= 0 && candidate.playerId !== playerId) || null;

    const simulate = (kind, action, targetPlayerId = null, skillId = null) => {
      try {
        const run = new AdventureRun(runState);
        if (run.state.simpleCombat) {
          if (action !== 'attack') return unavailable('This Arena encounter resolves automatically; this command preview is only available for legacy tactical runs.');
          const playerActions = {};
          for (const current of run.state.participants.filter((candidate) => candidate.hp > 0)) {
            const player = this.repository.getPlayer(current.playerId);
            if (!player) throw new Error('Player not found.');
            const equipment = this.equipmentRepository.getLoadout(current.playerId);
            const character = new Character({ ...player, equippedItem: equipment.weapon, equipment });
            playerActions[current.playerId] = {
              attackPower: character.stats.attack + Number(run.state.runAttackBonus || 0),
              defense: character.stats.defense,
              speed: character.stats.speed,
              critChance: character.stats.critChance,
              maxHp: current.maxHp,
              equipment,
              equippedItem: equipment.weapon,
              weaponFamily: equipment.weapon?.weaponFamily || equipment.weapon?.family || null,
            };
          }
          const outcome = run.resolveSimpleEncounter({ playerActions, signatureSkills: true });
          return previewResult({ before: runState, outcome, playerId, kind, targetPlayerId });
        }

        const prepared = validateAndPrepareCommand(run, playerId, action, targetPlayerId, skillId);
        const playerActions = {};
        for (const current of run.state.participants.filter((candidate) => candidate.hp > 0)) {
          const player = this.repository.getPlayer(current.playerId);
          if (!player) throw new Error('Player not found.');
          const equipment = this.equipmentRepository.getLoadout(current.playerId);
          const equipped = equipment.weapon;
          const character = new Character({ ...player, equippedItem: equipped, equipment });
          const actorCommand = current.playerId === playerId && prepared.mappedSkillCode;
          playerActions[current.playerId] = {
            attackPower: character.stats.attack + Number(run.state.runAttackBonus || 0),
            attackBonus: prepared.exposed ? Number(prepared.build.exposedDamageBonus || 0) : 0,
            firstActionDamageBonus: Number(current.reactionDamageBonus || 0)
              + (current.playerId === playerId ? prepared.commandCounterBonus : 0),
            defense: character.stats.defense,
            speed: character.stats.speed,
            critChance: Math.min(1, character.stats.critChance + (prepared.exposed ? Number(prepared.build.exposedCritChanceBonus || 0) : 0)),
            startingMana: actorCommand ? 100 : Number(current.mana ?? (Number(current.focus || 0) * 25)),
            maxHp: current.maxHp,
            equipment,
            equippedItem: equipped,
            weaponFamily: equipped?.weaponFamily || equipped?.family || null,
            ...(actorCommand ? {
              skillCode: prepared.mappedSkillCode,
              forceSkillCast: true,
              ...(prepared.preferredSupportTargetId ? { preferredSupportTargetId: prepared.preferredSupportTargetId } : {}),
            } : {}),
          };
        }
        const equipped = this.equipmentRepository.getLoadout(playerId).weapon;
        const outcome = run.resolveLegacyArenaEncounter({
          playerActions,
          actorPlayerId: playerId,
          command: {
            action,
            method: action === 'skill' ? 'useSkill' : action,
            skillId: prepared.selectedSkill?.id || null,
            skillCode: prepared.mappedSkillCode,
            focusCost: prepared.focusCost,
            skillCooldown: prepared.skillCooldown,
            pendingIntent: prepared.pendingIntent,
            attunementCode: equipped?.effect?.attunementCode || null,
            events: prepared.commandEvents,
          },
        });
        return previewResult({ before: runState, outcome, playerId, kind, targetPlayerId });
      } catch (error) {
        return unavailable(error instanceof Error ? error.message : error);
      }
    };

    const actions = {
      attack: simulate('damage', 'attack'),
      guard: simulate('guard', 'guard'),
      interrupt: simulate('interrupt', 'interrupt'),
      mend: woundedTarget
        ? simulate('heal', 'mend', woundedTarget.playerId)
        : unavailable('No wounded Weaver needs Mend.'),
      revive: downedTarget
        ? simulate('revive', 'revive', downedTarget.playerId)
        : unavailable('No downed Weaver needs Revive.'),
    };

    const skills = {};
    for (const skill of publicCombatSkills()) {
      skills[skill.id] = simulate(skill.kind === 'party-heal' ? 'heal' : 'damage', 'skill', null, skill.id);
    }

    return {
      runId: runState.id,
      runVersion: runState.version,
      actions,
      skills,
    };
  }
}
