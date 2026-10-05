import { Character } from '../domain/Character.js';
import { projectAutomaticBattleResult } from './AutomaticBattleReadModel.js';
import { itemRewardProfileForArea, pickAreaHuntEncounter } from '../content/AreaContentCatalog.js';
import { BATTLE_FIGMA_VISUAL_ASSET_IDS } from '../content/VisualAssetCatalog.js';
import { selectPotionForUse } from '../content/PotionCatalog.js';
import { resolveActivityCooldown } from '../domain/ActivityCooldownPolicy.js';
import { resolveNormalDeathPenalty } from '../domain/DeathPenaltyPolicy.js';
import { applyFightBuffs } from '../domain/FightBuffPolicy.js';
import { resolveHealAction } from '../domain/HealingPolicy.js';
import { HUNT_COOLDOWN_SECONDS } from '../domain/HuntCooldownPolicy.js';
import { capAdventureLoot } from '../domain/AdventureRewardPolicy.js';
import { ItemGenerator } from '../domain/ItemGenerator.js';
import { resolveAutomaticHunt } from '../domain/HuntEncounter.js';
import { progressionForExperience } from '../domain/LevelProgressionPolicy.js';
import { SQLiteBankRepository } from '../infrastructure/SQLiteBankRepository.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteEquipmentRepository } from '../infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteFightBuffRepository } from '../infrastructure/SQLiteFightBuffRepository.js';
import { SQLiteHuntCooldownRepository } from '../infrastructure/SQLiteHuntCooldownRepository.js';
import { SQLitePlayerProgressionRepository } from '../infrastructure/SQLitePlayerProgressionRepository.js';

const HUNT_WEAVER_VISUALS = Object.freeze([
  BATTLE_FIGMA_VISUAL_ASSET_IDS['bramble-druid'],
  BATTLE_FIGMA_VISUAL_ASSET_IDS['rune-bard'],
  BATTLE_FIGMA_VISUAL_ASSET_IDS['iron-vanguard'],
]);

