import { Quest } from '../domain/Quest.js';
import { advanceQuestObjectives, describeQuestObjective, initialObjectiveProgress } from '../domain/QuestObjective.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLiteQuestRepository } from '../infrastructure/SQLiteQuestRepository.js';

function normalizeCatalog(quests) {
  if (!Array.isArray(quests)) throw new Error('QuestService requires a Quest catalog array.');
  const models = quests.map((quest) => quest instanceof Quest ? quest : new Quest(quest));
  const ids = models.map((quest) => quest.id);
  if (new Set(ids).size !== ids.length) throw new Error('Quest catalog must not contain duplicate ids.');
  return Object.freeze(models);
}

function projectQuest(quest, progress = null) {
  const progressByObjectiveId = new Map((progress?.objectiveProgress || []).map((row) => [row.objectiveId, row]));
  return Object.freeze({
    ...quest.toJSON(),
    objectives: Object.freeze(quest.objectives.map((objective) => Object.freeze({
      ...objective,
      label: describeQuestObjective(objective),
      current: Number(progressByObjectiveId.get(objective.id)?.current || 0),
      target: Number(progressByObjectiveId.get(objective.id)?.target || objective.count),
      required: Number(progressByObjectiveId.get(objective.id)?.target || objective.count),
      complete: Boolean(progressByObjectiveId.get(objective.id)?.complete),
    }))),
  });
}

function presentationState(progress) {
  if (!progress) return 'available';
  if (progress.status === 'completed') return 'claimable';
  if (progress.status === 'claimed') return 'completed';
  return progress.status;
}

export class QuestService {
  constructor({ repository, questRepository = null, areaRepository = null, eventBus = null, questCatalog = [], now = () => new Date() } = {}) {
    if (!repository) throw new Error('QuestService requires the game repository.');
    this.repository = repository;
    this.questRepository = questRepository || new SQLiteQuestRepository({ database: repository.db });
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.eventBus = eventBus;
    this.questCatalog = normalizeCatalog(questCatalog);
    this.now = now;
    this.unsubscribe = typeof this.eventBus?.subscribe === 'function'
      ? this.eventBus.subscribe((event) => this.handleEvent(event))
      : null;
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const progression = this.areaRepository.get(playerId);
    const progressByQuestId = new Map(this.questRepository.list(playerId).map((entry) => [entry.questId, entry]));
    const quests = this.questCatalog
      .filter((quest) => quest.areaNumber === progression.currentAreaNumber)
      .map((quest) => {
        const progress = progressByQuestId.get(quest.id) || null;
        return Object.freeze({
          ...projectQuest(quest, progress),
          state: presentationState(progress),
          progress: progress?.toJSON() || null,
        });
      });
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
    const accepted = this.questRepository.accept(playerId, quest.id, acceptedAt, initialObjectiveProgress(quest.objectives));
    if (!accepted.created) {
      const error = new Error('That Quest has already been accepted.');
      error.code = 'quest_already_accepted';
      throw error;
    }
    const result = Object.freeze({ quest: projectQuest(quest, accepted.progress), progress: accepted.progress.toJSON() });
    this.eventBus?.publish?.({ type: 'QuestAccepted', playerId, questId: quest.id, questTitle: quest.title, areaNumber: quest.areaNumber });
    return result;
  }

  claim(playerId, questId, claimedAt = this.now().toISOString()) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const normalizedQuestId = String(questId || '').trim().toLowerCase();
    const quest = this.questCatalog.find((candidate) => candidate.id === normalizedQuestId);
    if (!quest) {
      const error = new Error('That Quest is not available.');
      error.code = 'quest_unavailable';
      throw error;
    }
    const progress = this.questRepository.get(playerId, quest.id);
    if (!progress) {
      const error = new Error('Accept that Quest before claiming it.');
      error.code = 'quest_not_accepted';
      throw error;
    }
    if (progress.status === 'claimed') {
      const error = new Error('That Quest has already been claimed.');
      error.code = 'quest_already_claimed';
      throw error;
    }
    if (progress.status !== 'completed') {
      const error = new Error('Complete every Quest objective before claiming it.');
      error.code = 'quest_not_complete';
      throw error;
    }
    const saved = this.questRepository.save(playerId, progress.claim(claimedAt));
    const result = Object.freeze({ quest: projectQuest(quest, saved), progress: saved.toJSON() });
    this.eventBus?.publish?.({ type: 'QuestClaimed', playerId, questId: quest.id, questTitle: quest.title, areaNumber: quest.areaNumber });
    return result;
  }

  handleEvent(event) {
    const playerId = String(event?.playerId || '').trim();
    if (!playerId) return Object.freeze([]);
    const updates = [];
    for (const progress of this.questRepository.list(playerId)) {
      if (progress.status !== 'active') continue;
      const quest = this.questCatalog.find((candidate) => candidate.id === progress.questId);
      if (!quest || quest.objectives.length === 0) continue;
      const advanced = advanceQuestObjectives(quest.objectives, progress.objectiveProgress, event);
      if (!advanced.changed) continue;
      let next = progress.withObjectiveProgress(advanced.progress);
      const completedNow = advanced.complete;
      if (completedNow) next = next.complete(event.occurredAt || this.now().toISOString());
      const saved = this.questRepository.save(playerId, next);
      const update = Object.freeze({ questId: quest.id, status: saved.status, objectiveProgress: saved.objectiveProgress });
      updates.push(update);
      this.eventBus?.publish?.({
        type: completedNow ? 'QuestCompleted' : 'QuestProgressed',
        playerId,
        questId: quest.id,
        questTitle: quest.title,
        areaNumber: quest.areaNumber,
        objectiveProgress: saved.objectiveProgress,
      });
    }
    return Object.freeze(updates);
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
