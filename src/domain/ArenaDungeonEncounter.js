import { AUTOMATIC_BATTLE_RULES } from './AutomaticBattleSkillCatalog.js';
import { simulateArenaCombat } from './ArenaCombatEngine.js';

function actionSummary(action) {
  if (action.phase === 'player') {
    return action.defeated
      ? `${action.actorName} defeated ${action.targetName} for ${action.damage} damage.`
      : `${action.actorName} hit ${action.targetName} for ${action.damage} damage${action.critical ? ' · Critical' : ''}.`;
  }
  return `${action.actorName} hit ${action.targetName} for ${action.damage} damage.`;
}

function playerCombatant(participant, playerAction, signatureSkills) {
  const family = playerAction.weaponFamily
    || playerAction.equipment?.weapon?.weaponFamily
    || playerAction.equipment?.weapon?.family
    || playerAction.equippedItem?.weaponFamily
    || playerAction.equippedItem?.family
    || null;
  const skills = Array.isArray(playerAction.skills) ? playerAction.skills : [];
  return {
    ...participant,
    id: String(participant.playerId),
    playerId: String(participant.playerId),
    combatantId: String(participant.playerId),
    name: participant.displayName || participant.name || 'A Weaver',
    displayName: participant.displayName || participant.name || 'A Weaver',
    team: 'players',
    hp: Number(participant.hp),
    maxHp: Number(participant.maxHp),
    attack: Math.max(1, Number(playerAction.attackPower || 1) + Number(playerAction.attackBonus || 0)),
    defense: Number(playerAction.defense || 0),
    speed: Number(playerAction.speed || 1),
    critChance: Number(playerAction.critChance || 0),
    firstActionDamageBonus: Number(playerAction.firstActionDamageBonus || 0),
    mana: Number(playerAction.startingMana ?? participant.mana ?? 0),
    maxMana: Number(participant.maxMana ?? AUTOMATIC_BATTLE_RULES.maxMana),
    manaGain: Number(participant.manaGain ?? AUTOMATIC_BATTLE_RULES.manaPerBasicAttack),
    manaGainOnDamage: Number(participant.manaGainOnDamage ?? AUTOMATIC_BATTLE_RULES.manaOnDamage),
    skills,
    weaponFamily: family,
    ...(!skills.length && !playerAction.skillCode && !family && signatureSkills
      ? { skillCode: 'threadsong' }
      : playerAction.skillCode ? { skillCode: playerAction.skillCode } : {}),
    equipment: playerAction.equipment || {},
    equippedItem: playerAction.equippedItem || playerAction.equipment?.weapon || null,
    visualAssetId: playerAction.visualAssetId || participant.visualAssetId || null,
    threat: Number(participant.threat || 0),
    preferredSupportTargetId: playerAction.preferredSupportTargetId || null,
    forceSkillCast: playerAction.forceSkillCast === true,
    effects: structuredClone(participant.effects || []),
    resistances: structuredClone(participant.resistances || {}),
  };
}

function enemyCombatant(enemy) {
  const id = String(enemy.combatantId || enemy.id || enemy.definitionId || 'enemy');
  return {
    ...enemy,
    id,
    combatantId: id,
    name: enemy.name || enemy.definitionId || 'Enemy',
    displayName: enemy.name || enemy.definitionId || 'Enemy',
    team: 'enemies',
    hp: Number(enemy.hp),
    maxHp: Number(enemy.maxHp || enemy.hp),
    attack: Number(enemy.attack ?? enemy.retaliation ?? 1),
    defense: Number(enemy.defense || 0),
    speed: Number(enemy.speed || 1),
    critChance: Number(enemy.critChance || 0),
    mana: Number(enemy.mana || 0),
    maxMana: Number(enemy.maxMana ?? AUTOMATIC_BATTLE_RULES.maxMana),
    visualAssetId: enemy.visualAssetId || null,
    tags: [...(Array.isArray(enemy.tags) ? enemy.tags : []), ...(enemy.isBoss ? ['boss'] : [])],
    effects: structuredClone(enemy.effects || []),
    resistances: structuredClone(enemy.resistances || {}),
  };
}

