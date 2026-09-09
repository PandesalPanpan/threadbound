import { AdventureRun } from '../domain/AdventureRun.js';

export const DEFAULT_RUN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Run lifecycle time must be a valid date.');
  return date;
}

export class RunLifecycleService {
  constructor({ repository, eventBus, expiryMs = DEFAULT_RUN_EXPIRY_MS, now = () => new Date() }) {
    if (!repository) throw new Error('RunLifecycleService requires a game repository.');
    if (!Number.isFinite(expiryMs) || expiryMs <= 0) throw new Error('Run expiry must be a positive duration.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.expiryMs = expiryMs;
    this.now = now;
  }

  abandonRun(playerId, runId, { now = this.now() } = {}) {
    const state = this.repository.getRun(runId);
    if (!state) throw new Error('Run not found.');
    const run = new AdventureRun(state);
    if (!run.hasParticipant(playerId)) throw new Error('Run not found.');
    const endedAt = asDate(now).toISOString();
    const outcome = run.abandon({ playerId, now: endedAt });
    outcome.state = this.repository.saveRun(outcome.state);
    this.eventBus?.publishAll(outcome.events);
    return outcome.state;
  }

  expireStaleRuns({ now = this.now(), limit = 100 } = {}) {
    const reference = asDate(now);
    const cutoff = new Date(reference.getTime() - this.expiryMs).toISOString();
    const stale = this.repository.listInactiveRuns(cutoff, { limit });
    const expiredRunIds = [];

    for (const state of stale) {
      const run = new AdventureRun(state);
      if (!run.isActive) continue;
      const outcome = run.expire({ now: reference.toISOString() });
      try {
        outcome.state = this.repository.saveRun(outcome.state);
      } catch (error) {
        // Another instance may have resumed or terminated the run after the stale list was
        // read. Optimistic locking wins; a lifecycle sweep must never overwrite fresher play.
        if (error?.code === 'stale_run_version') continue;
        throw error;
      }
      expiredRunIds.push(outcome.state.id);
      this.eventBus?.publishAll(outcome.events);
    }

    return { count: expiredRunIds.length, runIds: expiredRunIds, cutoff };
  }
}
