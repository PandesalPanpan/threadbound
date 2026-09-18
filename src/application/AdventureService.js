import { Character } from '../domain/Character.js';
import { resolveActivityCooldown } from '../domain/ActivityCooldownPolicy.js';
import { ADVENTURE_COOLDOWN_SECONDS, capAdventureLoot, resolveAdventureRewards } from '../domain/AdventureRewardPolicy.js';
import { resolveNormalDeathPenalty } from '../domain/DeathPenaltyPolicy.js';
import { applyFightBuffs } from '../domain/FightBuffPolicy.js';
import { ItemGenerator } from '../domain/ItemGenerator.js';
import { resolveOrdinaryAdventure } from '../domain/AdventureEncounter.js';
import { progressionForExperience } from '../domain/LevelProgressionPolicy.js';
import { SQLiteAdventureCooldownRepository } from '../infrastructure/SQLiteAdventureCooldownRepository.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteBankRepository } from '../infrastructure/SQLiteBankRepository.js';
import { SQLiteEquipmentRepository } from '../infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteFightBuffRepository } from '../infrastructure/SQLiteFightBuffRepository.js';
import { SQLitePlayerProgressionRepository } from '../infrastructure/SQLitePlayerProgressionRepository.js';

function configuredAdventureCooldownSeconds() {
  const raw = process.env.THREADBOUND_ADVENTURE_COOLDOWN_SECONDS;
  if (raw == null || String(raw).trim() === '') return ADVENTURE_COOLDOWN_SECONDS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error('THREADBOUND_ADVENTURE_COOLDOWN_SECONDS must be a non-negative number.');
  return Math.floor(value);
}

/**
 * Coordinates ordinary Adventure. Area/combat/reward/cooldown rules stay in
 * domain policies while repositories own durable state and transactions.
 */
