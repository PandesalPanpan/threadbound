import { projectArea } from './AreaProgression.js';
import { initialObjectiveProgress, normalizeQuestObjectives } from './QuestObjective.js';

export const QUEST_PROGRESS_STATUSES = Object.freeze(['active', 'completed', 'claimed']);
const QUEST_STATUS_SET = new Set(QUEST_PROGRESS_STATUSES);
const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requireStableId(value, label) {
  const id = String(value || '').trim();
  if (!STABLE_ID.test(id)) throw new Error(`${label} must be a stable kebab-case id.`);
  return id;
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function optionalStableId(value, label) {
  if (value == null || String(value).trim() === '') return null;
  return requireStableId(value, label);
}

function normalizeObjectiveProgress(rows = []) {
  if (!Array.isArray(rows)) throw new Error('Quest objective progress must be an array.');
  const normalized = rows.map((row) => {
    const objectiveId = requireStableId(row?.objectiveId, 'Quest objective id');
    const current = Number(row?.current ?? 0);
    const target = Number(row?.target ?? 1);
    if (!Number.isSafeInteger(current) || current < 0) throw new Error('Quest objective current progress must be a non-negative integer.');
    if (!Number.isSafeInteger(target) || target < 1) throw new Error('Quest objective target must be a positive integer.');
    return Object.freeze({ objectiveId, current: Math.min(current, target), target, complete: current >= target });
  });
  if (new Set(normalized.map((row) => row.objectiveId)).size !== normalized.length) {
    throw new Error('Quest objective progress ids must be unique.');
  }
  return Object.freeze(normalized);
}

/** Immutable Quest definition with a constrained, data-only objective vocabulary. */
export class Quest {
  constructor({ id, title, description = '', areaNumber, townId = null, npcId = null, objectives = [] } = {}) {
    this.id = requireStableId(id, 'Quest id');
    this.title = requireText(title, 'Quest title');
    this.description = String(description || '').trim();
    this.area = projectArea(areaNumber);
    this.areaNumber = this.area.number;
    this.townId = optionalStableId(townId, 'Quest Town id');
    this.npcId = optionalStableId(npcId, 'Quest NPC id');
    if (this.npcId && !this.townId) throw new Error('Quest NPC id requires a Town id.');
    this.objectives = normalizeQuestObjectives(objectives);
    Object.freeze(this);
  }

  toJSON() {
    return Object.freeze({
      id: this.id,
      title: this.title,
      description: this.description,
      area: this.area,
      areaNumber: this.areaNumber,
      townId: this.townId,
      npcId: this.npcId,
      objectives: this.objectives,
    });
  }
}

/** Durable per-player lifecycle and objective counters for a Quest definition. */
export class QuestProgress {
  constructor({ questId, status = 'active', acceptedAt = null, completedAt = null, claimedAt = null, objectiveProgress = [] } = {}) {
    this.questId = requireStableId(questId, 'Quest id');
    this.status = String(status || '').trim().toLowerCase();
    if (!QUEST_STATUS_SET.has(this.status)) throw new Error(`Unsupported Quest status: ${this.status || '(empty)'}.`);
    this.acceptedAt = acceptedAt;
    this.completedAt = completedAt;
    this.claimedAt = claimedAt;
    this.objectiveProgress = normalizeObjectiveProgress(objectiveProgress);
    if (this.status === 'active' && (completedAt || claimedAt)) throw new Error('Active Quest progress cannot have completion timestamps.');
    if (this.status === 'completed' && !completedAt) throw new Error('Completed Quest progress requires completedAt.');
    if (this.status === 'claimed' && (!completedAt || !claimedAt)) throw new Error('Claimed Quest progress requires completion and claim timestamps.');
    Object.freeze(this);
  }

  static acceptedFor(quest, acceptedAt = new Date().toISOString()) {
    const model = quest instanceof Quest ? quest : new Quest(quest);
    return new QuestProgress({ questId: model.id, acceptedAt, objectiveProgress: initialObjectiveProgress(model.objectives) });
  }

  withObjectiveProgress(objectiveProgress) {
    if (this.status !== 'active') return this;
    return new QuestProgress({ ...this.toJSON(), objectiveProgress });
  }

  complete(at = new Date().toISOString()) {
    if (this.status !== 'active') return this;
    return new QuestProgress({ ...this.toJSON(), status: 'completed', completedAt: at });
  }

  claim(at = new Date().toISOString()) {
    if (this.status === 'claimed') return this;
    if (this.status !== 'completed') throw new Error('Only a completed Quest can be claimed.');
    return new QuestProgress({ ...this.toJSON(), status: 'claimed', claimedAt: at });
  }

  toJSON() {
    return Object.freeze({
      questId: this.questId,
      status: this.status,
      acceptedAt: this.acceptedAt,
      completedAt: this.completedAt,
      claimedAt: this.claimedAt,
      objectiveProgress: this.objectiveProgress,
    });
  }
}
