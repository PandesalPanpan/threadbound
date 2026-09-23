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

  recordInventoryView({ playerId, dashboard }) {
    const player = this.gameRepository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const character = dashboard?.character || {};
    const equipment = character.equipment || {};
    const inventory = Array.isArray(dashboard?.inventory) ? dashboard.inventory : [];
    const compactItem = (item) => item ? {
      id: item.id,
      name: item.name,
      slot: item.slot || null,
      rarity: item.rarity || 'common',
      attackBonus: Number(item.attackBonus || 0),
      defenseBonus: Number(item.defenseBonus || 0),
      effect: item.effect ? {
        code: item.effect.code || item.effectCode || null,
        name: item.effect.name || null,
        description: item.effect.description || null,
      } : null,
      visualAssetId: item.visualAssetId || null,
    } : null;
    const equipmentSnapshot = Object.fromEntries(Object.entries(equipment).map(([slot, item]) => [slot, compactItem(item)]));
    const inventorySnapshot = inventory.map(compactItem);
    return this.streamRepository.append({
      kind: 'system',
      eventType: 'InventoryViewed',
      actorPlayerId: player.id,
      actorName: player.displayName,
      body: `${player.displayName} opened Inventory · ${inventorySnapshot.length} item${inventorySnapshot.length === 1 ? '' : 's'} · ${Number(character.gold ?? character.threadDust ?? 0)} Gold.`,
      metadata: {
        playerId: player.id,
        publicSnapshot: true,
        character: {
          id: character.id || player.id,
          displayName: character.displayName || player.displayName,
          gold: Number(character.gold ?? character.threadDust ?? 0),
          currentHealth: Number(character.currentHealth || 0),
          maxHealth: Number(character.maxHealth ?? character.maxHp ?? 1),
          healthPotions: Number(character.healthPotions || 0),
          potions: Array.isArray(character.potions) ? character.potions.map((potion) => ({
            id: potion.id || potion.consumableId,
            name: potion.name,
            shortName: potion.shortName || null,
            heal: Number(potion.heal || 0),
            tier: Number(potion.tier || 0),
            quantity: Number(potion.quantity || 0),
            requiredArea: Number(potion.requiredArea || 1),
            unlocked: potion.unlocked !== false,
            visualAssetId: potion.visualAssetId || null,
          })) : [],
        },
        equipment: equipmentSnapshot,
        inventory: inventorySnapshot,
      },
    });
  }

  recordStatusView({ playerId, dashboard }) {
    const player = this.gameRepository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const character = dashboard?.character || {};
    const equipment = character.equipment || {};
    const compactItem = (item) => item ? {
      id: item.id,
      name: item.name,
      slot: item.slot || null,
      rarity: item.rarity || 'common',
      attackBonus: Number(item.attackBonus || 0),
      defenseBonus: Number(item.defenseBonus || 0),
      effect: item.effect ? {
        name: item.effect.name || null,
        description: item.effect.description || null,
      } : null,
      visualAssetId: item.visualAssetId || null,
    } : null;

    return this.streamRepository.append({
      kind: 'system',
      eventType: 'StatusViewed',
      actorPlayerId: player.id,
      actorName: player.displayName,
      body: `${player.displayName} opened Status · Level ${Number(character.level || 1)} · ${Number(character.gold ?? character.threadDust ?? 0)} Gold.`,
      metadata: {
        playerId: player.id,
        playerName: player.displayName,
        publicSnapshot: true,
        character: {
          id: character.id || player.id,
          displayName: character.displayName || player.displayName,
          level: Number(character.level || 1),
          experience: Number(character.experience ?? character.xp ?? 0),
          levelProgression: character.levelProgression || null,
          currentHealth: Number(character.currentHealth || 0),
          maxHealth: Number(character.maxHealth ?? character.maxHp ?? 1),
          stats: character.stats ? {
            attack: Number(character.stats.attack || 0),
            defense: Number(character.stats.defense || 0),
            speed: Number(character.stats.speed || 0),
            critChancePercent: Number(character.stats.critChancePercent || 0),
          } : {
            attack: Number(character.attack ?? character.attackPower ?? 0),
            defense: Number(character.defense || 0),
            speed: Number(character.speed || 0),
            critChancePercent: Number(character.critChancePercent || 0),
          },
          gold: Number(character.gold ?? character.threadDust ?? 0),
          healthPotions: Number(character.healthPotions || 0),
        },
        equipment: Object.fromEntries(Object.entries(equipment).map(([slot, item]) => [slot, compactItem(item)])),
        activeBuffs: (dashboard?.activeFightBuffs || []).map((buff) => ({
          code: buff.code,
          name: buff.name,
          description: buff.description,
          remainingFights: Number(buff.remainingFights || 0),
        })),
      },
    });
  }

  recordShopView({ playerId, shop }) {
    const player = this.gameRepository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const offers = Array.isArray(shop?.offers) ? shop.offers : [];
    const compactOffer = (offer) => ({
      sku: offer.sku,
      kind: offer.kind,
      potionId: offer.potionId || null,
      heal: offer.heal == null ? null : Number(offer.heal),
      requiredArea: offer.requiredArea == null ? null : Number(offer.requiredArea),
      name: offer.name,
      description: offer.description || null,
      visualAssetId: offer.visualAssetId || offer.item?.visualAssetId || offer.itemTemplate?.visualAssetId || null,
      cost: Number(offer.cost || 0),
      quantity: Number(offer.quantity || 1),
      affordable: Boolean(offer.affordable),
      available: Boolean(offer.available),
      item: offer.item || offer.itemTemplate ? {
        slot: (offer.item || offer.itemTemplate).slot || null,
        rarity: (offer.item || offer.itemTemplate).rarity || 'common',
        attackBonus: Number((offer.item || offer.itemTemplate).attackBonus || 0),
        defenseBonus: Number((offer.item || offer.itemTemplate).defenseBonus || 0),
        effect: (offer.item || offer.itemTemplate).effect ? {
          code: (offer.item || offer.itemTemplate).effect.code || (offer.item || offer.itemTemplate).effectCode || null,
          name: (offer.item || offer.itemTemplate).effect.name || null,
          description: (offer.item || offer.itemTemplate).effect.description || null,
        } : null,
      } : null,
    });

    return this.streamRepository.append({
      kind: 'system',
      eventType: 'ShopViewed',
      actorPlayerId: player.id,
      actorName: player.displayName,
      body: `${player.displayName} opened ${shop?.vendor?.name || 'the Shop'} · ${offers.length} offer${offers.length === 1 ? '' : 's'} · ${Number(shop?.currency?.balance || 0)} Gold available.`,
      metadata: {
        playerId: player.id,
        playerName: player.displayName,
        publicSnapshot: true,
        vendor: shop?.vendor ? {
          id: shop.vendor.id,
          name: shop.vendor.name,
          tagline: shop.vendor.tagline || null,
          characterVariant: shop.vendor.characterVariant || null,
          visualAssetId: shop.vendor.visualAssetId || null,
        } : null,
        currency: {
          code: 'gold',
          label: 'Gold',
          balance: Number(shop?.currency?.balance || 0),
        },
        available: shop?.available !== false,
        unavailableReason: shop?.unavailableReason || null,
        offers: offers.map(compactOffer),
      },
    });
  }

  recordDomainEvent(event) {
    if (event?.silentStream) return null;
    const projected = this.#project(event);
    if (!projected) return null;
    const metadata = {
      ...event,
      ...(projected.metadata || {}),
    };
    if (event.playerId) metadata.playerName = this.#playerName(event.playerId);
    return this.streamRepository.append({
      kind: 'system',
      eventType: event.type,
      runId: event.runId || null,
      dungeonId: event.dungeonId || null,
      metadata,
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
    if (simple && event.battleReplay) {
      const replay = event.battleReplay;
      const enemyName = (replay.enemies || [replay.enemy]).filter(Boolean).map((enemy) => enemy.name || 'the enemy').join(' + ') || event.enemyName || 'the enemy';
      const recovery = event.recovery?.healed > 0 ? ` · +${event.recovery.healed} HP` : '';
      const unlock = replay.areaUnlocks?.find((candidate) => candidate.playerId === event.playerId) || replay.areaUnlocks?.[0] || null;
      const unlockCopy = unlock?.areaNumber ? ` · Area ${unlock.areaNumber} unlocked` : '';
      if (replay.status === 'defeat') return `${actorName || 'The party'} fell to ${enemyName}.${recovery}`;
      if (replay.status === 'victory') return `${actorName || 'The party'} cleared the Dungeon by defeating ${enemyName}.${recovery}${unlockCopy}`;
      return `${actorName || 'The party'} cleared ${enemyName}.${recovery} Continue, use a Health Potion, or leave the Dungeon.`;
    }
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
        const defeated = event.defeatedEnemyName || titleize(event.defeatedEnemyId);
        result = `${actorName} attacked ${defeated} for ${event.damage} and defeated it.`;
        if (event.roomCleared || event.phase === 'between_encounter') {
          result += ` Room cleared. Continue, use a Health Potion, or leave the Dungeon${event.nextEnemyName ? ` · Next: ${event.nextEnemyName} ${event.nextEnemyHp}/${event.nextEnemyMaxHp} HP` : ''}.`;
        } else if (event.enemyHp !== null && event.enemyHp !== undefined && !['complete', 'event'].includes(event.phase)) result += ` Next: ${enemyHp}.`;
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
    const state = [actorHp, actorFocus, ['upgrade', 'complete', 'event', 'between_encounter'].includes(event.phase) ? '' : `${enemyHp}${exposed}${bossPhase}`].filter(Boolean).join(' · ');
    return `${result}${state ? ` ${state}.` : ''}${relic}${phaseChange}${intent}${phase}`;
  }

  #project(event) {
    const actorName = event.playerId ? this.#playerName(event.playerId) : null;
    const enemyName = event.enemyId ? titleize(event.enemyId) : null;
    const dungeonName = event.dungeonId ? titleize(event.dungeonId) : null;

    switch (event.type) {
      case 'HuntResolved': {
        const receipt = projectHuntReceipt(event, { actorName: actorName || 'Adventurer', fallbackEnemyName: enemyName || 'enemy' });
        return { actorPlayerId: event.playerId || null, actorName: 'THREADBOUND', body: receipt.text };
      }
      case 'AdventureResolved': {
        const outcome = event.victory ? 'defeated' : 'fell to';
        const health = `${event.remainingHp}/${event.maxHp} HP`;
        const rewards = event.victory ? ` · +${event.experienceGained || 0} XP · +${event.gold || 0} Gold` : '';
        const loot = event.itemName ? ` · Found ${event.itemName}${event.itemRarity ? ` (${titleize(event.itemRarity)})` : ''}` : '';
        const story = event.storyEvent?.text ? ` · ${event.storyEvent.text}` : '';
        const loss = Number(event.goldLost || 0) > 0 ? ` · −${event.goldLost} carried Gold · Bank safe` : '';
        const cooldown = event.nextAdventureReadyAt ? ` · Next Adventure ${event.nextAdventureReadyAt}` : '';
        const levelUp = event.leveledUp ? ` · LEVEL UP → ${event.level}` : '';
        return {
          actorPlayerId: event.playerId || null,
          actorName: 'THREADBOUND',
          body: `${actorName || 'Adventurer'} Adventured in ${event.areaName || `Area ${event.areaNumber}`} and ${outcome} ${event.enemyName || enemyName || 'an enemy'}. −${event.damageTaken || 0} HP · ${health}${rewards}${levelUp}${loot}${loss}${story}${cooldown}.`,
        };
      }
      case 'DuelResolved': {
        const record = event.challengerRecord || {};
        const recordText = `Record ${Number(record.wins || 0)}-${Number(record.losses || 0)}-${Number(record.draws || 0)}`;
        return {
          actorPlayerId: event.playerId,
          actorName: 'THREADBOUND',
          body: `${actorName || 'Adventurer'} dueled ${event.opponentName || 'a Guild Hall adventurer'}. ${event.receiptText || titleize(event.outcome)} · ${recordText}.`,
        };
      }
      case 'HealthPotionUsed':
        return { actorName: 'THREADBOUND', body: `${actorName} used ${event.potionName || 'a Health Potion'}. +${event.healed} HP · ${event.currentHealth}/${event.maxHealth} HP · ${event.healthPotions} Minor left.` };
      case 'HealthPotionPurchased':
        return { actorName: 'THREADBOUND', body: `${actorName} bought ${event.quantity} ${event.offerName || 'Health Potion'} · −${event.cost} Gold · ${event.healthPotions} Minor left.` };
      case 'DungeonStarted': {
        if (event.simpleCombat && event.sharedSurface) return null;
        const foe = event.enemyName || enemyName || 'an enemy';
        const enemyState = event.enemyHp === null || event.enemyHp === undefined ? '' : ` 👾 ${foe} ${event.enemyHp}/${event.enemyMaxHp} HP.`;
        const playerState = event.actorHp === null || event.actorHp === undefined ? '' : ` ❤️ ${event.actorHp}/${event.actorMaxHp} HP.`;
        const copy = event.simpleCombat
          ? `${actorName} entered ${dungeonName}.${enemyState}${playerState} Recommended Attack ${event.recommendedAttack || 9}+. Attack until the room is clear.`
          : `${actorName} entered ${dungeonName}.${enemyState}${playerState} Choose your first action.`;
        return { actorPlayerId: event.playerId || null, actorName: event.simpleCombat ? 'THREADBOUND' : actorName, body: copy };
      }
      case 'CombatActionResolved': {
        const simple = this.#isSimpleRun(event.runId);
        if (simple && event.phase === 'failed' && !event.battleReplay) return null;
        return { actorPlayerId: event.playerId || null, actorName: simple ? 'THREADBOUND' : actorName, body: this.#combatResult(event, actorName) };
      }
      case 'DungeonEncounterContinued':
        return {
          actorPlayerId: event.playerId || null,
          actorName: 'THREADBOUND',
          body: `${actorName || 'A Weaver'} continued ${dungeonName || 'the Dungeon'}. ${event.enemyName || enemyName || 'The next room'} begins now — party HP persists.`,
        };
      case 'DungeonPotionUsed':
        return {
          actorPlayerId: event.playerId || null,
          actorName: 'THREADBOUND',
          body: `${actorName || 'A Weaver'} used ${event.potionName || 'a Health Potion'} between encounters. +${event.healed || 0} HP · ${event.actorHp}/${event.actorMaxHp} HP · ${event.healthPotions ?? 0} Minor left. ${event.enemyName || enemyName || 'The next room'} begins now.`,
        };
      case 'DungeonRetreated':
        return {
          actorPlayerId: event.playerId || null,
          actorName: 'THREADBOUND',
          body: `${actorName || 'The party'} left ${dungeonName || 'the Dungeon'} between encounters. Carried Gold is safe; the clear reward was not secured.`,
        };
      case 'BossEncounterStarted':
        return { actorName: 'THREADBOUND', body: `${event.enemyName || enemyName || 'The boss'} enters — ${event.enemyHp}/${event.enemyMaxHp} HP.` };
      case 'DungeonRoomCleared':
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
            nextEnemyVisualAssetId: nextEnemy?.visualAssetId || event.nextEnemyVisualAssetId || null,
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
            nextEnemyVisualAssetId: nextEnemy?.visualAssetId || event.nextEnemyVisualAssetId || null,
            nextEnemyHp: nextEnemy?.hp ?? null,
            nextEnemyMaxHp: nextEnemy?.maxHp ?? null,
            nextEnemyIsBoss: Boolean(nextEnemy?.isBoss),
          },
          body: `${actorName || 'The party'} chose ${titleize(event.upgradeId)}.${next}`,
        };
      }
      case 'DungeonFailed': {
        const names = (event.participantIds || []).map((id) => this.#playerName(id));
        const loss = Number(event.goldLost || 0) > 0 ? ` −${event.goldLost} carried Gold · Bank safe.` : ' Carried Gold loss: 0 · Bank safe.';
        return { actorName: 'SYSTEM', body: `${names.join(', ') || 'The party'} fell in ${dungeonName}.${loss}` };
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
      case 'NpcInteracted':
        return {
          actorPlayerId: event.playerId,
          actorName: event.npcName || 'Town NPC',
          body: `${actorName || 'Adventurer'} spoke with ${event.npcName || 'a Town resident'} in ${event.townName || 'Town'}. “${event.dialogue || 'Hello, adventurer.'}”`,
        };
      case 'QuestAccepted':
        return {
          actorPlayerId: event.playerId,
          actorName: 'THREADBOUND',
          body: `${actorName || 'Adventurer'} accepted Quest: ${event.questTitle || titleize(event.questId)}.`,
        };
      case 'QuestClaimed':
        return {
          actorPlayerId: event.playerId,
          actorName: 'THREADBOUND',
          body: `${actorName || 'Adventurer'} completed Quest: ${event.questTitle || titleize(event.questId)}.`,
        };
      case 'QuestProgressed':
      case 'QuestCompleted':
        return null;
      case 'ItemGenerated': {
        if (event.silentStream) return null;
        const item = this.gameRepository.getItem(event.itemId);
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} found ${item?.name || 'equipment'}. Open Inventory to equip, Upgrade, compare, or Sell it.` };
      }
      case 'ItemEquipped': {
        const item = this.gameRepository.getItem(event.itemId);
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} equipped ${item?.name || 'equipment'}${item ? ` (+${item.attackBonus} Attack)` : ''}.` };
      }
      case 'ItemUpgraded':
        return {
          actorPlayerId: event.playerId,
          actorName,
          body: `Upgrade complete — ${event.itemName || 'equipment'} · +${event.attackIncrease} Attack · −${event.threadDustSpent} Gold · Level ${event.level}/${event.maxLevel}${event.attunementName ? ` · ${event.attunementName}` : ''}.`,
        };
      case 'ItemSold':
      case 'ItemSalvaged': {
        const gold = Math.max(0, Math.floor(Number(event.gold ?? event.threadDust ?? 0) || 0));
        return { actorPlayerId: event.playerId, actorName, body: `${actorName} sold ${event.itemName || 'equipment'} · +${gold} Gold.` };
      }
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
