import { criticalStrike } from './CriticalStrikePolicy.js';

export const TARGETING_PROFILES = Object.freeze(['random', 'feral', 'bruiser', 'hunter', 'tactical']);

const PROFILE_WEIGHTS = Object.freeze({
  random: Object.freeze({ threat: 0, vulnerability: 0, absoluteHp: 0, recentAttacker: 0 }),
  feral: Object.freeze({ threat: 1.5, vulnerability: 0.5, absoluteHp: 0, recentAttacker: 6 }),
  bruiser: Object.freeze({ threat: 7, vulnerability: 0.5, absoluteHp: 0, recentAttacker: 1 }),
  hunter: Object.freeze({ threat: 1, vulnerability: 8, absoluteHp: 4, recentAttacker: 1 }),
  tactical: Object.freeze({ threat: 4, vulnerability: 5, absoluteHp: 2, recentAttacker: 2 }),
});

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function deterministicRoll(seed) {
  return stableHash(seed) / 0x100000000;
}

function stableId(combatant) {
  return String(combatant?.combatantId || combatant?.id || combatant?.playerId || combatant?.definitionId || combatant?.name || 'combatant');
}

function hpRatio(combatant) {
  return numberOr(combatant?.maxHp, 1) > 0
    ? Math.max(0, Math.min(1, numberOr(combatant?.hp) / numberOr(combatant?.maxHp, 1)))
    : 1;
}

function vulnerability(combatant) {
  return 1 - hpRatio(combatant);
}

function normalizedThreat(candidate, candidates) {
  const maximum = Math.max(1, ...candidates.map((entry) => Math.max(0, numberOr(entry.threat))));
  return Math.max(0, numberOr(candidate.threat)) / maximum;
}

function normalizedMissingHp(candidate, candidates) {
  const maximum = Math.max(1, ...candidates.map((entry) => Math.max(0, numberOr(entry.maxHp) - numberOr(entry.hp))));
  return Math.max(0, numberOr(candidate.maxHp) - numberOr(candidate.hp)) / maximum;
}

function repeatTargetPenalty(enemy, playerId, profile) {
  if (enemy?.lastTargetPlayerId !== playerId) return 0;
  // Hunters are deliberately allowed to stay on a weakened target. Every other
  // profile gets a mild nudge to avoid three mobs dogpiling one Weaver forever.
  return profile === 'hunter' ? 0.25 : 1.25;
}

function profileFor(enemy) {
  return TARGETING_PROFILES.includes(enemy?.targetingProfile) ? enemy.targetingProfile : 'random';
}

/**
 * Server-owned, deterministic target tendency policy. It returns the selected
 * Weaver and the computed weights so domain tests and development simulations can
 * inspect the policy without exposing its math in player-facing receipts.
 */
export function selectEnemyTarget({ enemy, participants, runId, roomIndex = 0, roundIndex = 0, actionIndex = 0, recentAttackerId = null }) {
  const candidates = (participants || []).filter((participant) => numberOr(participant.hp) > 0);
  if (!candidates.length) return { target: null, weights: [], roll: null, targetingProfile: profileFor(enemy) };

  const targetingProfile = profileFor(enemy);
  const profile = PROFILE_WEIGHTS[targetingProfile];
  const weights = candidates.map((candidate) => {
    const recent = candidate.playerId === recentAttackerId ? 1 : 0;
    const weight = Math.max(
      0.25,
      1
        + normalizedThreat(candidate, candidates) * profile.threat
        + vulnerability(candidate) * profile.vulnerability
        + normalizedMissingHp(candidate, candidates) * profile.absoluteHp
        + recent * profile.recentAttacker
        - repeatTargetPenalty(enemy, candidate.playerId, targetingProfile),
    );
    return { playerId: candidate.playerId, weight };
  });

  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = deterministicRoll(`${runId}:${roomIndex}:${roundIndex}:${stableId(enemy)}:${actionIndex}`) * total;
  let cursor = 0;
  let selectedId = weights.at(-1).playerId;
  for (const entry of weights) {
    cursor += entry.weight;
    if (roll < cursor) {
      selectedId = entry.playerId;
      break;
    }
  }
  return {
    target: candidates.find((candidate) => candidate.playerId === selectedId) || null,
    weights,
    roll,
    targetingProfile,
  };
}

/**
 * Automatic Weaver focus-fire policy. It is intentionally deterministic and
 * requires no UI target selection for the simple Dungeon.
 */
export function selectPlayerTarget(enemies) {
  const living = (enemies || []).filter((enemy) => numberOr(enemy.hp) > 0);
  if (!living.length) return null;
  const wounded = living.filter((enemy) => numberOr(enemy.hp) < numberOr(enemy.maxHp));
  const candidates = wounded.length ? wounded : living;
  return [...candidates].sort((left, right) => (
    hpRatio(left) - hpRatio(right)
      || numberOr(left.hp) - numberOr(right.hp)
      || stableId(left).localeCompare(stableId(right))
  ))[0] || null;
}

