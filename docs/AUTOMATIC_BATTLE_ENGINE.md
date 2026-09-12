# Automatic battle engine foundation

Status: M3-02 canonical stat semantics layered onto the shared M3-01 automatic battle lifecycle.

## Boundary

`src/domain/AutomaticBattleSimulator.js` is a Domain Model/Policy boundary. It owns the generic automatic battle lifecycle:

- cloned authoritative combatant HP state for the simulation;
- bounded turn iteration;
- actor and target selection hooks;
- application of resolved damage/healing to battle state;
- terminal victory/draw results;
- concise structured turn history for later read-model work;
- optional domain-owned phase stopping so a progression boss can pause at a sparse decision point without creating a tactical dashboard.

`src/domain/AutomaticBattleActionPolicy.js` now owns the canonical M3-02 basic-attack stat semantics used by that lifecycle:

- `Attack` and `Defense` resolve through `max(1, Attack - Defense)` so ordinary auto-battles cannot deadlock on equal/high Defense;
- `Crit Chance` is normalized to a probability in `[0, 1]`;
- a critical basic attack uses a canonical 2x damage multiplier while still guaranteeing it exceeds the non-critical result;
- RNG is injected into the action policy, never read from browser state, so tests and later seeded simulations can be deterministic;
- HP mutation and clamping remain owned by `AutomaticBattleSimulator`, keeping action formulas separate from lifecycle state mutation.

Application services remain responsible for use-case coordination, persistence, rewards, receipts, and publication after a committed result. The browser/activity stream remains a projection and never runs the simulator.

## Policy seams

Phase 3 remains incremental:

- `resolveAction` now has the canonical M3-02 Attack/Defense/Crit policy;
- `selectActor` remains the seam for M3-03 Speed initiative/action-frequency policy;
- `shouldStop` remains the sparse boss-decision seam;
- later effect/resistance policies can decorate action resolution without copying the battle loop.

This keeps one battle lifecycle reusable rather than allowing Hunt, Adventure, Duel, and bosses to each invent their own combat state machine.

## Compatibility and migration

No shipped player loop is switched to the new simulator in M3-02. Existing `HuntEncounter`, simple dungeon, and legacy tactical-run behavior remain untouched so migration stays strangler-style and green. M4-01 is the ordered milestone that rebuilds Hunt on the shared engine after Phase 3 combat semantics exist.

The simulator is activity-agnostic. Its `context` is opaque metadata supplied by the caller, so the same domain loop can be used for Hunt, Adventure, Duel, and suitable boss phases without importing application-service or presentation concerns.

## Objective acceptance

`test/automatic-battle-simulator.test.js` continues to prove the shared lifecycle. `test/automatic-battle-action-policy.test.js` additionally proves:

1. canonical Attack minus Defense damage with a one-damage floor;
2. deterministic critical-hit decisions through injected RNG;
3. bounded Crit Chance semantics;
4. invalid RNG output fails closed instead of corrupting authoritative results;
5. the canonical action policy composes with the shared simulator while HP mutation remains simulator-owned.

No Playwright/UI change is required for M3-02 because this milestone changes no player-facing presentation. Full existing E2E remains the regression gate before merge.

## Next ordered task

After M3-02 is merged and green on `main`, the next earliest unchecked milestone is **M3-03 — implement Speed initiative/action-frequency policy including bounded extra actions** using the simulator's actor-selection seam.