function fingerprint(value) {
  let hash = 2166136261;
  for (const character of JSON.stringify(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function legacyAction(turn, actor, target, index) {
  const damage = Number(turn.targetDamage || 0);
  const targetHpAfter = turn.targetHpAfter == null ? Number(target?.hp || 0) : Number(turn.targetHpAfter);
  const targetHpBefore = turn.targetHpBefore == null ? Number(target?.hp || 0) : Number(turn.targetHpBefore);
  const action = {
    type: 'ArenaCombatAction',
    phase: actor.team === 'players' ? 'player' : 'enemy',
    roundIndex: Math.max(0, Number(turn.turnNumber || index + 1) - 1),
    actionIndex: index,
    actorId: actor.playerId || actor.id,
    actorCombatantId: actor.id,
    actorDefinitionId: actor.team === 'enemies' ? actor.definitionId || actor.id : null,
    actorPlayerId: actor.team === 'players' ? actor.playerId || actor.id : undefined,
    actorName: actor.displayName || actor.name,
    actorVisualAssetId: actor.visualAssetId || null,
    targetId: target?.id || null,
    targetCombatantId: target?.id || null,
    targetDefinitionId: target?.definitionId || target?.id || null,
    targetName: target?.displayName || target?.name || null,
    targetVisualAssetId: target?.visualAssetId || null,
    targetIsBoss: Boolean(target?.isBoss),
    targetHpBefore,
    targetHpAfter,
    targetMaxHp: Number(target?.maxHp || 1),
    actorHpBefore: Number(turn.actorHpBefore || actor.hp),
    actorHpAfter: Number(turn.actorHpAfter ?? actor.hp),
    actorManaBefore: Number(turn.actorManaBefore || 0),
    actorManaAfter: Number(turn.actorManaAfter ?? actor.mana ?? 0),
    damage,
    critical: Boolean(turn.metadata?.critical),
    actionType: turn.metadata?.actionType || 'effect-tick',
    skillId: turn.metadata?.skillId || null,
    skillName: turn.metadata?.skillName || null,
    // Keep the legacy timeline projection useful for existing replay clients
    // while the versioned arena replay remains the authoritative record.
    manaBefore: Number(turn.actorManaBefore ?? 0),
    manaAfter: Number(turn.actorManaAfter ?? actor.mana ?? 0),
    manaEvents: structuredClone(turn.metadata?.manaEvents || []),
    damageEvents: structuredClone(turn.metadata?.damageEvents || []),
    healingEvents: structuredClone(turn.metadata?.healingEvents || []),
    defeated: Boolean(target && targetHpAfter <= 0),
  };
  action.summary = actionSummary(action);
  return action;
}

/**
 * Activity adapter for persisted Dungeon rooms. Run state and authored content
 * stay outside the reusable arena engine; this adapter snapshots them into its
 * bounded live-combat contract and maps authoritative state back to the run.
 */
export function resolveArenaDungeonEncounter({
  runId,
  roomIndex = 0,
  participants,
  enemies,
  playerActions = {},
  placements = {},
  signatureSkills = false,
  legacyIntent = null,
  durationMs,
} = {}) {
  if (!Array.isArray(participants) || !Array.isArray(enemies)) {
    throw new Error('Arena Dungeon encounter requires participant and enemy snapshots.');
  }
  const players = participants.map((participant) => playerCombatant(
    participant,
    playerActions[participant.playerId] || {},
    signatureSkills,
  ));
  const foes = enemies.map(enemyCombatant);
  const battle = simulateArenaCombat({
    players,
    enemies: foes,
    placements,
    ...(durationMs === undefined ? {} : { durationMs }),
    context: {
      activity: 'simple-dungeon',
      battleId: `dungeon:${runId}:room:${roomIndex}:state:${fingerprint({ participants: players.map(({ id, hp, mana, threat }) => ({ id, hp, mana, threat })), enemies: foes.map(({ id, hp, mana, threat, lastTargetPlayerId }) => ({ id, hp, mana, threat, lastTargetPlayerId })) })}`,
      runId: String(runId),
      roomIndex: Number(roomIndex),
      formationSnapshot: Object.fromEntries(players.map((player) => [player.id, placements[player.id] || null])),
      ...(legacyIntent ? { legacyIntent: structuredClone(legacyIntent) } : {}),
    },
  });
  const finalById = new Map(battle.combatants.map((unit) => [unit.id, unit]));
  const nextParticipants = participants.map((participant) => {
    const final = finalById.get(String(participant.playerId));
    return final ? {
      ...structuredClone(participant),
      hp: final.hp,
      mana: final.mana,
      maxMana: final.maxMana,
      effects: structuredClone(final.effects || []),
      threat: final.threat,
      contributionDamage: Number(participant.contributionDamage || 0) + battle.events
        .filter((event) => event.type === 'DamageDealt' && event.actorId === String(participant.playerId))
        .reduce((sum, event) => sum + Number(event.damage || 0), 0),
    } : structuredClone(participant);
  });
  const nextEnemies = enemies.map((enemy) => {
    const id = String(enemy.combatantId || enemy.id || enemy.definitionId || 'enemy');
    const final = finalById.get(id);
    return final ? {
      ...structuredClone(enemy),
      hp: final.hp,
      mana: final.mana,
      maxMana: final.maxMana,
      effects: structuredClone(final.effects || []),
      threat: final.threat,
      lastTargetPlayerId: final.lastTargetPlayerId || null,
    } : structuredClone(enemy);
  });
  const actions = battle.turns.map((turn, index) => {
    const actor = finalById.get(turn.actorId) || battle.combatants.find((unit) => unit.id === turn.actorId);
    const target = turn.targetId
      ? finalById.get(turn.targetId) || battle.combatants.find((unit) => unit.id === turn.targetId)
      : null;
    return legacyAction(turn, actor, target, index);
  });
  const events = [...battle.events];
  let playerDamageDealt = 0;
  let incomingDamage = 0;
  for (const turn of battle.turns) {
    const actor = finalById.get(turn.actorId);
    if (turn.effectDamage > 0) {
      const isPlayer = actor?.team === 'players';
      if (isPlayer) incomingDamage += Number(turn.effectDamage);
      events.push({
        type: isPlayer ? 'PlayerDamaged' : 'EnemyDamaged', runId, roomIndex,
        actorCombatantId: actor?.id || turn.actorId,
        targetPlayerId: isPlayer ? actor?.playerId || actor?.id : undefined,
        targetCombatantId: isPlayer ? undefined : actor?.id,
        damage: Number(turn.effectDamage),
        targetHpBefore: Number(turn.actorHpBefore || 0),
        targetHpAfter: Number(turn.actorHpAfterEffects ?? turn.actorHpAfter ?? 0),
        cause: 'effect',
      });
    }
    for (const damage of turn.metadata?.damageEvents || []) {
      const target = finalById.get(damage.targetId);
      if (actor?.team === 'players') {
        playerDamageDealt += Number(damage.damage || 0);
        events.push({
          type: 'EnemyDamaged', runId, roomIndex, actorPlayerId: actor.playerId || actor.id,
          targetCombatantId: damage.targetId, targetDefinitionId: target?.definitionId || target?.id,
          damage: Number(damage.damage || 0), targetHpBefore: damage.targetHpBefore,
          targetHpAfter: damage.targetHpAfter, critical: Boolean(damage.critical),
          defeated: Number(damage.targetHpAfter) <= 0,
        });
        if (Number(damage.targetHpAfter) <= 0) {
          events.push({
            type: 'EnemyDefeated', runId, roomIndex,
            enemyId: target?.definitionId || target?.id,
            combatantId: target?.id,
            definitionId: target?.definitionId || target?.id,
            enemyName: target?.displayName || target?.name,
            visualAssetId: target?.visualAssetId || null,
            isBoss: Boolean(target?.isBoss),
          });
        }
      } else {
        incomingDamage += Number(damage.damage || 0);
        events.push({
          type: 'PlayerDamaged', runId, roomIndex,
          actorCombatantId: actor?.id || turn.actorId,
          targetPlayerId: target?.playerId || target?.id || damage.targetId,
          damage: Number(damage.damage || 0),
          targetHpBefore: damage.targetHpBefore, targetHpAfter: damage.targetHpAfter,
        });
      }
    }
    if (turn.metadata?.healingEvents?.length) {
      for (const healing of turn.metadata.healingEvents) {
        events.push({
          type: 'PlayerHealed', runId, roomIndex,
          playerId: actor?.playerId || actor?.id,
          targetPlayerId: healing.targetId,
          amount: healing.healing,
          bySkillId: turn.metadata.skillId || null,
        });
      }
    }
  }
  const outcome = battle.outcome === 'victory' ? 'room_clear' : battle.outcome === 'defeat' ? 'defeat' : 'draw';
  return {
    participants: nextParticipants,
    enemies: nextEnemies,
    actions,
    events,
    rounds: Math.max(1, Math.ceil(battle.durationMs / 1000)),
    outcome,
    battle,
    arenaReplay: battle.replay,
    damage: playerDamageDealt,
    retaliation: incomingDamage,
  };
}
