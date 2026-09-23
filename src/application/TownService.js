import { projectTown, townsForArea, townById, npcById } from '../content/TownCatalog.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteQuestRepository } from '../infrastructure/SQLiteQuestRepository.js';
import { SQLiteSimulatedAdventurerRepository } from '../infrastructure/SQLiteSimulatedAdventurerRepository.js';
import { QUEST_CATALOG } from '../content/QuestCatalog.js';
import { GuildHallService } from './GuildHallService.js';

export class TownService {
  constructor({ repository, eventBus = null, areaRepository = null, questRepository = null, townCatalog = null, guildHallService = null, arcManifestService = null } = {}) {
    if (!repository) throw new Error('TownService requires the game repository.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.arcManifestService = arcManifestService;
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.questRepository = questRepository || (repository.db
      ? new SQLiteQuestRepository({ database: repository.db })
      : null);
    this.townCatalog = townCatalog || { townsForArea, townById, projectTown, npcById };
    this.guildHallService = guildHallService || new GuildHallService({
      repository: new SQLiteSimulatedAdventurerRepository({ database: repository.db }),
      gameRepository: repository,
    });
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');

    const progression = this.areaRepository.get(playerId);
    const towns = this.#availableTowns(progression.currentAreaNumber)
      .map((town) => this.#projectTown(town));

    return Object.freeze({
      currentArea: progression.currentArea,
      towns: Object.freeze(towns),
    });
  }

  get(playerId, townId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');

    const progression = this.areaRepository.get(playerId);
    const availableTowns = this.#availableTowns(progression.currentAreaNumber);
    const normalizedTownId = String(townId || '').trim().toLowerCase();
    let town = availableTowns.find((candidate) => candidate.id === normalizedTownId) || null;
    if (!town) {
      const alias = this.#townById(normalizedTownId);
      town = alias && alias.areaNumber === progression.currentAreaNumber
        ? availableTowns.find((candidate) => candidate.name.trim().toLowerCase() === alias.name.trim().toLowerCase()) || alias
        : null;
    }
    if (!town || town.areaNumber !== progression.currentAreaNumber) {
      const error = new Error('That Town is not available in the current Area.');
      error.code = 'town_unavailable';
      throw error;
    }

    return this.#projectTown(town);
  }

  interact(playerId, townId, npcId) {
    const town = this.get(playerId, townId);
    const projectedNpc = town.npcs.find((candidate) => candidate.id === String(npcId || '').trim().toLowerCase());
    if (!projectedNpc) {
      const error = new Error('That NPC is not available in this Town.');
      error.code = 'npc_unavailable';
      throw error;
    }
    if (!this.eventBus) throw new Error('TownService requires the event bus for NPC interactions.');
    const npc = this.townCatalog.npcById?.(projectedNpc.id) || projectedNpc;
    const dialogue = this.#dialogueFor(playerId, town, npc);

    const interaction = Object.freeze({
      townId: town.id,
      townName: town.name,
      areaNumber: town.areaNumber,
      npcId: projectedNpc.id,
      npcName: projectedNpc.name,
      role: projectedNpc.role,
      service: projectedNpc.service,
      dialogue,
    });

    this.eventBus.publish({
      type: 'NpcInteracted',
      playerId,
      ...interaction,
    });
    return interaction;
  }

  #projectTown(town) {
    const projected = typeof town?.toJSON === 'function'
      ? (this.townCatalog.projectTown ? this.townCatalog.projectTown(town) : town.toJSON())
      : structuredClone(town);
    const hasGuildHall = Array.isArray(projected.services) && projected.services.includes('guild_hall');
    return Object.freeze({
      ...projected,
      guildHall: hasGuildHall ? this.guildHallService.browse(projected.id) : null,
    });
  }

  #availableTowns(areaNumber) {
    const foundation = this.townCatalog.townsForArea(areaNumber);
    const generated = this.arcManifestService?.runtimeTowns({
      areaNumber,
    }) || [];
    const remainingGenerated = new Set(generated);
    const mergedFoundation = foundation.map((town) => {
      const base = this.#projectTown(town);
      const sameHub = generated.filter((candidate) => candidate.areaNumber === town.areaNumber
        && candidate.name.trim().toLowerCase() === town.name.trim().toLowerCase());
      for (const candidate of sameHub) remainingGenerated.delete(candidate);
      if (sameHub.length === 0) return town;

      const npcIds = new Set((base.npcs || []).map((npc) => npc.id));
      const npcs = [...(base.npcs || [])];
      for (const candidate of sameHub) {
        for (const npc of candidate.npcs || []) {
          if (npcIds.has(npc.id)) continue;
          npcIds.add(npc.id);
          npcs.push(npc);
        }
      }
      return {
        ...base,
        services: [...new Set([...(base.services || []), ...sameHub.flatMap((candidate) => candidate.services || [])])],
        npcIds: [...npcIds],
        npcs,
      };
    });
    return [...mergedFoundation, ...remainingGenerated];
  }

