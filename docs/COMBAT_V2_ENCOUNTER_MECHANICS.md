# Combat V2 encounter mechanics

## Goal

Combat should make reading the shared thread and coordinating with another Weaver materially better than repeatedly pressing Attack. Bosses therefore need mechanics that change the decision, not only larger HP and damage numbers.

This slice adds a deterministic boss phase transition and a co-op protection telegraph while preserving Threadbound's existing server-authoritative command/result loop.

## Player-facing rules

- A boss begins in **Phase I — Stitching**.
- At or below 50% HP it enters **Phase II — Unraveling** exactly once.
- Phase II telegraphs after two committed combat actions instead of three and uses a shorter 2.2 second presentation window.
- The first Phase II telegraph is **Threadmark Lunge**.
- Threadmark deterministically marks the living Weaver with the lowest HP ratio.
- If the party ignores Threadmark, the marked Weaver takes the full targeted hit.
- Any living teammate can answer with Guard. That Guard intercepts the marked hit, applies normal Guard mitigation to the protector, and leaves the marked Weaver untouched.
- The single public combat receipt says who was protected and how much damage was prevented.

The UI renames the contextual Guard action to **Protect <Weaver>** during Threadmark and shows Phase II / Unraveling beside the existing Focus and skill state.

## Architecture

### Domain Model / aggregate consistency boundary

`DungeonRun` remains the authoritative Domain Model for an active run. Boss phase, intent cycle, marked target, participant HP, Guard mitigation, threat, Focus, and run version all change together inside this aggregate.

That is important for the protection rule: selecting a marked player and applying interception cannot be split across browser state or separate writes without allowing stale or contradictory results.

### Deterministic combat policy

`CombatIntentPolicy` contains the stable intent vocabulary and deterministic selection policy:

- normal and boss intent cycles;
- phase-specific cadence metadata;
- most-vulnerable target selection;
- intent damage/heal calculation.

It receives current aggregate state and returns intent data. It does not persist data, broadcast realtime messages, or mutate repositories.

### Service Layer

`GameService` remains the Service Layer. It loads the run, invokes one domain command, persists the resulting version, publishes the fine-grained domain events, and then publishes one `CombatActionResolved` result containing the user-facing summary metadata.

No boss rule is implemented in HTTP handlers or presentation code.

### Optimistic Offline Lock

SQLite run versioning remains the Optimistic Offline Lock. Protection uses the same save path as Attack, Guard, skills, Mend, and Revive, so two stale actions cannot both commit against the same Threadmark window.

### Projection, not Event Sourcing

`ActivityStreamService` is a projection/read surface. Fine-grained events such as `BossPhaseChanged` and `PlayerProtected` are useful to achievements, history, and realtime refreshes, but they do not each become a public chat message.

One explicit player command still becomes one durable `CombatActionResolved` receipt. The stream is not the source of truth and the application is not using Event Sourcing.

### Realtime is notification only

WebSocket/SSE messages announce committed state changes. They never decide the marked target, resolve Guard, or calculate damage. A reconnecting client reconstructs the current Phase II/Threadmark state from the persisted dashboard.

## Acceptance contract

The slice is accepted only when all of the following remain true:

1. Domain tests prove Phase II begins at half HP, Threadmark chooses the most vulnerable living Weaver, protection preserves the marked Weaver's HP, and blind Attack applies the full targeted hit.
2. Projection tests prove `BossPhaseChanged`, `EnemyIntentTelegraphed`, and `PlayerProtected` do not create extra public messages; the single resolved receipt carries Phase II, marked target, and protection explanation.
3. A two-browser local Playwright journey reaches Phase II through public application routes, observes `Protect Local Weaver B` in Weaver A's live thread, taps it, verifies Weaver B loses no HP, and verifies the rich receipt says Weaver B was protected.
4. Existing Threaded, local-auth/realtime, fresh skills-local, Arc Workshop, unit, contract, reconnect, and mobile acceptance suites remain green.
