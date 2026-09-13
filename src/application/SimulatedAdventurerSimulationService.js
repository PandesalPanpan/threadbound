import { planSimulatedAdventurerProgression } from '../domain/SimulatedAdventurerSimulationPolicy.js';
import { assertSafeSimulatedAdventurerSimulationActions } from '../domain/SimulatedAdventurerSafetyPolicy.js';

export class SimulatedAdventurerSimulationService {
  constructor({ repository }) {
    if (!repository) throw new Error('SimulatedAdventurerSimulationService requires a repository.');
    this.repository = repository;
  }

  simulate({ adventurerId, now = new Date() }) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const state = this.repository.get(adventurerId);
      if (!state) {
        const error = new Error('Simulated adventurer not found.');
        error.code = 'simulated_adventurer_not_found';
        throw error;
      }

      const plan = planSimulatedAdventurerProgression({
        activityProfile: state.adventurer.activityProfile.id,
        lastSimulatedAt: state.lastSimulatedAt,
        now,
      });
      assertSafeSimulatedAdventurerSimulationActions(plan.actions);
      const result = this.repository.applySimulationBatch({
        adventurerId,
        expectedLastSimulatedAt: state.lastSimulatedAt,
        cursorAt: plan.cursorAt,
        actions: plan.actions,
      });

      if (result.status === 'stale') continue;
      return {
        adventurer: result.state.adventurer,
        lastSimulatedAt: result.state.lastSimulatedAt,
        initialized: plan.initialized,
        plannedActions: plan.actions.length,
        appliedActions: result.applied,
        replayedActions: result.replayed,
        discardedBacklogActions: plan.discardedBacklogActions,
        actions: plan.actions,
      };
    }

    const error = new Error('Simulated adventurer progression changed concurrently; retry later.');
    error.code = 'simulated_adventurer_simulation_contention';
    throw error;
  }
}
