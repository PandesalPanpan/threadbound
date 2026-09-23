import { criticalStrike } from './CriticalStrikePolicy.js';
import { createEquipmentAwareAutomaticBasicAttackResolver } from './EquipmentBattleEffectPolicy.js';
import { prepareAutomaticBattleCombatant } from './AutomaticBattleSkillCatalog.js';
import { AutomaticBattleSimulator } from './AutomaticBattleSimulator.js';
import { resolveAutomaticBattleSkill } from './AutomaticBattleSkillPolicy.js';

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

function signatureCombatants(participants, enemies, playerActions) {
  const players = participants.map((participant) => {
    const playerAction = playerActions[participant.playerId] || {};
    return prepareAutomaticBattleCombatant({
      ...participant,
      id: String(participant.playerId),
      playerId: String(participant.playerId),
      name: actorName(participant),
      displayName: actorName(participant),
      hp: numberOr(participant.hp),
      maxHp: Math.max(1, numberOr(participant.maxHp, 1)),
      attack: Math.max(1, numberOr(playerAction.attackPower, 1)),
      defense: Math.max(0, numberOr(playerAction.defense, 0)),
      speed: Math.max(1, numberOr(playerAction.speed, 1)),
      critChance: Math.max(0, Math.min(1, numberOr(playerAction.critChance, 0))),
      mana: numberOr(participant.mana),
      maxMana: Math.max(0, numberOr(participant.maxMana, 100)),
      manaGain: Math.max(0, numberOr(participant.manaGain, 35)),
      manaGainOnDamage: Math.max(0, numberOr(participant.manaGainOnDamage, 12)),
      skillCode: playerAction.skillCode || null,
      skills: playerAction.skills || [],
      equipment: playerAction.equipment || {},
      equippedItem: playerAction.equippedItem || playerAction.equipment?.weapon || null,
      weaponFamily: playerAction.weaponFamily || null,
      visualAssetId: participant.visualAssetId || playerAction.visualAssetId || null,
      team: 'players',
    }, { defaultSkill: playerAction.defaultSkill || 'threadsong' });
  });
  const foes = enemies.map((enemy) => prepareAutomaticBattleCombatant({
    ...enemy,
    id: enemyId(enemy),
    combatantId: enemyId(enemy),
    name: enemyName(enemy),
    displayName: enemyName(enemy),
    hp: numberOr(enemy.hp),
    maxHp: Math.max(1, numberOr(enemy.maxHp, 1)),
    attack: Math.max(1, numberOr(enemy.attack ?? enemy.retaliation, 1)),
    defense: Math.max(0, numberOr(enemy.defense, 0)),
    speed: Math.max(1, numberOr(enemy.speed, 1)),
    critChance: Math.max(0, Math.min(1, numberOr(enemy.critChance, 0))),
    mana: numberOr(enemy.mana),
    maxMana: Math.max(0, numberOr(enemy.maxMana, 100)),
    manaGain: Math.max(0, numberOr(enemy.manaGain, 35)),
    manaGainOnDamage: Math.max(0, numberOr(enemy.manaGainOnDamage, 12)),
    team: 'enemies',
  }));
  return { players, enemies: foes };
}

function battlePriorTurns(actions) {
  return actions.map((action, index) => ({
    turnNumber: index + 1,
    actorId: action.actorCombatantId || action.actorId,
    targetId: action.targetCombatantId || action.targetPlayerId || action.targetId || null,
    targetDamage: Number(action.damage || 0),
    selfHealing: Number(action.selfHealing || 0),
    actorHpBefore: Number(action.actorHpBefore || 0),
    actorHpAfter: Number(action.actorHpAfter || 0),
    actorManaBefore: Number(action.manaBefore || 0),
    actorManaAfter: Number(action.manaAfter || 0),
    metadata: {
      actionType: action.actionType || 'basic-attack',
      skillId: action.skillId || null,
      critical: Boolean(action.critical),
    },
  }));
}

