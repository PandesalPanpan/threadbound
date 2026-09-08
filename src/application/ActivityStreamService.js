const MAX_CHAT_LENGTH = 500;

function titleize(value) {
  return String(value || '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Unknown';
}

export class ActivityStreamService {
  constructor({ streamRepository, gameRepository }) {
    this.streamRepository = streamRepository;
    this.gameRepository = gameRepository;
  }

  recent(limit = 80) {
    return this.streamRepository.listRecent({ limit });
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

  #combatResult(event, actorName) {
    const action = String(event.action || 'action').toLowerCase();
    const actorHp = event.actorHp === null || event.actorHp === undefined ? '' : `❤️ ${event.actorHp}/${event.actorMaxHp}`;
    const actorFocus = event.actorFocus === null || event.actorFocus === undefined ? '' : `🧵 Focus ${event.actorFocus}/${event.actorMaxFocus}`;
    const enemyName = event.enemyName || (event.enemyId ? titleize(event.enemyId) : 'enemy');
    const enemyHp = event.enemyHp === null || event.enemyHp === undefined ? '' : `👾 ${enemyName} ${event.enemyHp}/${event.enemyMaxHp}`;
    const exposed = Number(event.enemyStatuses?.exposed || 0) > 0 ? ' · ✦ EXPOSED' : '';
    const targetName = event.targetPlayerId ? this.#playerName(event.targetPlayerId) : null;
    const protectedName = event.protectedPlayerId ? this.#playerName(event.protectedPlayerId) : null;
    const retaliation = event.retaliation > 0
      ? ` · ${targetName && event.targetPlayerId !== event.playerId ? `${targetName} took ${event.retaliation}` : `took ${event.retaliation}`}`
      : '';
    const intentTargetName = event.enemyIntent?.targetPlayerId ? this.#playerName(event.enemyIntent.targetPlayerId) : null;
    const intent = event.enemyIntent
      ? event.enemyIntent.id === 'threadmark-lunge'
        ? ` · ⚠ THREADMARK: ${intentTargetName || 'an ally'} is marked for ${event.enemyIntent.damage} damage — Guard to protect them.`
        : ` · ⚠ ${event.enemyIntent.name} incoming (${event.enemyIntent.damage})`
      : '';
    const phaseChange = event.bossPhaseChanged
      ? ` · ⚡ PHASE ${event.bossPhaseChanged.battlePhase}: ${event.bossPhaseChanged.phaseName}. Telegraphs accelerate.`
      : '';
    const runEvent = event.phase === 'event' && event.runEvent
      ? ` · ✦ DISCOVERY: ${event.runEvent.name}. ${event.runEvent.prompt} Choose the party's path.`
      : '';
    const phase = event.phase === 'upgrade'
      ? ' · ✦ Choose the run upgrade.'
      : event.phase === 'complete'
        ? ' · ✦ Dungeon cleared.'
        : runEvent;

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

    const bossPhase = event.bossBattlePhase ? ` · PHASE ${event.bossBattlePhase}${event.bossPhaseName ? ` ${event.bossPhaseName.toUpperCase()}` : ''}` : '';
    const state = [actorHp, actorFocus, ['upgrade', 'complete', 'event'].includes(event.phase) ? '' : `${enemyHp}${exposed}${bossPhase}`].filter(Boolean).join(' · ');
    return `${result}${state ? ` ${state}.` : ''}${phaseChange}${intent}${phase}`;
  }

  #project(event) {
    const actorName = event.playerId ? this.#playerName(event.playerId) : null;
    const enemyName = event.enemyId ? titleize(event.enemyId) : null;
    const dungeonName = event.dungeonId ? titleize(event.dungeonId) : null;

    switch (event.type) {
      case 'DungeonStarted': {
        const foe = event.enemyName || enemyName || 'an enemy';
        const enemyState = event.enemyHp === null || event.enemyHp === undefined ? '' : ` 👾 ${foe} ${event.enemyHp}/${event.enemyMaxHp} HP.`;
        const playerState = event.actorHp === null || event.actorHp === undefined ? '' : ` ❤️ ${event.actorHp}/${event.actorMaxHp} HP.`;
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} entered ${dungeonName}.${enemyState}${playerState} Choose your first action.` };
      }
      case 'CombatActionResolved':
        return { actorPlayerId: event.playerId, actorName, body: this.#combatResult(event, actorName) };

      // Fine-grained domain events drive achievements/history/realtime state. One player
      // command still becomes exactly one durable public result message.
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
      case 'CombatReactionSucceeded':
      case 'CombatSkillUsed':
      case 'FocusChanged':
      case 'EnemyStatusApplied':
      case 'SkillComboTriggered':
      case 'BossPhaseChanged':
      case 'RunEventDiscovered':
        return null;

      case 'RunEventChosen': {
        const next = event.nextEnemyName ? ` Next: ${event.nextEnemyName}.` : '';
        return {
          actorPlayerId: event.playerId || null,
          actorName: actorName || 'SYSTEM',
          body: `${actorName || 'The party'} chose ${event.choiceName} at ${event.eventName}. ${event.choiceSummary}${next}`,
        };
      }
      case 'RunUpgradeChosen': {
        const run = event.runId ? this.gameRepository.getRun(event.runId) : null;
        const boss = run?.enemy;
        const bossState = boss ? ` ${boss.name} awakens — ${boss.hp}/${boss.maxHp} HP.` : '';
        return { actorPlayerId: event.playerId || null, actorName: actorName || 'SYSTEM', body: `${actorName || 'The party'} chose ${titleize(event.upgradeId)}.${bossState}` };
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
      case 'ItemGenerated': {
        const item = this.gameRepository.getItem(event.itemId);
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} found ${item?.name || 'a relic'}. Open Gear to equip, compare, or salvage it.` };
      }
      case 'ItemEquipped': {
        const item = this.gameRepository.getItem(event.itemId);
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} equipped ${item?.name || 'a relic'}${item ? ` (+${item.attackBonus} Attack)` : ''}.` };
      }
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
