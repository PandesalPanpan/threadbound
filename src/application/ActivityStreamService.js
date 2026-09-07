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

  #project(event) {
    const actorName = event.playerId ? this.#playerName(event.playerId) : null;
    const targetName = event.targetPlayerId ? this.#playerName(event.targetPlayerId) : null;
    const enemyName = event.enemyId ? titleize(event.enemyId) : null;
    const dungeonName = event.dungeonId ? titleize(event.dungeonId) : null;

    switch (event.type) {
      case 'DungeonStarted':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} entered ${dungeonName}.` };
      case 'EnemyDamaged':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} struck ${enemyName} for ${event.damage} damage.` };
      case 'PlayerDamaged':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} took ${event.damage} damage.` };
      case 'PlayerGuarded':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} raised Guard.` };
      case 'EnemyIntentTelegraphed':
        return { actorName: 'SYSTEM', body: `${enemyName} is preparing ${event.intent?.name || 'a heavy attack'}.` };
      case 'EnemyInterrupted':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} interrupted ${enemyName}.` };
      case 'PlayerHealed':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} mended ${targetName} for ${event.amount} HP.` };
      case 'PlayerRevived':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} revived ${targetName} with ${event.restoredHp} HP.` };
      case 'EnemyDefeated':
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} defeated ${enemyName}.` };
      case 'RunUpgradeChosen':
        return { actorPlayerId: event.playerId || null, actorName: actorName || 'SYSTEM', body: `${actorName || 'The party'} chose ${titleize(event.upgradeId)}.` };
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
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} found ${item?.name || 'a relic'}.` };
      }
      case 'ItemEquipped': {
        const item = this.gameRepository.getItem(event.itemId);
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} equipped ${item?.name || 'a relic'}.` };
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
