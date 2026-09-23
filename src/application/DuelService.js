import { randomUUID } from 'node:crypto';
import { projectAutomaticBattleResult } from './AutomaticBattleReadModel.js';
import { Character } from '../domain/Character.js';
import { resolveDuelBattle } from '../domain/DuelBattle.js';
import { FOUNDATION_GUILD_HALL_ROSTERS } from '../content/FoundationGuildHallCatalog.js';
import { SQLiteDuelRepository } from '../infrastructure/SQLiteDuelRepository.js';
import { SQLiteEquipmentRepository } from '../infrastructure/SQLiteEquipmentRepository.js';
import { SQLiteSimulatedAdventurerRepository } from '../infrastructure/SQLiteSimulatedAdventurerRepository.js';
import { BATTLE_FIGMA_VISUAL_ASSET_IDS, resolveVisualAssetId } from '../content/VisualAssetCatalog.js';

function playerVisualAssetId(playerId) {
  return resolveVisualAssetId({ id: playerId }, 'character') || BATTLE_FIGMA_VISUAL_ASSET_IDS['rune-bard'];
}

function catalogOpponent(opponentId) {
  const id = String(opponentId || '').trim();
  for (const entries of Object.values(FOUNDATION_GUILD_HALL_ROSTERS)) {
    const match = entries.find((entry) => entry.adventurer.id === id);
    if (match) return match.adventurer;
  }
  return null;
}

/**
 * Service Layer boundary for Duels against persistent Guild Hall adventurers.
 *
 * Duel combat is delegated to the shared automatic battle domain engine. The
 * service only loads authoritative participants, records the immutable result,
 * projects Battle Details, and publishes one concise activity event. Duels are
 * stat checks: they do not mutate normal player HP, Gold, Honey, XP, or items.
 */
export class DuelService {
  constructor({
    repository,
    eventBus,
    equipmentRepository = null,
    simulatedAdventurerRepository = null,
    duelRepository = null,
    random = Math.random,
    idFactory = randomUUID,
  } = {}) {
    if (!repository) throw new Error('DuelService requires the game repository.');
    if (!eventBus) throw new Error('DuelService requires the event bus.');
    if (typeof random !== 'function') throw new Error('DuelService random source must be a function.');
    if (typeof idFactory !== 'function') throw new Error('DuelService idFactory must be a function.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.equipmentRepository = equipmentRepository || new SQLiteEquipmentRepository({ database: repository.db });
    this.simulatedAdventurerRepository = simulatedAdventurerRepository || new SQLiteSimulatedAdventurerRepository({ database: repository.db });
    this.duelRepository = duelRepository || new SQLiteDuelRepository({ database: repository.db });
    this.random = random;
    this.idFactory = idFactory;
  }

  duel(playerId, opponentId, { duelId = null } = {}) {
    const targetId = String(opponentId || '').trim();
    const requestedIdentity = String(duelId || '').trim();
    if (requestedIdentity) {
      const existing = this.duelRepository.get(requestedIdentity);
      if (existing) {
        if (existing.challengerId !== playerId || existing.opponentId !== targetId) {
          const error = new Error('Duel id was already used for a different battle.');
          error.code = 'duel_replay_mismatch';
          throw error;
        }
        const storedOpponent = existing.battleReplay?.details?.combatants?.find((combatant) => combatant.id === targetId) || null;
        const seededOpponent = catalogOpponent(targetId);
        return Object.freeze({
          duelId: requestedIdentity,
          opponent: Object.freeze({
            id: targetId,
            name: storedOpponent?.label || seededOpponent?.name || targetId,
            level: seededOpponent?.level ?? null,
            stats: storedOpponent?.stats || seededOpponent?.stats || null,
            equipment: storedOpponent?.equipment || seededOpponent?.equipment || null,
            visualAssetId: storedOpponent?.visualAssetId || seededOpponent?.visualAssetId || null,
            signatureSkill: storedOpponent?.signatureSkill || null,
          }),
          outcome: existing.outcome,
          replayed: true,
          record: this.duelRepository.recordFor(playerId),
          opponentRecord: this.duelRepository.recordFor(targetId),
          battle: existing.battleReplay,
        });
      }
    }

    if (this.repository.getActiveRun(playerId)) {
      const error = new Error('Finish the active dungeon before starting a Duel.');
      error.code = 'duel_during_dungeon';
      throw error;
    }

    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const seeded = catalogOpponent(targetId);
    if (!seeded) {
      const error = new Error('Duel opponent is not available in the Guild Hall.');
      error.code = 'duel_opponent_unavailable';
      throw error;
    }
    const opponentState = this.simulatedAdventurerRepository.ensure(seeded).adventurer;
    const identity = requestedIdentity || String(this.idFactory() || '').trim();
    if (!identity) throw new Error('Duel id is required.');
    const equipment = this.equipmentRepository.getLoadout(playerId);
    const challenger = new Character({
      ...player,
      equipment,
      equippedItem: equipment.weapon || null,
    });

    const result = resolveDuelBattle({
      challenger: {
        id: challenger.id,
        displayName: challenger.displayName,
        stats: challenger.stats,
        equipment,
        equippedItem: equipment.weapon || null,
        visualAssetId: playerVisualAssetId(playerId),
      },
      opponent: {
        id: opponentState.id,
        name: opponentState.name,
        stats: opponentState.stats,
        equipment: opponentState.equipment,
        equippedItem: opponentState.equipment.weapon || null,
        visualAssetId: resolveVisualAssetId({ id: opponentState.id, spriteVariant: seeded.spriteVariant }, 'character'),
        spriteVariant: seeded.spriteVariant,
      },
      random: this.random,
    });
    const readModel = projectAutomaticBattleResult(result.battle, { viewerId: playerId });
    const recorded = this.duelRepository.recordResult({
      duelId: identity,
      challengerId: playerId,
      opponentId: opponentState.id,
      outcome: result.outcome,
      winnerId: result.winnerId,
      loserId: result.loserId,
      turnCount: result.battle.turns.length,
      battleReplay: readModel,
    });

    if (recorded.applied) {
      this.eventBus.publish({
        type: 'DuelResolved',
        playerId,
        duelId: identity,
        opponentId: opponentState.id,
        opponentName: opponentState.name,
        outcome: result.outcome,
        winnerId: result.winnerId,
        loserId: result.loserId,
        turnCount: result.battle.turns.length,
        challengerRecord: this.duelRepository.recordFor(playerId),
        opponentRecord: this.duelRepository.recordFor(opponentState.id),
        receiptText: readModel.receipt.text,
        battleReplay: readModel,
      });
    }

    return Object.freeze({
      duelId: identity,
      opponent: Object.freeze({
        id: opponentState.id,
        name: opponentState.name,
        level: opponentState.level,
        stats: opponentState.stats,
        equipment: opponentState.equipment,
        visualAssetId: readModel.details.combatants.find((combatant) => combatant.id === opponentState.id)?.visualAssetId || null,
        signatureSkill: readModel.details.combatants.find((combatant) => combatant.id === opponentState.id)?.signatureSkill || null,
      }),
      outcome: result.outcome,
      replayed: recorded.replayed,
      record: this.duelRepository.recordFor(playerId),
      opponentRecord: this.duelRepository.recordFor(opponentState.id),
      battle: recorded.duel?.battleReplay || readModel,
    });
  }
}
