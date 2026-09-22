import { projectTown, townsForArea, townById, npcById } from '../content/TownCatalog.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteSimulatedAdventurerRepository } from '../infrastructure/SQLiteSimulatedAdventurerRepository.js';
import { GuildHallService } from './GuildHallService.js';

export class TownService {
  constructor({ repository, eventBus = null, areaRepository = null, townCatalog = null, guildHallService = null, arcManifestService = null } = {}) {
    if (!repository) throw new Error('TownService requires the game repository.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.arcManifestService = arcManifestService;
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
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
    const town = this.#townById(townId);
    if (!town || town.areaNumber !== progression.currentAreaNumber) {
      const error = new Error('That Town is not available in the current Area.');
      error.code = 'town_unavailable';
      throw error;
    }

    return this.#projectTown(town);
  }

  interact(playerId, townId, npcId) {
    const town = this.get(playerId, townId);
    const npc = town.npcs.find((candidate) => candidate.id === String(npcId || '').trim().toLowerCase());
    if (!npc) {
      const error = new Error('That NPC is not available in this Town.');
      error.code = 'npc_unavailable';
      throw error;
    }
    if (!this.eventBus) throw new Error('TownService requires the event bus for NPC interactions.');

    const interaction = Object.freeze({
      townId: town.id,
      townName: town.name,
      areaNumber: town.areaNumber,
      npcId: npc.id,
      npcName: npc.name,
      role: npc.role,
      service: npc.service,
      dialogue: npc.dialogue,
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
      // Keep legacy/bundled v1 and unillustrated v2 towns out of the current
      // player shell until their NPC art is explicitly authored.
      onlyWithExplicitNpcVisual: true,
    }) || [];
    // An explicitly illustrated generated Town is the authored Arc surface for
    // this Area; retain foundation Towns alongside it for compatibility.
    return [...generated, ...foundation];
  }

  #townById(townId) {
    const foundation = this.townCatalog.townById(townId);
    if (foundation) return foundation;
    return this.arcManifestService?.runtimeTownById(townId, { onlyWithExplicitNpcVisual: true }) || null;
  }
}
