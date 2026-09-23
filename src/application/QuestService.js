import { Quest } from '../domain/Quest.js';
import { advanceQuestObjectives, describeQuestObjective, initialObjectiveProgress } from '../domain/QuestObjective.js';
import { QUEST_CATALOG } from '../content/QuestCatalog.js';
import { SQLiteAreaRepository } from '../infrastructure/SQLiteAreaRepository.js';
import { SQLitePlayerProgressionRepository } from '../infrastructure/SQLitePlayerProgressionRepository.js';
import { SQLiteQuestRepository } from '../infrastructure/SQLiteQuestRepository.js';

const QUEST_OFFER_COUNT = 3;

function normalizeCatalog(quests) {
  if (!Array.isArray(quests)) throw new Error('QuestService requires a Quest catalog array.');
  const models = quests.map((quest) => quest instanceof Quest ? quest : new Quest(quest));
  const ids = models.map((quest) => quest.id);
  if (new Set(ids).size !== ids.length) throw new Error('Quest catalog must not contain duplicate ids.');
  return Object.freeze(models);
}

function projectQuest(quest, progress = null, state = null) {
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
    ...(state ? { state } : {}),
    ...(progress ? { progress: progress.toJSON() } : {}),
  });
}

function presentationState(progress) {
  if (!progress) return 'available';
  if (progress.status === 'completed') return 'claimable';
  if (progress.status === 'claimed') return 'completed';
  return progress.status;
}

function definitionForProgress(progress, templatesById) {
  if (progress.definition) return new Quest(progress.definition);
  return templatesById.get(progress.questId) || null;
}

function templateIdForProgress(progress, templatesById) {
  const definition = definitionForProgress(progress, templatesById);
  return definition?.templateId || definition?.id || progress.questId;
}

function questInstance(template, id) {
  return new Quest({ ...template.toJSON(), id, templateId: template.templateId });
}

function questError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Server-owned renewable Quest offers, progress, and transactional rewards. */
export class QuestService {
  constructor({
    repository,
    questRepository = null,
    areaRepository = null,
    progressionRepository = null,
    eventBus = null,
    arcManifestService = null,
    catalog = null,
    questCatalog = QUEST_CATALOG,
    now = () => new Date(),
  } = {}) {
    if (!repository) throw new Error('QuestService requires the game repository.');
    this.repository = repository;
    this.questRepository = questRepository || new SQLiteQuestRepository({ database: repository.db });
    this.areaRepository = areaRepository || new SQLiteAreaRepository({ database: repository.db });
    this.progressionRepository = progressionRepository || new SQLitePlayerProgressionRepository({ database: repository.db });
    if (this.progressionRepository.db !== repository.db) throw new Error('Quest rewards must share the game repository database transaction.');
    this.eventBus = eventBus;
    this.arcManifestService = arcManifestService;
    // `questCatalog` remains supported for existing app/tests. The explicit
    // catalog argument is the preferred boundary for newer callers.
    this.questCatalog = normalizeCatalog(catalog === null ? questCatalog : catalog);
    this.templatesById = new Map(this.questCatalog.map((quest) => [quest.id, quest]));
    this.now = now;
    this.unsubscribe = typeof this.eventBus?.subscribe === 'function'
      ? this.eventBus.subscribe((event) => this.handleEvent(event))
      : null;
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const progression = this.areaRepository.get(playerId);
    const stored = this.questRepository.list(playerId);
    const currentOffers = this.#currentOffers(progression.currentAreaNumber, stored);
    const storedById = new Map(stored.map((entry) => [entry.questId, entry]));
    const selected = new Map();

    // Active and claimable work remains visible after travel. A catalog update
    // cannot rewrite these because each accepted row has its own definition snapshot.
    for (const progress of stored) {
      if (progress.status === 'claimed') continue;
      const quest = definitionForProgress(progress, this.templatesById);
      if (!quest) continue;
      selected.set(quest.id, projectQuest(quest, progress, presentationState(progress)));
    }
    const recentlyClaimed = stored.filter((progress) => progress.status === 'claimed')
      .filter((progress) => definitionForProgress(progress, this.templatesById)?.areaNumber === progression.currentAreaNumber)
      .sort((left, right) => String(right.claimedAt || '').localeCompare(String(left.claimedAt || '')))[0] || null;
    if (recentlyClaimed) {
      const quest = definitionForProgress(recentlyClaimed, this.templatesById);
      if (quest) selected.set(quest.id, projectQuest(quest, recentlyClaimed, 'completed'));
    }
    for (const quest of currentOffers) {
      if (selected.has(quest.id)) continue;
      selected.set(quest.id, projectQuest(quest, storedById.get(quest.id) || null, presentationState(storedById.get(quest.id) || null)));
    }

    return Object.freeze({
      currentArea: progression.currentArea,
      quests: Object.freeze([...selected.values()]),
    });
  }

  accept(playerId, questId, acceptedAt = this.now().toISOString()) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const normalizedQuestId = String(questId || '').trim().toLowerCase();
    this.#allTemplates();
    const progression = this.areaRepository.get(playerId);
    const stored = this.questRepository.list(playerId);
    const definition = this.templatesById.get(normalizedQuestId);
    if (definition && definition.areaNumber !== progression.currentAreaNumber) {
      throw questError('quest_area_mismatch', 'That Quest opportunity belongs to another Area.');
    }
    const prior = this.questRepository.get(playerId, normalizedQuestId);
    if (prior) {
      if (prior.status === 'claimed') throw questError('quest_already_claimed', 'That Quest has already been claimed.');
      throw questError('quest_already_accepted', 'That Quest has already been accepted.');
    }
    const quest = this.#currentOffers(progression.currentAreaNumber, stored).find((candidate) => candidate.id === normalizedQuestId);
    if (!quest) throw questError('quest_unavailable', 'That Quest opportunity is not available in the current Area.');