function stableVisualIndex(value, length) {
  if (!length) return 0;
  let hash = 2166136261;
  for (const character of String(value || 'threadbound')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function playerBattleVisualAssetId(playerId) {
  return HUNT_WEAVER_VISUALS[stableVisualIndex(playerId, HUNT_WEAVER_VISUALS.length)] || null;
}

function battleLoadoutSnapshot(equipment = {}) {
  return Object.fromEntries(Object.entries(equipment).map(([slot, item]) => [slot, item ? {
    id: item.id,
    name: item.name,
    slot: item.slot || slot,
    rarity: item.rarity || null,
    attackBonus: Number(item.attackBonus || 0),
    effectCode: item.effectCode || null,
    visualAssetId: item.visualAssetId || null,
  } : null]));
}

function configuredHuntCooldownSeconds() {
  const raw = process.env.THREADBOUND_HUNT_COOLDOWN_SECONDS;
  if (raw == null || String(raw).trim() === '') return HUNT_COOLDOWN_SECONDS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error('THREADBOUND_HUNT_COOLDOWN_SECONDS must be a non-negative number.');
  return Math.floor(value);
}

/**
 * Application service for the short-form progression loop. Hunts deliberately do
 * not create a persisted DungeonRun: one command resolves one authoritative
 * automatic battle, then this service coordinates persistence/rewards/events.
 */
export class HuntService {
  constructor({
    repository,
    eventBus,
    progressionRepository = null,
    equipmentRepository = null,
    cooldownRepository = null,
    bankRepository = null,
    fightBuffRepository = null,
    itemGenerator = new ItemGenerator(),
    rng = Math.random,
    now = () => new Date(),
    huntCooldownSeconds = configuredHuntCooldownSeconds(),
    activityBuffCodes = null,
  }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.progressionRepository = progressionRepository || new SQLitePlayerProgressionRepository({ database: repository.db });
    this.equipmentRepository = equipmentRepository || new SQLiteEquipmentRepository({ database: repository.db });
    this.cooldownRepository = cooldownRepository || new SQLiteHuntCooldownRepository({ database: repository.db });
    this.bankRepository = bankRepository || new SQLiteBankRepository({ database: repository.db });
    this.areaRepository = new SQLiteAreaRepository({ database: repository.db });
    this.fightBuffRepository = fightBuffRepository || new SQLiteFightBuffRepository({ database: repository.db });
    this.itemGenerator = itemGenerator;
    this.rng = rng;
    this.now = now;
    this.huntCooldownSeconds = huntCooldownSeconds;
    this.activityBuffCodes = activityBuffCodes || ((playerId) => this.fightBuffRepository.activeCodes(playerId));
  }

  hunt(playerId) {
    if (this.repository.getActiveRun(playerId)) {
      const error = new Error('Finish the active dungeon before hunting again.');
      error.code = 'hunt_during_dungeon';
      throw error;
    }

    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const equipment = this.equipmentRepository.getLoadout(playerId);
    const equipped = equipment.weapon || (player.equippedItemId ? this.repository.getItem(player.equippedItemId) : null);
    const character = new Character({ ...player, equippedItem: equipped, equipment });
    const area = this.areaRepository.get(playerId);
    if (player.currentHealth <= 0) {
      const error = new Error('You are too wounded to Hunt. Heal with a health potion or recover naturally over time.');
      error.code = 'too_wounded_to_hunt';
      throw error;
    }

    const activeBuffCodes = this.activityBuffCodes(playerId);
    const fightBuffs = applyFightBuffs(character.stats, activeBuffCodes);
    const cooldownPolicy = resolveActivityCooldown({
      activity: 'hunt',
      baseCooldownSeconds: this.huntCooldownSeconds,
      equipment,
      buffCodes: activeBuffCodes,
    });
    const rawNow = this.now();
    const now = rawNow instanceof Date ? new Date(rawNow.getTime()) : new Date(rawNow);
    if (Number.isNaN(now.getTime())) throw new Error('Hunt time must be a valid date.');
    const storedCooldown = this.cooldownRepository.get(playerId, { now });
    if (!storedCooldown.ready) {
      const error = new Error(`Hunt is recharging. Ready in ${storedCooldown.remainingSeconds}s (${storedCooldown.nextReadyAt}).`);
      error.code = 'hunt_cooldown';
      error.nextReadyAt = storedCooldown.nextReadyAt;
      error.remainingSeconds = storedCooldown.remainingSeconds;
      throw error;
    }
    let cooldown = null;

    const stats = fightBuffs.stats;
    const encounter = pickAreaHuntEncounter(area.currentAreaNumber, this.rng());
    const result = resolveAutomaticHunt({
      player: {
        id: player.id,
        name: character.displayName,
        displayName: character.displayName,
        attack: stats.attack,
        defense: stats.defense,
        maxHp: stats.maxHp,
        speed: stats.speed,
        critChance: stats.critChance,
        visualAssetId: playerBattleVisualAssetId(player.id),
        equipment,
        equippedItem: equipped,
      },
      currentHealth: player.currentHealth,
      encounter,
      context: {
        battleId: `hunt:${playerId}:${new Date(now.getTime() + cooldownPolicy.effectiveCooldownSeconds * 1000).toISOString()}`,
        areaId: area.currentArea?.id || null,
        areaNumber: area.currentAreaNumber,
      },
      random: this.rng,
    });
    const battleReplay = projectAutomaticBattleResult(result.battle, { viewerId: player.id });
    const battleLoadout = battleLoadoutSnapshot(equipment);
    let item = null;
    let healthPotionsFound = 0;
    let deathPenalty = null;
    let growth = null;
    if (result.victory && this.rng() < result.dropChance) {
      item = capAdventureLoot(this.itemGenerator.generateReward({
        source: 'hunt',
        ...itemRewardProfileForArea(area.currentAreaNumber),
      }));
    }
    if (result.victory && this.rng() < 0.2) healthPotionsFound = 1;

    let committed;
    try {
      committed = this.repository.withTransaction(() => {
      cooldown = this.cooldownRepository.claimInTransaction(playerId, {
        now,
        cooldownSeconds: cooldownPolicy.effectiveCooldownSeconds,
      });
      if (!cooldown.claimed) {
        const error = new Error(`Hunt is recharging. Ready in ${cooldown.remainingSeconds}s (${cooldown.nextReadyAt}).`);
        error.code = 'hunt_cooldown';
        error.nextReadyAt = cooldown.nextReadyAt;
        error.remainingSeconds = cooldown.remainingSeconds;
        throw error;
      }
      if (result.victory) {
        // SQLite still stores this balance in the legacy thread_dust column during migration.
        this.repository.addThreadDust(playerId, result.gold);
        growth = this.progressionRepository.grantExperienceInTransaction(playerId, result.experience, {
          currentHealthAfterCombat: result.remainingHp,
        });
        if (item) this.repository.addItem(playerId, item);
        if (healthPotionsFound) this.repository.addConsumable(playerId, 'minor-health-potion', healthPotionsFound);
      } else if (result.remainingHp <= 0) {
        const balance = this.bankRepository.getBalance(playerId);
        const plannedPenalty = resolveNormalDeathPenalty({ carriedGold: balance.carriedGold });
        const applied = this.bankRepository.loseCarriedGoldInTransaction(playerId, plannedPenalty.goldLost);
        deathPenalty = Object.freeze({
          ...plannedPenalty,
          carriedGoldAfter: applied.carriedGold,
          bankedGold: applied.bankedGold,
          goldLost: applied.goldLost,
        });
      }
      if (!growth) this.repository.setPlayerHealth(playerId, result.remainingHp);
      const fightBuffsConsumed = this.fightBuffRepository.consumeFightInTransaction(playerId);
      const progression = progressionForExperience(this.progressionRepository.get(playerId).experience);
      const levelsGained = growth?.levelsGained || 0;
      const remainingHp = growth?.currentHealth ?? result.remainingHp;
      const maxHp = growth?.maxHealth ?? result.maxHealth;
      const itemSnapshot = item ? this.repository.getItem(item.id) : null;
      const itemStats = itemSnapshot ? {
        attackBonus: Number(itemSnapshot.attackBonus || itemSnapshot.stats?.attackBonus || 0),
        defenseBonus: Number(itemSnapshot.defenseBonus || itemSnapshot.stats?.defenseBonus || 0),
        maxHpBonus: Number(itemSnapshot.maxHpBonus || itemSnapshot.stats?.maxHpBonus || 0),
        speedBonus: Number(itemSnapshot.speedBonus || itemSnapshot.stats?.speedBonus || 0),
        critChanceBonus: Number(itemSnapshot.critChanceBonus || itemSnapshot.stats?.critChanceBonus || 0),
      } : null;
      const refreshed = this.repository.getPlayer(playerId) || player;
      const gold = Number(refreshed.gold ?? refreshed.threadDust ?? character.gold ?? 0);
      const response = {
        ...result,
        remainingHp,
        maxHealth: maxHp,
        progression,
        battleReplay,
        battleLoadout,
        levelsGained,
        leveledUp: levelsGained > 0,
        maxHealthIncrease: growth?.maxHealthIncrease || 0,
        deathPenalty,
        fightBuffs: { modifiers: fightBuffs.modifiers, consumed: fightBuffsConsumed },
        cooldown: {
          ready: false,
          remainingSeconds: cooldownPolicy.effectiveCooldownSeconds,
          nextReadyAt: cooldown.nextReadyAt,
          baseCooldownSeconds: cooldownPolicy.baseCooldownSeconds,
          reductionPercent: cooldownPolicy.appliedReductionPercent,
          modifiers: cooldownPolicy.modifiers,
        },
        item: itemSnapshot,
        character: {
          attackPower: stats.attack,
          maxHealth: maxHp,
          currentHealth: remainingHp,
          healthPotions: refreshed.healthPotions ?? player.healthPotions,
          potions: this.repository.listConsumables(playerId),
          gold,
          experience: progression.experience,
          xp: progression.experience,
          level: progression.level,
          levelProgression: progression,
          threadDust: gold,
        },
        replayed: false,
      };
      this.repository.recordCombatResultInTransaction({
        battleId: `hunt:${playerId}:${cooldown.nextReadyAt}`,
        activity: 'hunt',
        playerId,
        result: response,
        createdAt: now.toISOString(),
      });
      return { response, item: itemSnapshot, deathPenalty, growth, fightBuffsConsumed, progression, levelsGained, remainingHp, maxHp, itemStats, refreshed, gold };
      });
    } catch (error) {
      if (error?.code === 'hunt_cooldown') {
        const currentCooldown = this.cooldownRepository.get(playerId, { now });
        error.nextReadyAt = currentCooldown.nextReadyAt || error.nextReadyAt;
        error.remainingSeconds = currentCooldown.remainingSeconds;
        error.message = `Hunt is recharging. Ready in ${error.remainingSeconds}s (${error.nextReadyAt}).`;
      }
      throw error;
    }
    ({ item, deathPenalty, growth } = committed);
    const { fightBuffsConsumed, progression, levelsGained, remainingHp, maxHp, itemStats } = committed;
    this.eventBus.publish({
      type: 'HuntResolved',
      playerId,
      enemyId: result.enemy.id,
      enemyName: result.enemy.name,
      enemyHp: result.enemy.hp,
      attackPower: result.attackPower,
      attacksRequired: result.attacksRequired,
      damageTaken: result.damageTaken,
      remainingHp,
      maxHp,
      currentHealth: remainingHp,
      maxHealth: maxHp,
      maxHealthIncrease: growth?.maxHealthIncrease || 0,
      victory: result.victory,
      gold: result.gold,
      goldLost: deathPenalty?.goldLost || 0,
      carriedGold: deathPenalty?.carriedGoldAfter ?? null,
      bankedGold: deathPenalty?.bankedGold ?? null,
      deathPenaltyPercent: deathPenalty?.lossPercent || 0,
      experienceGained: result.experience,
      xp: result.experience,
      experience: progression.experience,
      level: progression.level,
      leveledUp: levelsGained > 0,
      levelsGained,
      experienceIntoLevel: progression.experienceIntoLevel,
      experienceNeededForLevel: progression.experienceNeededForLevel,
      experienceToNextLevel: progression.experienceToNextLevel,
      battleOutcome: result.battle.outcome,
      battleTurnCount: result.battle.turns.length,
      battle: result.battle,
      battleReplay,
      battleLoadout,
      playerVisualAssetId: playerBattleVisualAssetId(player.id),
      enemyVisualAssetId: result.enemy.visualAssetId || null,
      huntCooldownSeconds: cooldownPolicy.effectiveCooldownSeconds,
      huntBaseCooldownSeconds: cooldownPolicy.baseCooldownSeconds,
      huntCooldownReductionPercent: cooldownPolicy.appliedReductionPercent,
      nextHuntReadyAt: cooldown.nextReadyAt,
      fightBuffsConsumed,
      // Preserve the old event field until legacy consumers are migrated.
      threadDust: result.gold,
      itemId: item?.id || null,
      itemName: item?.name || null,
      itemRarity: item?.rarity || null,
      itemSlot: item?.slot || null,
      itemVisualAssetId: item?.visualAssetId || null,
      itemStats,
      itemAttackBonus: itemStats?.attackBonus || 0,
      healthPotionsFound,
      // Phase 6 may populate this projection after authoritative quest progress is
      // introduced. Keeping the shape explicit prevents the browser from inferring it.
      questProgress: [],
    });
    if (item) this.eventBus.publish({ type: 'ItemGenerated', playerId, itemId: item.id, source: 'hunt', silentStream: true });

    return committed.response;
  }

  heal(playerId, potionSelection = null) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const area = this.areaRepository.get(playerId);
    const potion = selectPotionForUse(this.repository.listConsumables(playerId), potionSelection, area.currentAreaNumber);
    const plan = resolveHealAction({
      activeRun: this.repository.getActiveRun(playerId),
      currentHealth: player.currentHealth,
      maxHealth: player.maxHealth,
      potionQuantity: potion.quantity,
      potionId: potion.id,
      potionName: potion.name,
      potionHeal: potion.heal,
    });
    const recovery = this.repository.useConsumable(playerId, {
      consumableId: potion.id,
      heal: potion.heal,
      currentHealth: player.currentHealth,
    });
    this.eventBus.publish({ type: 'HealthPotionUsed', playerId, healMethod: plan.method, potionId: potion.id, potionName: potion.name, potionHeal: potion.heal, ...recovery });
    return recovery;
  }

  // Compatibility adapter for the existing /api/recovery/potion route and older
  // callers. New application code should use the routine `heal` action.
  useHealthPotion(playerId, potionSelection = null) {
    try {
      return this.heal(playerId, potionSelection);
    } catch (error) {
      if (error.code === 'heal_during_dungeon') error.code = 'potion_during_dungeon';
      throw error;
    }
  }
}
