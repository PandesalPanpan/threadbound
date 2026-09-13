import { normalizeSimulatedAdventurerActivityProfile } from './SimulatedAdventurer.js';

const HOUR_MS = 60 * 60 * 1000;

export const SIMULATED_ADVENTURER_SIMULATION_CADENCE = Object.freeze({
  casual: Object.freeze({ intervalMs: 8 * HOUR_MS, maxActionsPerRun: 2 }),
  steady: Object.freeze({ intervalMs: 4 * HOUR_MS, maxActionsPerRun: 3 }),
  dedicated: Object.freeze({ intervalMs: 2 * HOUR_MS, maxActionsPerRun: 4 }),
});

const ACTION_XP = Object.freeze({
  hunt: 12,
  adventure: 20,
});

function simulationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseInstant(value, field) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ''));
  if (!Number.isFinite(timestamp)) throw simulationError('simulated_adventurer_invalid_schedule', `${field} must be a valid instant.`);
  return timestamp;
}

function actionForBucket(bucketNumber) {
  return bucketNumber % 4 === 0 ? 'adventure' : 'hunt';
}

/**
 * Produce a bounded, deterministic offline progression plan.
 *
 * Excess historical backlog is deliberately discarded: every scheduler run may
 * apply at most maxActionsPerRun, then the cursor advances to `now`. Re-running
 * the same wall-clock window produces the same bucket keys, allowing repository
 * idempotency to reject duplicates safely.
 */
export function planSimulatedAdventurerProgression({ activityProfile, lastSimulatedAt, now = new Date() }) {
  const profile = normalizeSimulatedAdventurerActivityProfile(activityProfile);
  const cadence = SIMULATED_ADVENTURER_SIMULATION_CADENCE[profile.id];
  const nowMs = parseInstant(now, 'now');

  if (lastSimulatedAt == null) {
    return Object.freeze({
      profileId: profile.id,
      initialized: true,
      cursorAt: new Date(nowMs).toISOString(),
      actions: Object.freeze([]),
      discardedBacklogActions: 0,
    });
  }

  const previousMs = parseInstant(lastSimulatedAt, 'lastSimulatedAt');
  if (nowMs < previousMs) throw simulationError('simulated_adventurer_clock_regressed', 'Simulation time cannot move backwards.');

  const previousBucket = Math.floor(previousMs / cadence.intervalMs);
  const currentBucket = Math.floor(nowMs / cadence.intervalMs);
  const totalDue = Math.max(0, currentBucket - previousBucket);
  const dueCount = Math.min(totalDue, cadence.maxActionsPerRun);
  const firstBucket = currentBucket - dueCount + 1;
  const actions = [];

  for (let bucket = firstBucket; bucket <= currentBucket && dueCount > 0; bucket += 1) {
    const actionType = actionForBucket(bucket);
    actions.push(Object.freeze({
      tickKey: `${profile.id}:${bucket}`,
      bucket,
      scheduledAt: new Date(bucket * cadence.intervalMs).toISOString(),
      actionType,
      experienceAward: ACTION_XP[actionType],
    }));
  }

  return Object.freeze({
    profileId: profile.id,
    initialized: false,
    cursorAt: new Date(nowMs).toISOString(),
    actions: Object.freeze(actions),
    discardedBacklogActions: Math.max(0, totalDue - dueCount),
  });
}

export function publicSimulatedAdventurerSimulationCadence() {
  return Object.entries(SIMULATED_ADVENTURER_SIMULATION_CADENCE).map(([profileId, cadence]) => ({
    profileId,
    intervalHours: cadence.intervalMs / HOUR_MS,
    maxActionsPerRun: cadence.maxActionsPerRun,
  }));
}
