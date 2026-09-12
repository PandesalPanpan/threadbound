# Automatic battle engine foundation

Status: M3-06 generated/special equipment effects layered onto the shared M3-01 lifecycle, M3-02 stat semantics, M3-03 Speed policy, M3-04 constrained effect vocabulary, and M3-05 resistance handling.

## Boundary

`src/domain/AutomaticBattleSimulator.js` owns the generic automatic battle lifecycle. `src/domain/AutomaticBattleActionPolicy.js` owns canonical basic-attack Attack/Defense/Crit semantics. `src/domain/AutomaticBattleInitiativePolicy.js` owns Speed scheduling. `src/domain/AutomaticBattleEffectPolicy.js` owns the constrained Fire/Poison/Ice/Psychic vocabulary and stat/tick semantics. `src/domain/AutomaticBattleResistancePolicy.js` owns resistance handling.

`src/domain/EquipmentBattleEffectPolicy.js` now owns the M3-06 equipment-mechanic boundary. Equipment mechanics are plain validated data selected from one authoritative allowlisted catalog. Application services remain responsible for use-case coordination, persistence, rewards, receipts, and publication after a committed result. The browser/activity stream remains a projection and never runs combat rules.

## Constrained equipment effects

Persisted/generated items continue to carry their stable `effectCode` for migration compatibility. Combat does **not** trust or execute the serialized `item.effect` object. The authoritative policy resolves `effectCode` against `EQUIPMENT_EFFECT_CATALOG`, so an item payload cannot inject a callback, script, arbitrary mechanic, or unknown status type.

The current catalog preserves the two legacy-compatible special effects and adds constrained elemental examples:

- `opening_strike` — declarative `bonus-damage` on the actor's first action;
- `boss_bane` — declarative `bonus-damage` against a target tagged as a boss;
- `ember_edge` — on-hit Fire;
- `venom_edge` — on-hit Poison;
- `frost_edge` — on-hit Ice;
- `mind_edge` — on-hit Psychic;
- `none` — no combat mechanic.

Only two mechanic kinds are currently valid: bounded `bonus-damage` and `apply-effect`. Triggers are allowlisted and validated (`first-action`, `target-tag`, `on-hit`). `apply-effect` delegates its payload to `normalizeAutomaticBattleEffect`, so generated equipment cannot bypass the established effect vocabulary, potency/duration caps, Poison stack cap, Speed/stat floors, or resistance/immunity handling.

`createEquipmentAwareAutomaticBasicAttackResolver()` composes the existing canonical basic attack with this equipment policy rather than creating another battle loop. It reads effect codes from the actor's five-slot equipment projection (plus migration-compatible `equippedItem`/explicit effect-code inputs), applies bonus-damage rules, and emits constrained `targetEffects` for the shared simulator to resolve through M3-05 resistance policy.

## Generated-item compatibility

`ItemGenerator` now sources `ITEM_EFFECTS` from the authoritative equipment-effect catalog. The `ITEM_EFFECTS` export remains available because Arc validation/services and persisted compatibility currently depend on it. Generated item `effect` JSON is still serialized with labels/mechanic data for inspection and migration, plus existing Upgrade/attunement fields, but authoritative combat always re-resolves the stable `effectCode` through the catalog.

Existing `opening_strike` and `boss_bane` item codes therefore remain valid. Newly generated rare+ weapons may also receive one of the elemental codes without allowing generated content to invent mechanics. Arc Manifest validation continues to accept only keys that exist in the same allowlist.

## Constrained effect vocabulary

The automatic engine accepts exactly four status/element effect types:

- **Fire** — bounded periodic damage at turn start.
- **Poison** — bounded stacking periodic damage; stacks cap at five.
- **Ice** — reduces effective Speed while active, with a floor of `1`.
- **Psychic** — reduces effective Attack and Defense while active, preserving safe stat floors.

Effects are normalized data only. Unknown fields are discarded and unknown types are rejected.

## Resistance contract

Combatants may declare normal, resistant, high-resistant, or immune handling per allowlisted effect type. Incoming equipment-applied effects use exactly the same resistance path as any other automatic battle effect. Each turn records `effectApplications` metadata for later Battle Details/read-model work.

## Speed initiative policy

Speed controls both initiative and action frequency using the existing deterministic virtual timeline. Effective Speed remains capped at **2x the slowest combatant's Speed** for action-frequency purposes, preventing extreme/generated stats from creating runaway action chains.

## Compatibility and migration

No shipped player loop is switched to the new simulator in M3-06. Existing Hunt, simple dungeon, and legacy tactical-run behavior remain untouched so migration stays strangler-style and green. M4-01 remains the ordered Hunt migration point after Phase 3 semantics are complete.

Legacy tactical `DungeonRun` still contains its old compatibility handling for `opening_strike`/`boss_bane`; M3-06 does not deepen or make that tactical path the default. New automatic-combat integration uses the shared equipment policy.

## Objective acceptance

`test/equipment-battle-effect-policy.test.js` proves:

1. the equipment effect catalog is explicit constrained data;
2. elemental equipment effects reuse only Fire/Poison/Ice/Psychic;
3. arbitrary mechanic kinds and executable-looking effect types are rejected;
4. existing opening-strike and boss-bane behavior can be resolved from declarative catalog data;
5. serialized item payloads cannot inject mechanics because combat trusts `effectCode`, not `item.effect`;
6. unknown persisted/generated effect codes fail closed;
7. equipment-aware automatic attacks emit target effects into the shared simulator and receive the existing resistance handling.

Existing simulator, action, initiative, effect, resistance, unit/contract, and browser E2E suites remain regression gates. No new Playwright/UI-specific coverage or mobile screenshot is required because M3-06 changes no currently shipped player-facing presentation.

## Next ordered task

After M3-06 is merged, documented, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M3-07 — add concise main receipt + detailed battle-turn read model**.