    const accepted = this.questRepository.accept(
      playerId,
      quest.id,
      acceptedAt,
      initialObjectiveProgress(quest.objectives),
      quest.toJSON(),
    );
    if (!accepted.created) throw questError('quest_already_accepted', 'That Quest has already been accepted.');
    const result = Object.freeze({ quest: projectQuest(quest, accepted.progress, 'active'), progress: accepted.progress.toJSON() });
    this.eventBus?.publish?.({ type: 'QuestAccepted', playerId, questId: quest.id, questTitle: quest.title, areaNumber: quest.areaNumber });
    return result;
  }

  claim(playerId, questId, claimedAt = this.now().toISOString()) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const normalizedQuestId = String(questId || '').trim().toLowerCase();
    const progress = this.questRepository.get(playerId, normalizedQuestId);
    if (!progress) throw questError('quest_not_accepted', 'Accept that Quest before claiming it.');
    if (progress.status === 'claimed') throw questError('quest_already_claimed', 'That Quest has already been claimed.');
    if (progress.status !== 'completed') throw questError('quest_not_complete', 'Complete every Quest objective before claiming it.');
    const quest = definitionForProgress(progress, this.templatesById);
    if (!quest) throw questError('quest_unavailable', 'That Quest definition is no longer available.');

    const reward = this.questRepository.claimWithRewards(playerId, quest.id, claimedAt, {
      gold: quest.reward.gold,
      experience: quest.reward.experience,
      currentHealthAfterCombat: player.currentHealth,
      progressionRepository: this.progressionRepository,
    });
    const result = Object.freeze({
      quest: projectQuest(quest, reward.progress, 'completed'),
      progress: reward.progress.toJSON(),
      goldAwarded: reward.goldAwarded,
      experienceAwarded: reward.experienceAwarded,
      progression: reward.progression?.progression || null,
      levelsGained: reward.levelsGained,
      maxHealthIncrease: reward.maxHealthIncrease,
      maxHealth: reward.maxHealth,
      currentHealth: reward.currentHealth,
    });
    this.eventBus?.publish?.({
      type: 'QuestClaimed',
      playerId,
      questId: quest.id,
      questTitle: quest.title,
      areaNumber: quest.areaNumber,
      goldAwarded: reward.goldAwarded,
      experienceAwarded: reward.experienceAwarded,
      progression: reward.progression?.progression || null,
      levelsGained: reward.levelsGained,
      maxHealthIncrease: reward.maxHealthIncrease,
      maxHealth: reward.maxHealth,
      currentHealth: reward.currentHealth,
    });
    return result;
  }

  handleEvent(event) {
    const playerId = String(event?.playerId || '').trim();
    if (!playerId) return Object.freeze([]);
    const updates = [];
    for (const progress of this.questRepository.list(playerId)) {
      if (progress.status !== 'active') continue;
      const quest = definitionForProgress(progress, this.templatesById);
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

  #currentOffers(areaNumber, stored) {
    const templates = this.#allTemplates().filter((quest) => quest.areaNumber === areaNumber);
    if (templates.length === 0) return Object.freeze([]);
    const claimedCount = stored.filter((progress) => progress.status === 'claimed').length;
    const startIndex = claimedCount % templates.length;
    const occupiedTemplateIds = new Set(stored
      .filter((progress) => progress.status !== 'claimed')
      .map((progress) => templateIdForProgress(progress, this.templatesById)));
    const offeredTemplates = [];
    for (let offset = 0; offset < templates.length && offeredTemplates.length < QUEST_OFFER_COUNT; offset += 1) {
      const template = templates[(startIndex + offset) % templates.length];
      if (!occupiedTemplateIds.has(template.templateId)) offeredTemplates.push(template);
    }
    const acceptedCounts = new Map();
    for (const progress of stored) {
      const templateId = templateIdForProgress(progress, this.templatesById);
      acceptedCounts.set(templateId, (acceptedCounts.get(templateId) || 0) + 1);
    }
    return Object.freeze(offeredTemplates.map((template) => {
      const occurrence = (acceptedCounts.get(template.templateId) || 0) + 1;
      const id = occurrence === 1 ? template.id : `${template.id}-again-${occurrence - 1}`;
      return questInstance(template, id);
    }));
  }

  #allTemplates() {
    const byId = new Map();
    let authored = [];
    try { authored = this.arcManifestService?.runtimeQuests?.() || []; }
    catch { authored = []; }
    for (const definition of authored) {
      try {
        const quest = definition instanceof Quest ? definition : new Quest(definition);
        // Published Arc content is authoritative when it intentionally uses a
        // foundation Quest ID; old accepted rows retain their own snapshots.
        byId.set(quest.id, quest);
      } catch {
        // Invalid optional Arc content cannot block the core Quest board.
      }
    }
    for (const quest of this.questCatalog) if (!byId.has(quest.id)) byId.set(quest.id, quest);
    this.templatesById = new Map([...byId.values()].map((quest) => [quest.id, quest]));
    return [...byId.values()];
  }
}
