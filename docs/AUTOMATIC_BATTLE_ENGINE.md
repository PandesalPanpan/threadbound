# Automatic battle engine foundation

Status: M3-03 Speed initiative/action-frequency policy layered onto the shared M3-01 lifecycle and M3-02 canonical stat semantics.

## Boundary

`src/domain/AutomaticBattleSimulator.js` is a Domain Model/Policy boundary. It owns the generic automatic battle lifecycle:

- cloned authoritative combatant HP state for the simulation;
- bounded turn iteration;
- actor and target selection hooks;
- application of resolved damage/healing to battle state;
- terminal victory/draw results;
- concise structured turn history for later read-model work;
- optional domain-owned phase stopping so a progression boss can pause at a sparse decision point without creating a tactical dashboard.

`src/domain/AutomaticBattleActionPolicy.js` owns the canonical M3-02 basic-attack stat semantics used by that lifecycle:

- `Attack` and `Defense` resolve through `max(1, Attack - Defense)` so ordinary auto-battles cannot deadlock on equal/high Defense;
- `Crit Chance` is normalized to a probability in `[0, 1]`;
- a critical basic attack uses a canonical 2x damage multiplier while still guaranteeing it exceeds the non-critical result;
- RNG is injected into the action policy, never read from browser state, so tests and later seeded simulations can be deterministic;
- HP mutation and clamping remain owned by `AutomaticBattleSimulator`, keeping action formulas separate from lifecycle state mutation.

`src/domain/AutomaticBattleInitiativePolicy.js` owns M3-03 Speed semantics. The simulator now uses it as the default actor selector while still allowing an explicit injected selector for focused tests or later special encounters.

Application services remain responsible for use-case coordination, persistence, rewards, receipts, and publication after a committed result. The browser/activity stream remains a projection and never runs the simulator.

## Speed initiative policy

Speed controls both who acts first and how often a combatant acts.

The policy uses a deterministic virtual timeline:

1. normalize each Speed to an integer of at least `1`;
2. count how many actions each combatant has already taken;
3. calculate `nextActionAt = (actionsTaken + 1) / effectiveSpeed`;
4. the combatant with the smallest `nextActionAt` acts next;
5. exact ties are resolved by stable combatant order so equal-Speed fights remain deterministic.

A sufficiently faster combatant therefore receives extra actions naturally rather than through a separate random proc.

To keep generated/extreme stats bounded, effective Speed is capped at **2x the slowest combatant's Speed** for action-frequency purposes. That means an actor can gain at most a two-actions-to-one frequency advantage from Speed alone. The raw character Speed stat is not rewritten; only the initiative projection applies this cap.

`speedInitiativeState()` exposes normalized Speed, effective Speed, action counts, and the next virtual action time. This keeps the formula centralized and gives the later Battle Details read model an inspectable source instead of recreating initiative math in presentation code.

## Policy seams

Phase 3 remains incremental:

- `resolveAction` has the canonical M3-02 Attack/Defense/Crit policy;
- `selectActor` now defaults to the canonical M3-03 Speed initiative/action-frequency policy;
- `shouldStop` remains the sparse boss-decision seam;
- later effect/resistance policies can decorate action resolution without copying the battle loop.

This keeps one battle lifecycle reusable rather than allowing Hunt, Adventure, Duel, and bosses to each invent their own combat state machine.

## Compatibility and migration

No shipped player loop is switched to the new simulator in M3-03. Existing `HuntEncounter`, simple dungeon, and legacy tactical-run behavior remain untouched so migration stays strangler-style and green. M4-01 is the ordered milestone that rebuilds Hunt on the shared engine after Phase 3 combat semantics exist.

Combatants without a Speed value normalize to `1`, so pre-M3-03 simulator callers preserve deterministic alternating behavior. Existing callers can still inject `selectActor` explicitly where a focused test or later encounter needs a special schedule.

The simulator is activity-agnostic. Its `context` is opaque metadata supplied by the caller, so the same domain loop can be used for Hunt, Adventure, Duel, and suitable boss phases without importing application-service or presentation concerns.

## Objective acceptance

`test/automatic-battle-simulator.test.js` continues to prove the shared lifecycle. `test/automatic-battle-action-policy.test.js` proves M3-02 stat semantics. `test/automatic-battle-initiative-policy.test.js` proves M3-03 by covering:

1. deterministic equal-Speed alternation;
2. extra actions from a sufficient Speed advantage;
3. the 2x frequency cap for extreme Speed values;
4. occasional extra actions from moderate Speed advantages;
5. safe Speed normalization;
6. default simulator integration while preserving custom selector injection.

No Playwright/UI change is required for M3-03 because this milestone changes no currently shipped player-facing presentation. Full existing E2E remains the regression gate before merge.

## Next ordered task

After M3-03 is merged and green on `main`, the next earliest unchecked milestone is **M3-04 — implement the constrained Fire, Poison, Ice, and Psychic effect vocabulary** without allowing generated content to inject executable mechanics.
