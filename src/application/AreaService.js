import { AreaProgression, projectArea } from '../domain/AreaProgression.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';

function unlockedAreas(highestUnlockedAreaNumber, currentAreaNumber) {
  return Object.freeze(Array.from({ length: highestUnlockedAreaNumber }, (_unused, index) => {
    const area = projectArea(index + 1);
    return Object.freeze({ ...area, current: area.number === currentAreaNumber, unlocked: true });
  }));
}

export class AreaService {
  constructor({ repository, eventBus, areaRepository = null } = {}) {
    if (!repository) throw new Error('AreaService requires the game repository.');
    if (!eventBus) throw new Error('AreaService requires the event bus.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const progression = this.areaRepository.get(playerId);
    return Object.freeze({
      currentArea: progression.currentArea,
      highestUnlockedArea: progression.highestUnlockedArea,
      currentAreaNumber: progression.currentAreaNumber,
      highestUnlockedAreaNumber: progression.highestUnlockedAreaNumber,
      areas: unlockedAreas(progression.highestUnlockedAreaNumber, progression.currentAreaNumber),
    });
  }

  travel(playerId, areaNumber) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const before = this.areaRepository.get(playerId);
    const targetNumber = Number(areaNumber);
    let next;
    try {
      next = new AreaProgression(before).withCurrentArea(targetNumber);
    } catch (error) {
      if (/not unlocked/i.test(error.message)) {
        const locked = new Error('That Area is not unlocked yet.');
        locked.code = 'area_locked';
        throw locked;
      }
      throw error;
    }

    const saved = this.areaRepository.save(playerId, next);
    if (before.currentAreaNumber !== saved.currentAreaNumber) {
      this.eventBus.publish({
        type: 'AreaTraveled',
        playerId,
        fromArea: before.currentArea,
        toArea: saved.currentArea,
        highestUnlockedArea: saved.highestUnlockedArea,
      });
    }
    return this.browse(playerId);
  }
}
