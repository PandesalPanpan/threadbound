import { Character } from '../domain/Character.js';
import { resolveNormalDeathPenalty } from '../domain/DeathPenaltyPolicy.js';
import { resolveOrdinaryAdventure } from '../domain/AdventureEncounter.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteBankRepository } from '../infrastructure/SQLiteBankRepository.js';
import { SQLiteEquipmentRepository } from '../infrastructure/SQLiteEquipmentRepository.js';

/**
 * Coordinates the ordinary Adventure use case. World placement comes from the
 * persisted Area model; battle rules come from the shared automatic simulator.
 * M5-05 intentionally owns cooldowns, rewards, loot, and story-event projection.
 */
export class AdventureService {
  constructor({
    repository,
    eventBus,
    areaRepository = null,
    equipmentRepository = null,
    bankRepository = null,
    rng = Math.random,
  } = {}) {
    if (!repository) throw new Error('AdventureService requires the game repository.');
    if (!eventBus) throw new Error('AdventureService requires the event bus.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.equipmentRepository = equipmentRepository || new SQLiteEquipmentRepository({ database: repository.db });
    this.bankRepository = bankRepository || new SQLiteBankRepository({ database: repository.db });
    this.rng = rng;
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
    const stats = character.stats;
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

    let deathPenalty = null;
    if (!result.victory && result.remainingHp <= 0) {
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
    this.eventBus.publish({
      type: 'AdventureResolved',
      playerId,
      areaId: area.currentArea.id,
      areaName: area.currentArea.name,
      areaNumber: area.currentAreaNumber,
      enemyId: result.enemy.id,
      enemyName: result.enemy.name,
      enemyHp: result.enemy.hp,
      victory: result.victory,
      startingHp: result.startingHp,
      remainingHp: result.remainingHp,
      maxHp: result.maxHealth,
      damageTaken: result.damageTaken,
      goldLost: deathPenalty?.goldLost || 0,
      carriedGold: deathPenalty?.carriedGoldAfter ?? null,
      bankedGold: deathPenalty?.bankedGold ?? null,
      battleOutcome: result.battle.outcome,
      battleTurnCount: result.battle.turns.length,
      // M5-05 will replace these explicit zero-value placeholders with the
      // authoritative Adventure reward/cooldown/story projection.
      gold: 0,
      experienceGained: 0,
      loot: null,
      storyEvent: null,
    });

    return Object.freeze({ ...result, area: area.currentArea, deathPenalty });
  }
}