  #townById(townId) {
    const foundation = this.townCatalog.townById(townId);
    if (foundation) return foundation;
    return this.arcManifestService?.runtimeTownById(townId) || null;
  }

  #dialogueFor(playerId, town, npc) {
    const progression = this.areaRepository.get(playerId);
    const areaContext = progression.highestUnlockedAreaNumber > town.areaNumber
      ? 'returning'
      : town.areaNumber === 1 && progression.highestUnlockedAreaNumber === 1
        ? 'welcome'
        : 'frontier';
    const questHistory = this.#questHistoryFor(playerId, town, npc);
    const questContext = questHistory.some((entry) => entry.status === 'active')
      ? 'quest-active'
      : questHistory.some((entry) => ['completed', 'claimed'].includes(entry.status))
        ? 'quest-completed'
        : null;
    const configuredQuestContext = npc.dialogueByContext?.[questContext];
    const context = Array.isArray(configuredQuestContext) && configuredQuestContext.length > 0
      ? questContext
      : areaContext;
    const configured = npc.dialogueByContext?.[context];
    const choices = Array.isArray(configured) && configured.length > 0
      ? configured
      : [String(npc.dialogue || `${npc.name} is available in ${town.name}.`)];
    const historyKey = questHistory
      .map((entry) => `${entry.status}:${entry.questId}`)
      .sort()
      .join(',');
    let hash = 2166136261;
    for (const character of `${playerId}:${npc.id}:${context}:${historyKey}`) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return String(choices[(hash >>> 0) % choices.length] || choices[0]);
  }

  #questHistoryFor(playerId, town, npc) {
    try {
      const rows = this.questRepository?.list?.(playerId);
      if (!Array.isArray(rows)) return [];
      const definitionsById = new Map();
      let authored = [];
      try { authored = this.arcManifestService?.runtimeQuests?.() || []; }
      catch {}
      for (const quest of authored) definitionsById.set(String(quest?.id || '').trim().toLowerCase(), quest);
      for (const quest of QUEST_CATALOG) {
        const definition = quest.toJSON();
        if (!definitionsById.has(definition.id)) definitionsById.set(definition.id, definition);
      }

      const relevant = [];
      for (const row of rows) {
        if (!row || !['active', 'completed', 'claimed'].includes(row.status)) continue;
        const questId = String(row.questId || '').trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(questId)) continue;
        const baseQuestId = questId.replace(/-again-\d+$/, '');
        const definition = row.definition || definitionsById.get(questId) || definitionsById.get(baseQuestId);
        if (!definition) continue;
        const areaNumber = Number(definition.areaNumber ?? definition.area?.number);
        if (areaNumber !== town.areaNumber) continue;
        const speaksToNpc = (definition.objectives || []).some((objective) =>
          String(objective.type || '').toLowerCase() === 'speak' && objective.targetId === npc.id);
        if (definition.npcId !== npc.id && !speaksToNpc) continue;
        relevant.push({ questId, status: row.status });
      }
      return relevant;
    } catch {
      // Quest history is optional context; an unavailable read must not block
      // an otherwise valid Town interaction.
      return [];
    }
  }
}
