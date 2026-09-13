import { projectArea } from './AreaProgression.js';

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

/**
 * Immutable Quest definition. Objective mechanics deliberately arrive in M6-05;
 * this model owns stable identity and world placement only.
 */
export class Quest {
  constructor({ id, title, description = '', areaNumber, townId = null, npcId = null } = {}) {
    this.id = requireStableId(id, 'Quest id');
    this.title = requireText(title, 'Quest title');
    this.description = String(description || '').trim();
    this.area = projectArea(areaNumber);
    this.areaNumber = this.area.number;
    this.townId = optionalStableId(townId, 'Quest Town id');
    this.npcId = optionalStableId(npcId, 'Quest NPC id');
    if (this.npcId && !this.townId) throw new Error('Quest NPC id requires a Town id.');
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
    });
  }
}

/** Durable per-player lifecycle for a Quest definition. */
export class QuestProgress {
  constructor({ questId, status = 'active', acceptedAt = null, completedAt = null, claimedAt = null } = {}) {
    this.questId = requireStableId(questId, 'Quest id');
    this.status = String(status || '').trim().toLowerCase();
    if (!QUEST_STATUS_SET.has(this.status)) throw new Error(`Unsupported Quest status: ${this.status || '(empty)'}.`);
    this.acceptedAt = acceptedAt;
    this.completedAt = completedAt;
    this.claimedAt = claimedAt;
    if (this.status === 'active' && (completedAt || claimedAt)) throw new Error('Active Quest progress cannot have completion timestamps.');
    if (this.status === 'completed' && !completedAt) throw new Error('Completed Quest progress requires completedAt.');
    if (this.status === 'claimed' && (!completedAt || !claimedAt)) throw new Error('Claimed Quest progress requires completion and claim timestamps.');
    Object.freeze(this);
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
    });
  }
}