function actorName(participant) {
  return participant?.displayName || participant?.name || 'A Weaver';
}

function enemyName(enemy) {
  return enemy?.name || enemy?.definitionId || 'Enemy';
}

function enemyId(enemy) {
  return String(enemy?.combatantId || enemy?.id || enemy?.definitionId || 'enemy');
}

function clone(value) {
  return structuredClone(value);
}

function actionSummary(action) {
  if (action.phase === 'player') {
    return action.defeated
      ? `${action.actorName} defeated ${action.targetName} for ${action.damage} damage.`
      : `${action.actorName} hit ${action.targetName} for ${action.damage} damage${action.critical ? ' · Critical' : ''}.`;
  }
  return `${action.actorName} ${action.targetName ? `hit ${action.targetName}` : 'attacked'} for ${action.damage} damage.`;
}

function createPlayerAction({ participant, target, attackPower, equipmentEffect, runId, roomIndex, roundIndex, actionIndex, targetBefore, actorBefore, boss = false }) {
  let baseDamage = Math.max(0, Math.floor(numberOr(attackPower)));
  if (equipmentEffect === 'opening_strike' && !participant.firstStrikeUsed) baseDamage += 2;
  if (equipmentEffect === 'boss_bane' && boss) baseDamage += 2;
  const critical = criticalStrike({
    runId,
    runVersion: `${roomIndex}:${roundIndex}:${actionIndex}`,
    playerId: participant.playerId,
    enemyId: enemyId(target),
    actionKey: 'simple-attack',
    baseDamage,
  });
  participant.firstStrikeUsed = true;
  const damage = Math.min(numberOr(target.hp), critical.damage);
  target.hp = Math.max(0, numberOr(target.hp) - damage);
  participant.threat = numberOr(participant.threat) + damage;
  return {
    type: 'SimpleCombatAction',
    phase: 'player',
    roundIndex,
    actionIndex,
    actorId: participant.playerId,
    actorPlayerId: participant.playerId,
    actorName: actorName(participant),
    targetId: enemyId(target),
    targetCombatantId: enemyId(target),
    targetDefinitionId: target.definitionId || target.id,
    targetName: enemyName(target),
    targetVisualAssetId: target.visualAssetId || null,
    damage,
    actorHpBefore: actorBefore,
    actorHpAfter: numberOr(participant.hp),
    targetHpBefore: targetBefore,
    targetHpAfter: numberOr(target.hp),
    targetMaxHp: numberOr(target.maxHp, 1),
    critical: Boolean(critical.critical),
    criticalMultiplier: critical.multiplier,
    defeated: target.hp <= 0,
    summary: '',
  };
}

function createEnemyAction({ enemy, target, runId, roomIndex, roundIndex, actionIndex, targetSelection, actorBefore, targetBefore }) {
  const damage = Math.min(numberOr(target.hp), Math.max(0, Math.floor(numberOr(enemy.retaliation))));
  target.hp = Math.max(0, numberOr(target.hp) - damage);
  target.threat = Math.max(0, numberOr(target.threat) - Math.max(0, damage * 0.25));
  enemy.lastTargetPlayerId = target.playerId;
  return {
    type: 'SimpleCombatAction',
    phase: 'enemy',
    roundIndex,
    actionIndex,
    actorId: enemyId(enemy),
    actorCombatantId: enemyId(enemy),
    actorDefinitionId: enemy.definitionId || enemy.id,
    actorName: enemyName(enemy),
    actorVisualAssetId: enemy.visualAssetId || null,
    targetId: target.playerId,
    targetPlayerId: target.playerId,
    targetName: actorName(target),
    targetVisualAssetId: target.visualAssetId || null,
    damage,
    actorHpBefore: actorBefore,
    actorHpAfter: numberOr(enemy.hp),
    targetHpBefore: targetBefore,
    targetHpAfter: numberOr(target.hp),
    targetMaxHp: numberOr(target.maxHp, 1),
    defeated: target.hp <= 0,
    targetingProfile: targetSelection.targetingProfile,
    targetWeights: targetSelection.weights,
    targetRoll: targetSelection.roll,
    summary: '',
  };
}

function livingParticipants(participants) {
  return (participants || []).filter((participant) => numberOr(participant.hp) > 0);
}

function livingEnemies(enemies) {
  return (enemies || []).filter((enemy) => numberOr(enemy.hp) > 0);
}

/**
 * Resolve one complete automatic room. A room is made of real rounds: each
 * living Weaver acts once, then each surviving enemy acts once. The committed
 * action list is intentionally atomic so replay never has to infer which mob
 * retaliated.
 */
