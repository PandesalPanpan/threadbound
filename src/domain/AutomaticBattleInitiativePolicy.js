export const AUTOMATIC_BATTLE_INITIATIVE_RULES = Object.freeze({
  minimumSpeed: 1,
  maxActionFrequencyMultiplier: 2,
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeBattleSpeed(value) {
  return Math.max(
    AUTOMATIC_BATTLE_INITIATIVE_RULES.minimumSpeed,
    Math.floor(finiteNumber(value, AUTOMATIC_BATTLE_INITIATIVE_RULES.minimumSpeed)),
  );
}

function actionCounts(turns = []) {
  const counts = new Map();
  for (const turn of turns || []) {
    const actorId = String(turn?.actorId || '');
    if (!actorId) continue;
    counts.set(actorId, (counts.get(actorId) || 0) + 1);
  }
  return counts;
}

/**
 * Canonical Speed initiative projection for the automatic battle engine.
 *
 * Each combatant advances on a virtual timeline. Higher Speed lowers the time
 * until that combatant's next action, so sufficiently fast actors can act more
 * than once before a slower opponent acts again. Effective Speed is capped at
 * 2x the slowest combatant's Speed, which bounds the advantage to at most two
 * actions per one slower action and prevents extreme/generated stats from
 * creating runaway turn chains.
 */
export function speedInitiativeState({ combatants, turns = [] } = {}) {
  if (!Array.isArray(combatants) || combatants.length === 0) {
    throw new Error('Speed initiative requires combatants.');
  }

  const normalized = combatants.map((combatant, index) => {
    const id = String(combatant?.id || '').trim();
    if (!id) throw new Error(`Combatant ${index + 1} requires an id for Speed initiative.`);
    return { id, index, speed: normalizeBattleSpeed(combatant?.speed) };
  });
  if (new Set(normalized.map((entry) => entry.id)).size !== normalized.length) {
    throw new Error('Speed initiative combatant ids must be unique.');
  }

  const slowestSpeed = Math.min(...normalized.map((entry) => entry.speed));
  const speedCap = slowestSpeed * AUTOMATIC_BATTLE_INITIATIVE_RULES.maxActionFrequencyMultiplier;
  const counts = actionCounts(turns);

  return normalized.map((entry) => {
    const actionsTaken = counts.get(entry.id) || 0;
    const effectiveSpeed = Math.min(entry.speed, speedCap);
    return Object.freeze({
      ...entry,
      effectiveSpeed,
      actionsTaken,
      nextActionAt: (actionsTaken + 1) / effectiveSpeed,
    });
  });
}

export function selectActorBySpeed({ combatants, turns = [] } = {}) {
  const initiative = speedInitiativeState({ combatants, turns });
  initiative.sort((left, right) => {
    const timeDifference = left.nextActionAt - right.nextActionAt;
    if (Math.abs(timeDifference) > Number.EPSILON) return timeDifference;
    return left.index - right.index;
  });
  return initiative[0].id;
}

export function createSpeedTurnSelector() {
  return ({ combatants, turns }) => selectActorBySpeed({ combatants, turns });
}