export class AdventureService {
  constructor({
    repository,
    eventBus,
    areaRepository = null,
    equipmentRepository = null,
    bankRepository = null,
    progressionRepository = null,
    cooldownRepository = null,
    fightBuffRepository = null,
    itemGenerator = new ItemGenerator(),
    rng = Math.random,
    rewardRng = rng,
    storyRng = rewardRng,
    now = () => new Date(),
    adventureCooldownSeconds = configuredAdventureCooldownSeconds(),
    activityBuffCodes = null,
  } = {}) {
    if (!repository) throw new Error('AdventureService requires the game repository.');
    if (!eventBus) throw new Error('AdventureService requires the event bus.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.equipmentRepository = equipmentRepository || new SQLiteEquipmentRepository({ database: repository.db });
    this.bankRepository = bankRepository || new SQLiteBankRepository({ database: repository.db });
    this.progressionRepository = progressionRepository || new SQLitePlayerProgressionRepository({ database: repository.db });
    this.cooldownRepository = cooldownRepository || new SQLiteAdventureCooldownRepository({ database: repository.db });
    this.fightBuffRepository = fightBuffRepository || new SQLiteFightBuffRepository({ database: repository.db });
    this.itemGenerator = itemGenerator;
    this.rng = rng;
    this.rewardRng = rewardRng;
    this.storyRng = storyRng;
    this.now = now;
    this.adventureCooldownSeconds = adventureCooldownSeconds;
    this.activityBuffCodes = activityBuffCodes || ((playerId) => this.fightBuffRepository.activeCodes(playerId));
  }

  adventure(playerId) {
    if (this.repository.getActiveRun(playerId)) {
      const error = new Error('Finish the active dungeon before starting an Adventure.');
      error.code = 'adventure_during_dungeon';
      throw error;
    }

    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    if (player.currentHealth <= 0) {
      const error = new Error('You are too wounded to Adventure. Heal first.');
      error.code = 'too_wounded_to_adventure';
      throw error;
    }

    const area = this.areaRepository.get(playerId);
    const equipment = this.equipmentRepository.getLoadout(playerId);
    const equipped = equipment.weapon || (player.equippedItemId ? this.repository.getItem(player.equippedItemId) : null);
    const character = new Character({ ...player, equippedItem: equipped, equipment });
    const activeBuffCodes = this.activityBuffCodes(playerId);
    const fightBuffs = applyFightBuffs(character.stats, activeBuffCodes);
    const cooldownPolicy = resolveActivityCooldown({
      activity: 'adventure',
      baseCooldownSeconds: this.adventureCooldownSeconds,
      equipment,
      buffCodes: activeBuffCodes,
    });
    const cooldown = this.cooldownRepository.claim(playerId, {
      now: this.now(),
      cooldownSeconds: cooldownPolicy.effectiveCooldownSeconds,
    });
    if (!cooldown.claimed) {
      const error = new Error(`Adventure is recharging. Ready in ${cooldown.remainingSeconds}s (${cooldown.nextReadyAt}).`);
      error.code = 'adventure_cooldown';
      error.nextReadyAt = cooldown.nextReadyAt;
      error.remainingSeconds = cooldown.remainingSeconds;
      throw error;
    }

    const stats = fightBuffs.stats;
    const result = resolveOrdinaryAdventure({
      player: {
        id: player.id,
        name: character.displayName,
        displayName: character.displayName,
        attack: stats.attack,
        defense: stats.defense,
        maxHp: stats.maxHp,
        speed: stats.speed,
        critChance: stats.critChance,
        equipment,
        equippedItem: equipped,
      },
      currentHealth: player.currentHealth,
      areaNumber: area.currentAreaNumber,
      encounterRoll: this.rng(),
      random: this.rng,
    });

    const progressionBefore = progressionForExperience(this.progressionRepository.get(playerId).experience);
    const rewards = resolveAdventureRewards({
      areaNumber: area.currentAreaNumber,
      victory: result.victory,
      lootRoll: this.rewardRng(),
      storyRoll: this.storyRng(),
    });

    let item = null;
    let deathPenalty = null;
    if (result.victory) {
      this.repository.addThreadDust(playerId, rewards.gold);
      this.progressionRepository.addExperience(playerId, rewards.experience);
      if (rewards.drop) {
        item = capAdventureLoot(this.itemGenerator.generateReward({ source: 'adventure' }));
        this.repository.addItem(playerId, item);
      }
    } else if (result.remainingHp <= 0) {
      const balance = this.bankRepository.getBalance(playerId);
      const plannedPenalty = resolveNormalDeathPenalty({ carriedGold: balance.carriedGold });
      const applied = this.bankRepository.loseCarriedGold(playerId, plannedPenalty.goldLost);
      deathPenalty = Object.freeze({
        ...plannedPenalty,
        carriedGoldAfter: applied.carriedGold,
        bankedGold: applied.bankedGold,
        goldLost: applied.goldLost,
      });
    }

    this.repository.setPlayerHealth(playerId, result.remainingHp);
    const fightBuffsConsumed = this.fightBuffRepository.consumeFight(playerId);
    const progression = progressionForExperience(this.progressionRepository.get(playerId).experience);
    const levelsGained = progression.level - progressionBefore.level;
    this.eventBus.publish({
      type: 'AdventureResolved',
      playerId,
      areaId: area.currentArea.id,
      areaName: area.currentArea.name,
      areaNumber: area.currentAreaNumber,
      enemyId: result.enemy.id,
      enemyName: result.enemy.name,
      enemyVisualAssetId: result.enemy.visualAssetId || null,
      enemyHp: result.enemy.hp,
      victory: result.victory,
      startingHp: result.startingHp,
      remainingHp: result.remainingHp,
      maxHp: result.maxHealth,
      damageTaken: result.damageTaken,
      gold: rewards.gold,
      experienceGained: rewards.experience,
      xp: rewards.experience,
      experience: progression.experience,
      level: progression.level,
      leveledUp: levelsGained > 0,
      levelsGained,
      goldLost: deathPenalty?.goldLost || 0,
      carriedGold: deathPenalty?.carriedGoldAfter ?? null,
      bankedGold: deathPenalty?.bankedGold ?? null,
      itemId: item?.id || null,
      itemName: item?.name || null,
      itemRarity: item?.rarity || null,
      storyEvent: rewards.storyEvent,
      adventureCooldownSeconds: cooldownPolicy.effectiveCooldownSeconds,
      adventureBaseCooldownSeconds: cooldownPolicy.baseCooldownSeconds,
      adventureCooldownReductionPercent: cooldownPolicy.appliedReductionPercent,
      nextAdventureReadyAt: cooldown.nextReadyAt,
      battleOutcome: result.battle.outcome,
      battleTurnCount: result.battle.turns.length,
      fightBuffsConsumed,
    });
    if (item) this.eventBus.publish({ type: 'ItemGenerated', playerId, itemId: item.id, source: 'adventure', silentStream: true });

    return Object.freeze({
      ...result,
      area: area.currentArea,
      rewards: Object.freeze({ ...rewards, item: item ? this.repository.getItem(item.id) : null }),
      progression,
      levelsGained,
      leveledUp: levelsGained > 0,
      deathPenalty,
      fightBuffs: Object.freeze({
        modifiers: fightBuffs.modifiers,
        consumed: fightBuffsConsumed,
      }),
      cooldown: Object.freeze({
        ready: false,
        remainingSeconds: cooldownPolicy.effectiveCooldownSeconds,
        nextReadyAt: cooldown.nextReadyAt,
        baseCooldownSeconds: cooldownPolicy.baseCooldownSeconds,
        reductionPercent: cooldownPolicy.appliedReductionPercent,
        modifiers: cooldownPolicy.modifiers,
      }),
    });
  }
}
