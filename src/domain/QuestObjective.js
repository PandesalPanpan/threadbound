const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const QUEST_OBJECTIVE_TYPES = Object.freeze([
  'kill',
  'hunt',
  'adventure',
  'collect',
  'boss',
  'visit',
  'speak',
]);
const TYPE_SET = new Set(QUEST_OBJECTIVE_TYPES);

function stableId(value, label) {
  const id = String(value || '').trim().toLowerCase();
  if (!STABLE_ID.test(id)) throw new Error(`${label} must be a stable kebab-case id.`);
  return id;
}

function positiveCount(value, label = 'Quest objective count') {
  const count = Number(value ?? 1);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error(`${label} must be a positive integer.`);
  return count;
}

function requireTarget(type, targetId) {
  if (['kill', 'collect', 'boss', 'visit', 'speak'].includes(type)) {
    return stableId(targetId, `Quest ${type} objective target`);
  }
  if (targetId != null && String(targetId).trim() !== '') {
    throw new Error(`Quest ${type} objectives do not accept a target id.`);
  }
  return null;
}

export function normalizeQuestObjective(objective, index = 0) {
  if (!objective || typeof objective !== 'object' || Array.isArray(objective)) {
    throw new Error('Quest objective must be an object.');
  }
  const type = String(objective.type || '').trim().toLowerCase();
  if (!TYPE_SET.has(type)) throw new Error(`Unsupported Quest objective type: ${type || '(empty)'}.`);
  const id = objective.id ? stableId(objective.id, 'Quest objective id') : `objective-${index + 1}`;
  const targetId = requireTarget(type, objective.targetId);
  const count = positiveCount(objective.count);
  const targetLabel = String(objective.targetLabel || '').trim() || null;
  const model = Object.freeze({ id, type, targetId, targetLabel, count });
  return model;
}

export function normalizeQuestObjectives(objectives = []) {
  if (!Array.isArray(objectives)) throw new Error('Quest objectives must be an array.');
  const normalized = objectives.map((objective, index) => normalizeQuestObjective(objective, index));
  const ids = normalized.map((objective) => objective.id);
  if (new Set(ids).size !== ids.length) throw new Error('Quest objective ids must be unique within a Quest.');
  return Object.freeze(normalized);
}

export function initialObjectiveProgress(objectives = []) {
  return Object.freeze(normalizeQuestObjectives(objectives).map((objective) => Object.freeze({
    objectiveId: objective.id,
    current: 0,
    target: objective.count,
    complete: false,
  })));
}

function eventIncrement(objective, event) {
  switch (objective.type) {
    case 'kill':
      return event.victory === true
        && ['HuntResolved', 'AdventureResolved'].includes(event.type)
        && event.enemyId === objective.targetId ? 1 : 0;
    case 'hunt':
      return event.type === 'HuntResolved' ? 1 : 0;
    case 'adventure':
      return event.type === 'AdventureResolved' ? 1 : 0;
    case 'collect':
      return event.type === 'ItemGenerated'
        && [event.itemId, event.itemTemplateId, event.contentItemId].filter(Boolean).includes(objective.targetId) ? 1 : 0;
    case 'boss':
      return event.type === 'DungeonCompleted' && event.dungeonId === objective.targetId ? 1 : 0;
    case 'visit':
    case 'speak':
      return event.type === 'NpcInteracted' && event.npcId === objective.targetId ? 1 : 0;
    default:
      return 0;
  }
}

export function advanceQuestObjectives(objectives, progressRows, event) {
  const normalized = normalizeQuestObjectives(objectives);
  const existing = new Map((progressRows || []).map((row) => [row.objectiveId, row]));
  let changed = false;
  const next = normalized.map((objective) => {
    const row = existing.get(objective.id) || { objectiveId: objective.id, current: 0, target: objective.count, complete: false };
    const increment = eventIncrement(objective, event);
    const current = Math.min(objective.count, Math.max(0, Number(row.current || 0)) + increment);
    const complete = current >= objective.count;
    if (current !== Number(row.current || 0) || complete !== Boolean(row.complete)) changed = true;
    return Object.freeze({ objectiveId: objective.id, current, target: objective.count, complete });
  });
  return Object.freeze({
    changed,
    complete: normalized.length > 0 && next.every((row) => row.complete),
    progress: Object.freeze(next),
  });
}

export function describeQuestObjective(objective) {
  const model = normalizeQuestObjective(objective);
  const label = model.targetLabel || model.targetId;
  const suffix = model.count === 1 ? '' : ` ×${model.count}`;
  switch (model.type) {
    case 'kill': return `Defeat ${label}${suffix}`;
    case 'hunt': return `Hunt${suffix}`;
    case 'adventure': return `Adventure${suffix}`;
    case 'collect': return `Collect ${label}${suffix}`;
    case 'boss': return `Defeat boss ${label}${suffix}`;
    case 'visit': return `Visit ${label}${suffix}`;
    case 'speak': return `Speak to ${label}${suffix}`;
    default: throw new Error(`Unsupported Quest objective type: ${model.type}.`);
  }
}