function resolveSignatureTurn({
  participants,
  enemies,
  playerActions,
  actions,
  runId,
  roomIndex,
  roundIndex,
  actionIndex,
  actorId,
  targetId,
  targetSelection = null,
  recentAttackerId = null,
}) {
  const roster = signatureCombatants(participants, enemies, playerActions);
  const actor = [...roster.players, ...roster.enemies].find((combatant) => combatant.id === actorId);
  const actorIsPlayer = actor?.team === 'players';
  const deterministicSeed = `${runId}:${roomIndex}:${roundIndex}:${actionIndex}:${actorId}:${targetId || 'effect'}`;
  const simulator = new AutomaticBattleSimulator({
    resolveAction: createEquipmentAwareAutomaticBasicAttackResolver({ random: () => deterministicRoll(deterministicSeed) }),
    resolveSkill: resolveAutomaticBattleSkill,
    selectActor: () => actorId,
    selectTarget: () => targetId,
    maxTurns: actions.length + 1,
  });
  const result = simulator.simulate({
    players: roster.players,
    enemies: roster.enemies,
    context: { activity: 'simple-dungeon', runId, roomIndex, roundIndex, actionIndex },
    priorTurns: battlePriorTurns(actions),
  });
  const turn = result.turns.at(-1);
  const updated = new Map(result.combatants.map((combatant) => [combatant.id, combatant]));
  for (const participant of participants) {
    const latest = updated.get(String(participant.playerId));
    if (!latest) continue;
    participant.hp = latest.hp;
    participant.mana = latest.mana;
    participant.maxMana = latest.maxMana;
    participant.effects = structuredClone(latest.effects || []);
  }
  for (const enemy of enemies) {
    const latest = updated.get(enemyId(enemy));
    if (!latest) continue;
    enemy.hp = latest.hp;
    enemy.mana = latest.mana;
    enemy.maxMana = latest.maxMana;
    enemy.effects = structuredClone(latest.effects || []);
  }

  const currentActor = updated.get(actorId) || actor;
  const currentTarget = turn?.targetId ? updated.get(turn.targetId) : null;
  const damageEvents = (turn?.metadata?.damageEvents || []).map((event) => ({ ...event }));
  const primaryDamage = damageEvents.find((event) => event.targetId === targetId) || damageEvents[0] || null;
  const healingEvents = (turn?.metadata?.healingEvents || []).map((event) => ({ ...event }));
  const effectApplications = (turn?.metadata?.effectApplications || []).map((event) => ({ ...event }));
  const actorSource = actorIsPlayer
    ? participants.find((participant) => participant.playerId === actorId)
    : enemies.find((enemy) => enemyId(enemy) === actorId);
  if (!actorIsPlayer && currentTarget) actorSource.lastTargetPlayerId = currentTarget.playerId || currentTarget.id;

  const action = {
    type: 'SimpleCombatAction',
    phase: actorIsPlayer ? 'player' : 'enemy',
    roundIndex,
    actionIndex,
    actorId,
    ...(actorIsPlayer
      ? { actorPlayerId: actorId }
      : { actorCombatantId: actorId, actorDefinitionId: actorSource?.definitionId || actorSource?.id || actorId }),
    actorName: actorName(actorSource || actor),
    actorVisualAssetId: actorSource?.visualAssetId || null,
    targetId: currentTarget?.playerId || currentTarget?.id || targetId || null,
    ...(actorIsPlayer
      ? { targetCombatantId: currentTarget?.combatantId || currentTarget?.id || targetId || null }
      : { targetPlayerId: currentTarget?.playerId || currentTarget?.id || targetId || null }),
    targetDefinitionId: currentTarget?.definitionId || currentTarget?.id || null,
    targetName: currentTarget ? actorName(currentTarget) : null,
    targetVisualAssetId: currentTarget?.visualAssetId || null,
    targetDamages: damageEvents,
    damage: Number(primaryDamage?.damage || 0),
    totalDamage: damageEvents.reduce((sum, event) => sum + Number(event.damage || 0), 0),
    damageEvents,
    actorHpBefore: Number(turn?.actorHpBefore ?? currentActor?.hp ?? 0),
    actorHpAfterEffects: Number(turn?.actorHpAfterEffects ?? turn?.actorHpBefore ?? currentActor?.hp ?? 0),
    actorHpAfter: Number(turn?.actorHpAfter ?? currentActor?.hp ?? 0),
    targetHpBefore: Number(primaryDamage?.targetHpBefore ?? currentTarget?.hp ?? 0),
    targetHpAfter: Number(primaryDamage?.targetHpAfter ?? currentTarget?.hp ?? 0),
    targetMaxHp: Number(currentTarget?.maxHp || 1),
    critical: Boolean(turn?.metadata?.critical),
    defeated: actorIsPlayer && damageEvents.some((event) => updated.get(event.targetId)?.hp <= 0),
    actionType: turn?.metadata?.actionType || 'effect-tick',
    skillId: turn?.metadata?.skillId || null,
    skillName: turn?.metadata?.skillName || null,
    manaBefore: Number(turn?.actorManaBefore ?? currentActor?.mana ?? 0),
    manaAfter: Number(turn?.actorManaAfter ?? currentActor?.mana ?? 0),
    manaEvents: (turn?.metadata?.manaEvents || []).map((event) => ({ ...event })),
    selfHealing: healingEvents.find((event) => event.targetId === actorId)?.healing || 0,
    healingEvents,
    effectDamage: Number(turn?.effectDamage || 0),
    selfDamage: Number(turn?.selfDamage || 0),
    effectEvents: [...(turn?.metadata?.effectEvents || []), ...effectApplications],
    targetingProfile: targetSelection?.targetingProfile || null,
    targetWeights: targetSelection?.weights || [],
    targetRoll: targetSelection?.roll ?? null,
    summary: '',
  };
  action.summary = action.actionType === 'skill'
    ? `${action.actorName} cast ${action.skillName || action.skillId} for ${action.damage} damage${action.selfHealing ? ` and healed ${action.selfHealing} HP` : ''}.`
    : action.effectDamage && !currentTarget
      ? `${action.actorName} took ${action.effectDamage} effect damage.`
      : actionSummary(action);

  const events = [];
  for (const damage of damageEvents) {
    const targetCombatant = updated.get(damage.targetId);
    if (targetCombatant?.team === 'enemies') {
      events.push({
        type: 'EnemyDamaged', runId, roomIndex, roundIndex,
        actorPlayerId: actorIsPlayer ? actorId : null,
        targetCombatantId: damage.targetId,
        targetDefinitionId: targetCombatant.definitionId || targetCombatant.id,
        damage: damage.damage,
        targetHpBefore: damage.targetHpBefore,
        targetHpAfter: damage.targetHpAfter,
        critical: action.critical,
        skillId: action.skillId,
        defeated: targetCombatant.hp <= 0,
      });
      if (targetCombatant.hp <= 0) events.push({
        type: 'EnemyDefeated', runId, roomIndex, roundIndex,
        enemyId: targetCombatant.definitionId || targetCombatant.id,
        combatantId: targetCombatant.id,
        definitionId: targetCombatant.definitionId || targetCombatant.id,
        enemyName: targetCombatant.name,
        visualAssetId: targetCombatant.visualAssetId,
        isBoss: Boolean(targetCombatant.isBoss),
      });
    } else if (targetCombatant?.team === 'players') {
      events.push({
        type: 'PlayerDamaged', runId, roomIndex, roundIndex,
        actorCombatantId: actorId,
        actorDefinitionId: actorSource?.definitionId || actorSource?.id || null,
        targetPlayerId: targetCombatant.playerId || targetCombatant.id,
        damage: damage.damage,
        rawDamage: damage.damage,
        targetHpBefore: damage.targetHpBefore,
        targetHpAfter: damage.targetHpAfter,
        targetingProfile: targetSelection?.targetingProfile || null,
        skillId: action.skillId,
      });
    }
  }
  if (turn?.effectDamage > 0 && currentActor?.team === 'players') {
    events.push({
      type: 'PlayerDamaged', runId, roomIndex, roundIndex,
      actorCombatantId: actorId,
      targetPlayerId: actorId,
      damage: turn.effectDamage,
      rawDamage: turn.effectDamage,
      effectDamage: turn.effectDamage,
      targetHpBefore: turn.actorHpBefore,
      targetHpAfter: turn.actorHpAfterEffects,
      cause: 'effect',
    });
  }
  for (const damage of damageEvents) {
    const source = updated.get(damage.targetId);
    if (source?.team === 'enemies' && actorIsPlayer) {
      const participant = participants.find((entry) => entry.playerId === actorId);
      if (participant) participant.threat = numberOr(participant.threat) + Number(damage.damage || 0);
    } else if (source?.team === 'players' && !actorIsPlayer) {
      const participant = participants.find((entry) => entry.playerId === (source.playerId || source.id));
      if (participant) participant.threat = Math.max(0, numberOr(participant.threat) - Math.max(0, Number(damage.damage || 0) * 0.25));
    }
  }
  return { action, events, recentAttackerId: actorIsPlayer ? actorId : recentAttackerId };
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
  signatureSkills = false,
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
      if (signatureSkills) {
        const resolved = resolveSignatureTurn({
          participants: nextParticipants,
          enemies: nextEnemies,
          playerActions,
          actions,
          runId,
          roomIndex,
          roundIndex,
          actionIndex,
          actorId: participant.playerId,
          targetId: enemyId(target),
          recentAttackerId,
        });
        actions.push(resolved.action);
        events.push(...resolved.events);
        recentAttackerId = resolved.recentAttackerId;
        actionIndex += 1;
        continue;
      }
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
      if (signatureSkills) {
        const resolved = resolveSignatureTurn({
          participants: nextParticipants,
          enemies: nextEnemies,
          playerActions,
          actions,
          runId,
          roomIndex,
          roundIndex,
          actionIndex,
          actorId: enemyId(enemy),
          targetId: target.playerId,
          targetSelection,
          recentAttackerId,
        });
        actions.push(resolved.action);
        events.push(...resolved.events);
        actionIndex += 1;
        if (!livingParticipants(nextParticipants).length) break;
        continue;
      }
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
