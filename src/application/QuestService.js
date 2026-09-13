import { Quest } from '../domain/Quest.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteQuestRepository } from '../infrastructure/SQLiteQuestRepository.js';

function normalizeCatalog(quests) {
  if (!Array.isArray(quests)) throw new Error('QuestService requires a Quest catalog array.');
  const models = quests.map((quest) => quest instanceof Quest ? quest : new Quest(quest));
  const ids = models.map((quest) => quest.id);
  if (new Set(ids).size !== ids.length) throw new Error('Quest catalog must not contain duplicate ids.');
  return Object.freeze(models);
}

export class QuestService {
  constructor({ repository, questRepository = null, areaRepository = null, eventBus = null, questCatalog = [] } = {}) {
    if (!repository) throw new Error('QuestService requires the game repository.');
    this.repository = repository;
    this.questRepository = questRepository || new SQLiteQuestRepository({ database: repository.db });
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.eventBus = eventBus;
    this.questCatalog = normalizeCatalog(questCatalog);
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const progression = this.areaRepository.get(playerId);
    const progressByQuestId = new Map(this.questRepository.list(playerId).map((entry) => [entry.questId, entry]));
    const quests = this.questCatalog
      .filter((quest) => quest.areaNumber === progression.currentAreaNumber)
      .map((quest) => Object.freeze({
        ...quest.toJSON(),
        state: progressByQuestId.get(quest.id)?.status || 'available',
        progress: progressByQuestId.get(quest.id)?.toJSON() || null,
      }));
    return Object.freeze({ currentArea: progression.currentArea, quests: Object.freeze(quests) });
  }

  accept(playerId, questId, acceptedAt = new Date().toISOString()) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const quest = this.questCatalog.find((candidate) => candidate.id === String(questId || '').trim().toLowerCase());
    if (!quest) {
      const error = new Error('That Quest is not available.');
      error.code = 'quest_unavailable';
      throw error;
    }
    const progression = this.areaRepository.get(playerId);
    if (quest.areaNumber !== progression.currentAreaNumber) {
      const error = new Error('That Quest is not available in the current Area.');
      error.code = 'quest_unavailable';
      throw error;
    }
    const accepted = this.questRepository.accept(playerId, quest.id, acceptedAt);
    if (!accepted.created) {
      const error = new Error('That Quest has already been accepted.');
      error.code = 'quest_already_accepted';
      throw error;
    }
    const result = Object.freeze({ quest: quest.toJSON(), progress: accepted.progress.toJSON() });
    this.eventBus?.publish({ type: 'QuestAccepted', playerId, questId: quest.id, areaNumber: quest.areaNumber });
    return result;
  }
}
