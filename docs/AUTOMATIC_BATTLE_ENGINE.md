# Automatic battle engine foundation

Status: M3-01 implementation foundation. This document describes the shared automatic battle lifecycle added before the later stat/effect milestones.

## Boundary

`src/domain/AutomaticBattleSimulator.js` is a Domain Model/Policy boundary. It owns the generic automatic battle lifecycle:

- cloned authoritative combatant HP state for the simulation;
- bounded turn iteration;
- actor and target selection hooks;
- application of resolved damage/healing to battle state;
- terminal victory/draw results;
- concise structured turn history for later read-model work;
- optional domain-owned phase stopping so a progression boss can pause at a sparse decision point without creating a tactical dashboard.

Application services remain responsible for use-case coordination, persistence, rewards, receipts, and publication after a committed result. The browser/activity stream remains a projection and never runs the simulator.

## Policy seams

M3-01 intentionally does **not** pre-empt later Phase 3 milestones. The simulator accepts domain-policy functions for:

- `resolveAction` — M3-02 will centralize Attack/Defense/HP/Crit semantics and deterministic RNG here;
- `selectActor` — M3-03 will centralize Speed initiative/action-frequency policy here;
- `shouldStop` — future boss phases can use this to stop at a small meaningful decision boundary;
- later effect/resistance policies can decorate action resolution without copying the battle loop.

This keeps one battle lifecycle reusable rather than allowing Hunt, Adventure, Duel, and bosses to each invent their own combat state machine.

## Compatibility and migration

No shipped player loop is switched to the new simulator in M3-01. Existing `HuntEncounter`, simple dungeon, and legacy tactical-run behavior remain untouched so migration stays strangler-style and green. M4-01 is the ordered milestone that rebuilds Hunt on the shared engine after Phase 3 combat semantics exist.

The simulator is activity-agnostic. Its `context` is opaque metadata supplied by the caller, so the same domain loop can be used for Hunt, Adventure, Duel, and suitable boss phases without importing application-service or presentation concerns.

## Objective acceptance

`test/automatic-battle-simulator.test.js` proves:

1. the simulator, not caller/browser state, owns HP mutation and terminal battle state;
2. one contract resolves Hunt, Adventure, Duel, and boss-phase contexts;
3. a boss-compatible phase can pause at a domain-owned decision point;
4. initiative selection is replaceable without moving battle state ownership out of the engine;
5. a max-turn bound prevents invalid/non-progressing policies from looping forever.

No Playwright/UI change is required for M3-01 because this milestone adds no player-facing presentation. Full existing E2E remains a regression gate before merge.

## Next ordered task

After M3-01 is merged and green on `main`, the next earliest unchecked milestone is **M3-02 — implement canonical Attack/Defense/HP/Crit semantics with deterministic/testable RNG injection** using this simulator's action-policy seam.
