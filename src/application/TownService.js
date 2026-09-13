import { projectTown, townsForArea, townById } from '../content/TownCatalog.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';

export class TownService {
  constructor({ repository, areaRepository = null, townCatalog = null } = {}) {
    if (!repository) throw new Error('TownService requires the game repository.');
    this.repository = repository;
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.townCatalog = townCatalog || { townsForArea, townById, projectTown };
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');

    const progression = this.areaRepository.get(playerId);
    const towns = this.townCatalog.townsForArea(progression.currentAreaNumber)
      .map((town) => this.townCatalog.projectTown ? this.townCatalog.projectTown(town) : town.toJSON());

    return Object.freeze({
      currentArea: progression.currentArea,
      towns: Object.freeze(towns),
    });
  }

  get(playerId, townId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');

    const progression = this.areaRepository.get(playerId);
    const town = this.townCatalog.townById(townId);
    if (!town || town.areaNumber !== progression.currentAreaNumber) {
      const error = new Error('That Town is not available in the current Area.');
      error.code = 'town_unavailable';
      throw error;
    }

    return this.townCatalog.projectTown ? this.townCatalog.projectTown(town) : town.toJSON();
  }
}
