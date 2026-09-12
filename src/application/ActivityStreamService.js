import { projectHuntReceipt } from './HuntReceiptReadModel.js';

const MAX_CHAT_LENGTH = 500;

function titleize(value) {
  return String(value || '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Unknown';
}

function relicTriggerCopy(trigger) {
  if (!trigger) return '';
  if (trigger.effect === 'bonus_focus') return ` · ◇ ${trigger.name}: +${trigger.amount} Focus`;
  if (trigger.effect === 'prime_damage') return ` · ◇ ${trigger.name}: +${trigger.amount} next damage primed`;
  if (trigger.effect === 'bonus_healing') return ` · ◇ ${trigger.name}: +${trigger.amount} bonus healing`;
  return ` · ◇ ${trigger.name} triggered`;
}

export class ActivityStreamService {
  constructor({ streamRepository, gameRepository }) {
    this.streamRepository = streamRepository;
    this.gameRepository = gameRepository;
  }

  recent(limit = 80) {
    return this.streamRepository.listRecent({ limit });
  }

  page({ limit = 30, before = null } = {}) {
    return this.streamRepository.listPage({ limit, beforeId: before || null });
  }

  postChat({ playerId, body }) {
    const player = this.gameRepository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const message = String(body ?? '').trim();
    if (!message) {
      const error = new Error('Chat message cannot be empty.');
      error.code = 'invalid_chat_message';
      throw error;
    }
    if (message.length > MAX_CHAT_LENGTH) {
      const error = new Error(`Chat messages can be at most ${MAX_CHAT_LENGTH} characters.`);
      error.code = 'invalid_chat_message';
      throw error;
    }
    return this.streamRepository.append({
      kind: 'chat',
      actorPlayerId: player.id,
      actorName: player.displayName,
      body: message,
      metadata: { source: 'player_chat' },
    });
  }

  recordDomainEvent(event) {
    const projected = this.#project(event);
    if (!projected) return null;
    return this.streamRepository.append({
      kind: 'system',
      eventType: event.type,
      runId: event.runId || null,
      dungeonId: event.dungeonId || null,
      metadata: { ...event },
      ...projected,
    });
  }

  #playerName(playerId) {
    return this.gameRepository.getPlayer(playerId)?.displayName || 'Unknown Weaver';
  }

  #isSimpleRun(runId) {
    return Boolean(runId && this.gameRepository.getRun(runId)?.simpleCombat);
  }

  #combatResult(event, actorName) {
    const action = String(event.action || 'action').toLowerCase();
    const simple = this.#isSimpleRun(event.runId);
    const actorHp = event.actorHp === null || event.actorHp === undefined ? '' : `❤️ ${event.actorHp}/${event.actorMaxHp}`;
    const actorFocus = simple || event.actorFocus === null || event.actorFocus === undefined ? '' : `🧵 Focus ${event.actorFocus}/${event.actorMaxFocus}`;
    const enemyName = event.enemyName || (event.enemyId ? titleize(event.enemyId) : 'enemy');
    const enemyHp = event.enemyHp === null || event.enemyHp === undefined ? '' : `👾 ${enemyName} ${event.enemyHp}/${event.enemyMaxHp}`;
    const exposed = !simple && Number(event.enemyStatuses?.exposed || 0) > 0 ? ' · ✦ EXPOSED' : '';
    const targetName = event.targetPlayerId ? this.#playerName(event.targetPlayerId) : null;
    const protectedName = event.protectedPlayerId ? this.#playerName(event.protectedPlayerId) : null;
    const retaliation = event.retaliation > 0
      ? ` · ${targetName && event.targetPlayerId !== event.playerId ? `${targetName} took ${event.retaliation}` : `took ${event.retaliation}`}`
      : '';
    const intentTargetName = event.enemyIntent?.targetPlayerId ? this.#playerName(event.enemyIntent.targetPlayerId) : null;
    const intent = simple ? '' : event.enemyIntent
      ? event.enemyIntent.id === 'threadmark-lunge'
        ? ` · ⚠ THREADMARK: ${intentTargetName || 'an ally'} is marked for ${event.enemyIntent.damage} damage — Guard to protect them.`
        : ` · ⚠ ${event.enemyIntent.name} incoming (${event.enemyIntent.damage})`
      : '';
    const phaseChange = !simple && event.bossPhaseChanged
      ? ` · ⚡ PHASE ${event.bossPhaseChanged.battlePhase}: ${event.bossPhaseChanged.phaseName}. Telegraphs accelerate.`
      : '';
    const runEvent = !simple && event.phase === 'event' && event.runEvent
      ? ` · ✦ DISCOVERY: ${event.runEvent.name}. ${event.runEvent.prompt} Choose the party's path.`
      : '';
    const phase = !simple && event.phase === 'upgrade'
      ? ' · ✦ Choose the run upgrade.'
      : event.phase === 'complete'
        ? ' · ✦ Dungeon cleared.'
        : runEvent;
    const relic = simple ? '' : relicTriggerCopy(event.relicAttunement);

    let result;
    if (action === 'attack') {
      if (event.defeatedEnemyId) {
        const defeated = titleize(event.defeatedEnemyId);
        result = `${actorName} attacked ${defeated} for ${event.damage} and defeated it.`;
        if (event.enemyHp !== null && event.enemyHp !== undefined && !['complete', 'event'].includes(event.phase)) result += ` Next: ${enemyHp}.`;
      } else result = `${actorName} attacked ${enemyName} for ${event.damage} damage${retaliation}.`;
    } else if (action === 'guard') {
      if (protectedName) {
        result = `${actorName} protected ${protectedName} from Threadmark, prevented ${event.prevented} damage, and took ${event.retaliation}.`;
      } else result = `${actorName} guarded${event.prevented > 0 ? ` and prevented ${event.prevented} damage` : ''}${retaliation}.`;
    } else if (action === 'interrupt') {
      result = `${actorName} interrupted ${enemyName}'s heavy attack.`;
    } else if (action === 'mend') {
      result = `${actorName} mended ${targetName || 'an ally'} for ${event.healed} HP${retaliation}.`;
    } else if (action === 'revive') {
      result = `${actorName} revived ${targetName || 'an ally'} with ${event.restoredHp} HP${retaliation}.`;
    } else if (action === 'skill') {
      const skillName = titleize(event.skillId || 'combat skill');
      const combo = event.combo ? ` · COMBO ${titleize(event.combo)} +${event.comboBonus} damage` : '';
      const interrupted = event.interruptedIntentId ? ' · interrupted the telegraph' : '';
      if (event.damage > 0) result = `${actorName} used ${skillName} on ${enemyName} for ${event.damage} damage${combo}${interrupted}${retaliation}.`;
      else if (event.healed > 0) result = `${actorName} used ${skillName} and restored ${event.healed} total party HP${retaliation}.`;
      else result = `${actorName} used ${skillName}${interrupted}${retaliation}.`;
    } else result = `${actorName} used ${titleize(action)}.`;

    const bossPhase = !simple && event.bossBattlePhase ? ` · PHASE ${event.bossBattlePhase}${event.bossPhaseName ? ` ${event.bossPhaseName.toUpperCase()}` : ''}` : '';
    const state = [actorHp, actorFocus, ['upgrade', 'complete', 'event'].includes(event.phase) ? '' : `${enemyHp}${exposed}${bossPhase}`].filter(Boolean).join(' · ');
    return `${result}${state ? ` ${state}.` : ''}${relic}${phaseChange}${intent}${phase}`;
  }

  #project(event) {
    const actorName = event.playerId ? this.#playerName(event.playerId) : null;
    const enemyName = event.enemyId ? titleize(event.enemyId) : null;
    const dungeonName = event.dungeonId ? titleize(event.dungeonId) : null;

    switch (event.type) {
      case 'HuntResolved': {
        const receipt = projectHuntReceipt(event, { actorName: actorName || 'Adventurer', fallbackEnemyName: enemyName || 'enemy' });
        return { actorName: 'THREADBOUND', body: receipt.text };
      }
      case 'HealthPotionUsed':
        return { actorName: 'THREADBOUND', body: `${actorName} used a health potion. +${event.healed} HP · ${event.currentHealth}/${event.maxHealth} HP · ${event.healthPotions} left.` };
      case 'HealthPotionPurchased':
        return { actorName: 'THREADBOUND', body: `${actorName} bought ${event.quantity} health potion${event.quantity === 1 ? '' : 's'} for ${event.cost} Dust · ${event.healthPotions} left.` };
      case 'DungeonStarted': {
        const foe = event.enemyName || enemyName || 'an enemy';
        const enemyState = event.enemyHp === null || event.enemyHp === undefined ? '' : ` 👾 ${foe} ${event.enemyHp}/${event.enemyMaxHp} HP.`;
        const playerState = event.actorHp === null || event.actorHp === undefined ? '' : ` ❤️ ${event.actorHp}/${event.actorMaxHp} HP.`;
        const copy = event.simpleCombat
          ? `${actorName} entered ${dungeonName}.${enemyState}${playerState} Recommended Attack ${event.recommendedAttack || 9}+. Attack until the room is clear.`
          : `${actorName} entered ${dungeonName}.${enemyState}${playerState} Choose your first action.`;
        return { actorPlayerId: event.simpleCombat ? null : event.playerId, actorName: event.simpleCombat ? 'THREADBOUND' : actorName, body: copy };
      }
      case 'CombatActionResolved': {
        const simple = this.#isSimpleRun(event.runId);
        return { actorPlayerId: simple ? null : event.playerId, actorName: simple ? 'THREADBOUND' : actorName, body: this.#combatResult(event, actorName) };
      }
      case 'BossEncounterStarted':
        return { actorName: 'THREADBOUND', body: `${event.enemyName || enemyName || 'The boss'} enters — ${event.enemyHp}/${event.enemyMaxHp} HP.` };
      case 'DungeonRecoveryApplied':
        return null;
      case 'CriticalStrikeLanded':
        return {
          actorPlayerId: event.playerId,
          actorName,
          body: `CRITICAL STRIKE! ${actorName} dealt ${event.damage} damage (${Number(event.multiplier || 1).toFixed(2)}×).`,
        };
      case 'EnemyDeathEffectResolved':
        return {
          actorName: 'THREADBOUND',
          body: `${titleize(event.enemyId)} triggered ${titleize(event.effect)} on defeat for ${event.damage} damage.`,
        };

      case 'EnemyDamaged':
      case 'PlayerDamaged':
      case 'PlayerGuarded':
      case 'EnemyIntentTelegraphed':
      case 'EnemyInterrupted':
      case 'PlayerHealed':
      case 'PlayerRevived':
      case 'PlayerProtected':
      case 'EnemyDefeated':
      case 'EnemyIntentResolved':
      case 'EnemyIntentIgnored':
      case 'EnemyIntentCancelledByDefeat':
      case 'CombatReactionSucceeded':
      case 'CombatSkillUsed':
      case 'FocusChanged':
      case 'EnemyStatusApplied':
      case 'SkillComboTriggered':
      case 'BossPhaseChanged':
      case 'RunEventDiscovered':
      case 'RelicAttunementTriggered':
        return null;

      case 'RunEventChosen': {
        const run = event.runId ? this.gameRepository.getRun(event.runId) : null;
        const nextEnemy = run?.enemy || null;
        const next = nextEnemy ? ` Next: ${nextEnemy.name} — ${nextEnemy.hp}/${nextEnemy.maxHp} HP.` : event.nextEnemyName ? ` Next: ${event.nextEnemyName}.` : '';
        return {
          actorPlayerId: event.playerId || null,
          actorName: actorName || 'SYSTEM',
          metadata: {
            ...event,
            nextEnemyId: nextEnemy?.id || event.nextEnemyId || null,
            nextEnemyName: nextEnemy?.name || event.nextEnemyName || null,
            nextEnemyHp: nextEnemy?.hp ?? null,
            nextEnemyMaxHp: nextEnemy?.maxHp ?? null,
            nextEnemyIsBoss: Boolean(nextEnemy?.isBoss),
          },
          body: `${actorName || 'The party'} chose ${event.choiceName} at ${event.eventName}. ${event.choiceSummary}${next}`,
        };
      }
      case 'RunUpgradeChosen': {
        const run = event.runId ? this.gameRepository.getRun(event.runId) : null;
        const nextEnemy = run?.enemy || null;
        const next = nextEnemy ? ` ${nextEnemy.name} enters — ${nextEnemy.hp}/${nextEnemy.maxHp} HP.` : '';
        return {
          actorPlayerId: event.playerId || null,
          actorName: actorName || 'SYSTEM',
          metadata: {
            ...event,
            nextEnemyId: nextEnemy?.id || event.nextEnemyId || null,
            nextEnemyName: nextEnemy?.name || event.nextEnemyName || null,
            nextEnemyHp: nextEnemy?.hp ?? null,
            nextEnemyMaxHp: nextEnemy?.maxHp ?? null,
            nextEnemyIsBoss: Boolean(nextEnemy?.isBoss),
          },
          body: `${actorName || 'The party'} chose ${titleize(event.upgradeId)}.${next}`,
        };
      }
      case 'DungeonFailed': {
        const names = (event.participantIds || []).map((id) => this.#playerName(id));
        return { actorName: 'SYSTEM', body: `${names.join(', ') || 'The party'} fell in ${dungeonName}.` };
      }
      case 'DungeonCompleted': {
        if (event.playerId) return null;
        const names = (event.participantIds || []).map((id) => this.#playerName(id));
        return { actorName: 'SYSTEM', body: `${names.join(', ') || 'The party'} cleared ${dungeonName}.` };
      }
      case 'AreaTraveled':
        return {
          actorPlayerId: event.playerId,
          actorName: 'THREADBOUND',
          body: `${actorName} traveled from ${event.fromArea?.name || 'an Area'} to ${event.toArea?.name || 'an Area'}.`,
        };
      case 'ItemGenerated': {
        if (event.silentStream) return null;
        const item = this.gameRepository.getItem(event.itemId);
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} found ${item?.name || 'a relic'}. Open Gear to equip, Temper, compare, or salvage it.` };
      }
      case 'ItemEquipped': {
        const item = this.gameRepository.getItem(event.itemId);
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} equipped ${item?.name || 'a relic'}${item ? ` (+${item.attackBonus} Attack)` : ''}.` };
      }
      case 'ItemUpgraded':
        return {
          actorPlayerId: event.playerId,
          actorName,
          body: `${actorName} Tempered ${event.itemName || 'a relic'} to ${event.level}/${event.maxLevel} with ${event.attunementName} (+${event.attackIncrease} Attack, −${event.threadDustSpent} Dust).`,
        };
      case 'ItemSalvaged':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} salvaged ${event.itemName || 'a relic'} into ${event.threadDust} Thread Dust.` };
      case 'PartyCreated':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} formed a party.` };
      case 'PartyMemberJoined':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} joined a party.` };
      case 'PartyReadyChanged':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} changed party readiness.` };
      case 'PartyMemberLeft':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} left a party.` };
      case 'PartyDisbanded':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} disbanded a party.` };
      default:
        return null;
    }
  }
}

export { MAX_CHAT_LENGTH };
