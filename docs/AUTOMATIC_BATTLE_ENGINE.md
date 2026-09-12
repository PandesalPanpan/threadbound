# Automatic battle engine foundation

Status: M3-08 Battle Details presentation layered onto the shared M3-01 lifecycle through M3-07 read-model semantics.

## Boundary

`src/domain/AutomaticBattleSimulator.js` owns the generic automatic battle lifecycle. `src/domain/AutomaticBattleActionPolicy.js` owns canonical basic-attack Attack/Defense/Crit semantics. `src/domain/AutomaticBattleInitiativePolicy.js` owns Speed scheduling. `src/domain/AutomaticBattleEffectPolicy.js` owns the constrained Fire/Poison/Ice/Psychic vocabulary and stat/tick semantics. `src/domain/AutomaticBattleResistancePolicy.js` owns resistance handling. `src/domain/EquipmentBattleEffectPolicy.js` owns constrained equipment mechanics.

`src/application/AutomaticBattleReadModel.js` consumes an already-authoritative simulator result and projects a compact receipt plus detailed turn data without rerunning combat formulas.

`public/battle-details.js` is the M3-08 Presentation Model boundary. It consumes only that M3-07 projection and attaches an accessible `Battle details` control/dialog to an Adventure Stream receipt. It formats projected facts but never decides damage, Crits, Speed frequency, effects, resistance, rewards, or persistence.

Application services remain responsible for use-case coordination, persistence, activity rewards, receipts/publication, and committed state. Browser code remains presentation only.

## Concise automatic-battle receipt

`projectAutomaticBattleResult(result, { viewerId })` produces a viewer-relative receipt with Victory/Defeat/Draw/Paused result, opponent/result headline, viewer HP before -> after, total turn count, compact HP projections, and `detailsAvailable` rather than embedding turn narration in the stream.

The generic battle receipt intentionally does not invent XP, Gold, loot, quest progress, cooldowns, or death penalties. Those belong to Hunt/Adventure/Duel application services when those activities migrate to the shared engine.

## Battle Details presentation

`attachBattleDetails(host, projection)` keeps turn history out of the main stream and exposes it on demand in a modal nested with the receipt presentation. The modal includes:

- turn number and projected turn summary;
- critical-hit markers;
- Speed extra-action markers;
- Fire/Poison damage and effect expiration;
- constrained effect application and resistance/immunity outcomes;
- mobile-safe scrolling and 44px open/close touch targets;
- Escape, backdrop, and explicit close behavior with focus returned to the trigger.

The component builds DOM with `textContent` and consumes only projected read-model data. It does not interpret raw simulator objects or execute generated content.

## Detailed turn read model

The detailed projection retains authoritative actor/target identity, damage/healing/HP transitions, critical hits, Fire/Poison ticks and expiration, resistance-aware effect application/blocking, consecutive Speed actions, and effect-only defeats. Each turn has a concise summary string for presentation.

## Constrained equipment effects

Persisted/generated items carry stable `effectCode` values for migration compatibility. Combat does not trust or execute serialized `item.effect` objects. `EQUIPMENT_EFFECT_CATALOG` remains the authoritative allowlist for bounded bonus damage and Fire/Poison/Ice/Psychic application.

## Constrained effect vocabulary

The automatic engine accepts exactly four status/element effect types:

- **Fire** — bounded periodic damage at turn start.
- **Poison** — bounded stacking periodic damage; stacks cap at five.
- **Ice** — reduces effective Speed while active, with a floor of `1`.
- **Psychic** — reduces effective Attack and Defense while active, preserving safe stat floors.

Effects are normalized data only. Unknown fields are discarded and unknown types are rejected.

## Resistance contract

Combatants may declare normal, resistant, high-resistant, or immune handling per allowlisted effect type. Incoming equipment-applied effects use the same resistance path as other automatic battle effects. Turn metadata feeds the read model directly.

## Speed initiative policy

Speed controls initiative and action frequency using the deterministic virtual timeline. Effective Speed remains capped at **2x the slowest combatant's Speed** for action-frequency purposes. The read model exposes consecutive same-actor actions for Battle Details.

## Compatibility and migration

M3-08 does not switch the shipped Hunt/simple-dungeon path to the automatic simulator early. The Battle Details component is a reusable presentation primitive ready for M4-01 and later Adventure/Duel integrations. Existing tactical compatibility paths remain untouched and are not restored as the default.

## Objective acceptance

`test/automatic-battle-read-model.test.js` continues to prove authoritative projection semantics. `test/e2e/battle-details.local.spec.js` additionally proves:

1. the concise receipt remains the only timeline message while turn history stays hidden until requested;
2. the modal renders projected Crit, Speed, effect, and resistance facts without browser-side combat calculation;
3. the open and close controls meet the 44px mobile target requirement;
4. the 390x844 presentation does not overflow horizontally;
5. the modal closes cleanly and restores the trigger state;
6. a representative mobile screenshot is emitted to `ux-review/battle-details-mobile.png` for visual inspection.

Full unit/contract and active Chromium E2E suites remain merge gates.

## Next ordered task

After M3-08 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M3-09 — keep major progression bosses capable of sparse player/party decision points without a permanent tactical dashboard**.
