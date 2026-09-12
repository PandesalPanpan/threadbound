# Automatic battle engine foundation

Status: M3-07 concise receipt and detailed battle-turn read model layered onto the shared M3-01 lifecycle through M3-06 combat/equipment semantics.

## Boundary

`src/domain/AutomaticBattleSimulator.js` owns the generic automatic battle lifecycle. `src/domain/AutomaticBattleActionPolicy.js` owns canonical basic-attack Attack/Defense/Crit semantics. `src/domain/AutomaticBattleInitiativePolicy.js` owns Speed scheduling. `src/domain/AutomaticBattleEffectPolicy.js` owns the constrained Fire/Poison/Ice/Psychic vocabulary and stat/tick semantics. `src/domain/AutomaticBattleResistancePolicy.js` owns resistance handling. `src/domain/EquipmentBattleEffectPolicy.js` owns constrained equipment mechanics.

`src/application/AutomaticBattleReadModel.js` is the M3-07 presentation/read-model boundary. It consumes an already-authoritative simulator result and projects two shapes without rerunning combat formulas:

- a compact main receipt suitable for one Adventure Stream entry;
- a detailed turn projection suitable for the later Battle Details UI.

Application services remain responsible for use-case coordination, persistence, activity rewards, receipts/publication, and committed state. Browser code remains presentation only.

## Concise automatic-battle receipt

`projectAutomaticBattleResult(result, { viewerId })` produces a viewer-relative receipt with:

- Victory / Defeat / Draw / Paused result;
- opponent/result headline;
- viewer HP before -> after when a viewer is supplied;
- total turn count;
- winner/loser IDs and compact HP projections;
- `detailsAvailable` rather than embedding turn-by-turn narration in the stream message.

The generic battle receipt intentionally does not invent XP, Gold, loot, quest progress, cooldowns, or death penalties. Those belong to Hunt/Adventure/Duel application services when those activities migrate to the shared engine.

## Detailed turn read model

The detailed projection retains inspectable authoritative facts already emitted by the simulator:

- actor and target identity;
- damage, healing, and HP transitions;
- critical hits;
- periodic Fire/Poison damage and effect expiration;
- resistance-aware effect application/blocking;
- consecutive actions surfaced as Speed extra actions;
- effect-only defeats where an actor dies before targeting an opponent.

Each turn also gets one concise summary string for future presentation. The projector never recalculates damage, Crit chance, Speed scheduling, effect potency, or resistance.

## Constrained equipment effects

Persisted/generated items carry stable `effectCode` values for migration compatibility. Combat does not trust or execute serialized `item.effect` objects. `EQUIPMENT_EFFECT_CATALOG` remains the authoritative allowlist for bounded bonus damage and Fire/Poison/Ice/Psychic application.

Existing `opening_strike` and `boss_bane` item codes remain valid. Elemental equipment codes reuse the shared effect/resistance path, and unknown codes/mechanics fail closed.

## Constrained effect vocabulary

The automatic engine accepts exactly four status/element effect types:

- **Fire** — bounded periodic damage at turn start.
- **Poison** — bounded stacking periodic damage; stacks cap at five.
- **Ice** — reduces effective Speed while active, with a floor of `1`.
- **Psychic** — reduces effective Attack and Defense while active, preserving safe stat floors.

Effects are normalized data only. Unknown fields are discarded and unknown types are rejected.

## Resistance contract

Combatants may declare normal, resistant, high-resistant, or immune handling per allowlisted effect type. Incoming equipment-applied effects use exactly the same resistance path as any other automatic battle effect. Turn metadata feeds the M3-07 read model directly.

## Speed initiative policy

Speed controls both initiative and action frequency using the deterministic virtual timeline. Effective Speed remains capped at **2x the slowest combatant's Speed** for action-frequency purposes, preventing extreme/generated stats from creating runaway action chains. The read model exposes consecutive same-actor actions for later Battle Details presentation.

## Compatibility and migration

No shipped player loop is switched to the new simulator in M3-07. Existing Hunt, simple dungeon, and legacy tactical-run behavior remain untouched so migration stays strangler-style and green. M4-01 remains the ordered Hunt migration point after Phase 3 semantics are complete.

M3-07 therefore establishes the shared receipt/detail projection before M3-08 adds the actual Battle Details modal/expansion. This prevents UI code from interpreting raw simulator metadata or recreating combat semantics.

## Objective acceptance

`test/automatic-battle-read-model.test.js` proves:

1. a normal automatic battle becomes one concise viewer-relative receipt rather than turn spam;
2. HP before/after and turn counts are projected from authoritative simulator output;
3. detailed turns expose critical hits and consecutive Speed actions;
4. Fire/Poison tick/expiration metadata and resistance application/blocking remain inspectable;
5. effect-only defeat turns remain representable without inventing a target action;
6. malformed/incomplete result shapes fail closed;
7. the projector composes with the real shared simulator rather than a separate combat path.

Existing simulator/action/initiative/effect/resistance/equipment tests plus the full browser E2E suite remain regression gates. No mobile screenshot-specific gate is required for M3-07 because the milestone adds an application read model only; M3-08 is the ordered player-facing UI milestone.

## Next ordered task

After M3-07 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M3-08 — add Battle Details modal/expansion without flooding the stream**.
