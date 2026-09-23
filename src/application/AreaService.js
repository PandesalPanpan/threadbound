import { AreaProgression, projectArea } from '../domain/AreaProgression.js';
import { AREA_CONTENT, areaContentForNumber, progressionChallengeForArea } from '../content/AreaContentCatalog.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { TownService } from './TownService.js';

function unlockedAreas(highestUnlockedAreaNumber, currentAreaNumber) {
  return Object.freeze(Array.from({ length: highestUnlockedAreaNumber }, (_unused, index) => {
    const area = projectArea(index + 1);
    return Object.freeze({ ...area, current: area.number === currentAreaNumber, unlocked: true });
  }));
}

export class AreaService {
  constructor({ repository, eventBus, areaRepository = null, townService = null } = {}) {
    if (!repository) throw new Error('AreaService requires the game repository.');
    if (!eventBus) throw new Error('AreaService requires the event bus.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.townService = townService || new TownService({ repository, eventBus, areaRepository: this.areaRepository });
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const progression = this.areaRepository.get(playerId);
    const frontierNumber = progression.highestUnlockedAreaNumber;
    const frontierAreaContent = areaContentAtFrontier(frontierNumber);
    const nextAreaContent = areaContentAtFrontier(frontierNumber + 1);
    const frontierChallenge = frontierAreaContent ? progressionChallengeForArea(frontierNumber) : null;
    return Object.freeze({
      currentArea: progression.currentArea,
      highestUnlockedArea: progression.highestUnlockedArea,
      currentAreaNumber: progression.currentAreaNumber,
      highestUnlockedAreaNumber: progression.highestUnlockedAreaNumber,
      areas: unlockedAreas(progression.highestUnlockedAreaNumber, progression.currentAreaNumber),
      currentAreaContent: safeAreaSummary(progression.currentAreaNumber),
      nextLockedArea: nextAreaContent && frontierChallenge ? Object.freeze({
        ...projectArea(frontierNumber + 1),
        unlocked: false,
        locked: true,
        recommendedLevel: nextAreaContent.recommendedLevel,
        lockReason: `Clear ${frontierChallenge.name} with ${frontierChallenge.requiredHumanPlayers} ready human players.`,
        progressionChallenge: Object.freeze({
          ...frontierChallenge,
          areaNumber: frontierNumber,
          areaName: projectArea(frontierNumber).name,
        }),
      }) : null,
      towns: this.townService.browse(playerId).towns,
    });
  }

  travel(playerId, areaNumber) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const before = this.areaRepository.get(playerId);
    const targetNumber = Number(areaNumber);
    if (!Number.isInteger(targetNumber) || targetNumber < 1 || targetNumber > AREA_CONTENT.length) {
      const unavailable = new Error('That Area is not part of the supported world yet.');
      unavailable.code = 'area_unavailable';
      throw unavailable;
    }
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

function safeAreaSummary(areaNumber) {
  try {
    const area = areaContentForNumber(areaNumber);
    return Object.freeze({
      id: area.id,
      arcId: area.arcId,
      arcAreaId: area.arcAreaId,
      recommendedLevel: area.recommendedLevel,
      loreTags: area.loreTags,
      progressionChallenge: area.progressionChallenge,
    });
  } catch (error) {
    if (error.code !== 'area_content_unavailable') throw error;
    return null;
  }
}

function areaContentAtFrontier(areaNumber) {
  if (!Number.isInteger(areaNumber) || areaNumber < 1 || areaNumber > AREA_CONTENT.length) return null;
  return AREA_CONTENT.find((area) => area.number === areaNumber) || null;
}