export function resolveSimpleEncounter({
  runId,
  roomIndex = 0,
  participants,
  enemies,
  playerActions = {},
  maxRounds = 120,
}) {
  const nextParticipants = clone(participants || []);
  const nextEnemies = clone(enemies || []);
  const actions = [];
  const events = [];
  let recentAttackerId = null;
  let actionIndex = 0;
  let roundIndex = 0;

  for (; roundIndex < maxRounds; roundIndex += 1) {
    const roundParticipants = livingParticipants(nextParticipants);
    const roundEnemies = livingEnemies(nextEnemies);
    if (!roundParticipants.length) return { participants: nextParticipants, enemies: nextEnemies, actions, events, rounds: roundIndex, outcome: 'defeat' };
    if (!roundEnemies.length) return { participants: nextParticipants, enemies: nextEnemies, actions, events, rounds: roundIndex, outcome: 'room_clear' };

    events.push({ type: 'SimpleCombatRoundStarted', runId, roomIndex, roundIndex });

    // The participant list is snapshotted at round start. A Weaver who is
    // downed by a later enemy action simply does not act in the next round.
    for (const participant of roundParticipants) {
      const target = selectPlayerTarget(nextEnemies);
      if (!target || participant.hp <= 0) continue;
      const targetBefore = numberOr(target.hp);
      const actorBefore = numberOr(participant.hp);
      const playerAction = playerActions[participant.playerId] || {};
      const action = createPlayerAction({
        participant,
        target,
        attackPower: playerAction.attackPower,
        equipmentEffect: playerAction.equipmentEffect,
        runId,
        roomIndex,
        roundIndex,
        actionIndex,
        targetBefore,
        actorBefore,
        boss: Boolean(target.isBoss),
      });
      action.summary = actionSummary(action);
      actions.push(action);
      events.push({
        type: 'EnemyDamaged',
        runId,
        roomIndex,
        roundIndex,
        actorPlayerId: participant.playerId,
        targetCombatantId: action.targetId,
        targetDefinitionId: action.targetDefinitionId,
        damage: action.damage,
        targetHpBefore: targetBefore,
        targetHpAfter: target.hp,
        critical: action.critical,
        defeated: action.defeated,
      });
      if (action.defeated) events.push({
        type: 'EnemyDefeated',
        runId,
        roomIndex,
        roundIndex,
        enemyId: action.targetDefinitionId,
        combatantId: action.targetId,
        definitionId: action.targetDefinitionId,
        enemyName: action.targetName,
        visualAssetId: action.targetVisualAssetId,
        isBoss: Boolean(target.isBoss),
      });
      recentAttackerId = participant.playerId;
      actionIndex += 1;
    }

    if (!livingEnemies(nextEnemies).length) {
      events.push({ type: 'SimpleCombatRoundEnded', runId, roomIndex, roundIndex, outcome: 'room_clear' });
      return { participants: nextParticipants, enemies: nextEnemies, actions, events, rounds: roundIndex + 1, outcome: 'room_clear' };
    }

    // Only enemies still alive after the Weaver phase receive an action.
    for (const enemy of [...livingEnemies(nextEnemies)]) {
      const targetSelection = selectEnemyTarget({
        enemy,
        participants: nextParticipants,
        runId,
        roomIndex,
        roundIndex,
        actionIndex,
        recentAttackerId,
      });
      const target = targetSelection.target;
      if (!target) break;
      const targetBefore = numberOr(target.hp);
      const actorBefore = numberOr(enemy.hp);
      const action = createEnemyAction({
        enemy,
        target,
        runId,
        roomIndex,
        roundIndex,
        actionIndex,
        targetSelection,
        actorBefore,
        targetBefore,
      });
      action.summary = actionSummary(action);
      actions.push(action);
      events.push({
        type: 'PlayerDamaged',
        runId,
        roomIndex,
        roundIndex,
        actorCombatantId: action.actorId,
        actorDefinitionId: action.actorDefinitionId,
        targetPlayerId: target.playerId,
        damage: action.damage,
        targetHpBefore: targetBefore,
        targetHpAfter: target.hp,
        targetingProfile: action.targetingProfile,
      });
      actionIndex += 1;
      if (!livingParticipants(nextParticipants).length) break;
    }

    const outcome = !livingParticipants(nextParticipants).length ? 'defeat' : !livingEnemies(nextEnemies).length ? 'room_clear' : null;
    if (outcome) {
      events.push({ type: 'SimpleCombatRoundEnded', runId, roomIndex, roundIndex, outcome });
      return { participants: nextParticipants, enemies: nextEnemies, actions, events, rounds: roundIndex + 1, outcome };
    }
  }

  throw new Error('The simple Dungeon encounter exceeded its safe round limit.');
}

export function targetingProfileWeights(profile) {
  return { ...(PROFILE_WEIGHTS[profile] || PROFILE_WEIGHTS.random) };
}
