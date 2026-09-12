# Automatic battle engine foundation

Status: M3-09 sparse progression-boss decision capability layered onto the shared M3-01 lifecycle through M3-08 read-model/presentation semantics.

## Boundary

`src/domain/AutomaticBattleSimulator.js` owns the generic automatic battle lifecycle. `src/domain/AutomaticBattleActionPolicy.js` owns canonical basic-attack Attack/Defense/Crit semantics. `src/domain/AutomaticBattleInitiativePolicy.js` owns Speed scheduling. `src/domain/AutomaticBattleEffectPolicy.js` owns the constrained Fire/Poison/Ice/Psychic vocabulary and stat/tick semantics. `src/domain/AutomaticBattleResistancePolicy.js` owns resistance handling. `src/domain/EquipmentBattleEffectPolicy.js` owns constrained equipment mechanics. `src/domain/AutomaticBattleDecisionPolicy.js` owns the bounded declarative decision vocabulary for sparse progression-boss pauses.

`src/application/AutomaticBattleReadModel.js` consumes an already-authoritative simulator result and projects a compact receipt, detailed turn data, and any pending sparse decision without rerunning combat formulas.

`public/battle-details.js` remains the Presentation Model boundary for on-demand turn history. M3-09 does not create a new tactical screen or make browser state authoritative.

Application services remain responsible for use-case coordination, persistence, activity rewards, receipts/publication, applying a chosen boss response, and committed state. Browser code remains presentation only.

## Concise automatic-battle receipt

`projectAutomaticBattleResult(result, { viewerId })` produces a viewer-relative receipt with Victory/Defeat/Draw/Paused result, opponent/result headline, viewer HP before -> after, total turn count, compact HP projections, and `detailsAvailable` rather than embedding turn narration in the stream.

When a major boss phase pauses, the same projection may include one `pendingDecision` containing a short prompt, `player` or `party` scope, and a small constrained action set. This is a projection of authoritative domain output, not browser-owned combat logic.

The generic battle receipt intentionally does not invent XP, Gold, loot, quest progress, cooldowns, or death penalties. Those belong to Hunt/Adventure/Duel application services when those activities migrate to the shared engine.

## Sparse progression-boss decisions

`createSparseBossDecisionPolicy(...)` is the M3-09 Domain Policy seam for the slightly-interactive boss contract.

The policy deliberately keeps boss interaction sparse and data-driven:

- at most **3** decision points may be configured for one automatic boss battle;
- each decision exposes at most **3** actions;
- actions are restricted to the allowlisted semantic ids `continue`, `heal`, `use-item`, and `coordinate`;
- a decision may trigger after an authoritative turn threshold, at/below a boss HP ratio, or both;
- each decision is explicitly scoped to one `player` or the `party`;
- `context.resolvedDecisionIds` suppresses already-resolved decisions when the application service resumes the battle;
- the policy only pauses and describes the allowed choice. It does **not** implement healing, inventory consumption, party consensus, or persistence ahead of the later progression-boss application milestone.

This means a future progression Adventure can auto-resolve most of a boss fight, emit one obvious chat decision when required, apply the selected response through its Service Layer, and continue the same authoritative battle instead of exposing a permanent Attack/Guard/Interrupt/Focus dashboard.

## Pause and continuation contract

`AutomaticBattleSimulator.simulate(...)` now accepts optional authoritative `priorTurns` alongside the returned combatant state. A paused phase can therefore continue without resetting turn numbers or Speed action-frequency history. Prior turns must be contiguous from turn 1 and the existing `maxTurns` bound remains a total-battle safety cap.

The existing string-valued `shouldStop` hook remains compatible. Structured stop signals add `pendingDecision` while preserving `stopReason` and the existing `paused` outcome.

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

A paused result also projects the same immutable `pendingDecision` in both receipt and details surfaces so later chat presentation does not need to infer a boss mechanic from turn text.

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

M3-09 still does not switch the shipped Hunt/simple-dungeon path to the automatic simulator early and does not create the Phase 5 progression-boss use case ahead of schedule. Existing legacy tactical compatibility paths remain untouched and are not restored as the default.

No browser UI changes are required in M3-09. The existing Adventure Stream/Battle Details presentation remains the regression gate; the future progression-boss service can render a pending decision as one concise stream interaction rather than a persistent tactical dashboard.

## Objective acceptance

The M3-09 tests prove:

1. boss decisions are capped in count and action breadth and reject arbitrary action ids;
2. decision triggers use authoritative turn/HP state and do not affect ordinary Hunt/other activity contexts;
3. resolved decision ids prevent repeated pauses and allow later decision points;
4. structured pauses expose player/party scope, prompt, and constrained actions;
5. a paused battle can resume from authoritative combatant state plus prior turns without resetting turn numbering or Speed scheduling;
6. malformed continuation history fails closed;
7. the read model projects one concise pause prompt and constrained actions without inventing tactical behavior.

`npm run check`, the full unit/contract suite, and the active Chromium E2E suites remain merge gates. No new mobile screenshot is required because this milestone changes no shipped browser presentation.

## Next ordered task

After M3-09 is merged, checklist-reconciled, and green on `main`, Phase 3 is objectively complete. The next earliest unchecked milestone is **M4-01 — rebuild Hunt on the shared automatic battle engine**.
