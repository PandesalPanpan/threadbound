# Automatic battle engine foundation

Status: M3-05 resistance/high-resistance/immunity handling layered onto the shared M3-01 lifecycle, M3-02 stat semantics, M3-03 Speed policy, and M3-04 constrained effect vocabulary.

## Boundary

`src/domain/AutomaticBattleSimulator.js` is a Domain Model/Policy boundary. It owns the generic automatic battle lifecycle:

- cloned authoritative combatant HP/effect/resistance state for the simulation;
- bounded turn iteration;
- actor and target selection hooks;
- application of resolved damage/healing, periodic effect damage, and resistance-aware incoming effects;
- terminal victory/draw results;
- concise structured turn history for later read-model work;
- optional domain-owned phase stopping so a progression boss can pause at a sparse decision point without creating a tactical dashboard.

`src/domain/AutomaticBattleActionPolicy.js` owns canonical basic-attack Attack/Defense/Crit semantics. `src/domain/AutomaticBattleInitiativePolicy.js` owns Speed scheduling. `src/domain/AutomaticBattleEffectPolicy.js` owns the constrained effect vocabulary and stat/tick semantics. `src/domain/AutomaticBattleResistancePolicy.js` owns the M3-05 resistance contract.

Application services remain responsible for use-case coordination, persistence, rewards, receipts, and publication after a committed result. The browser/activity stream remains a projection and never runs combat rules.

## Constrained effect vocabulary

The automatic engine accepts exactly four effect types:

- **Fire** — bounded periodic damage at the affected combatant's turn start.
- **Poison** — bounded stacking periodic damage pressure; stacks cap at five.
- **Ice** — reduces effective Speed while active, with a floor of `1`.
- **Psychic** — reduces effective Attack and Defense while active, preserving safe stat floors.

Effects are plain validated data: `type`, bounded `potency`, bounded `remainingTurns`, and `stacks` only for Poison. Unknown fields are discarded by normalization and unknown effect types are rejected. Generated content therefore cannot attach callbacks, scripts, or arbitrary mechanics through the combat effect contract.

Potency and duration have explicit safety caps. These caps are engine-integrity bounds rather than final balance tuning; Arc/equipment budget validation follows in later ordered milestones.

Fire/Poison ticks resolve inside `AutomaticBattleSimulator`, so lethal periodic damage can end a battle before another basic attack. Ice is projected by initiative policy before actor scheduling. Psychic is projected by the basic-attack policy before Attack/Defense damage is calculated. Effect duration advances on the affected actor's turns.

## Resistance contract

Combatants may declare resistance per allowlisted effect type only. The supported levels are:

- **normal** — 100% potency;
- **resistant** — 50% potency;
- **high-resistant** — 25% potency;
- **immune** — the incoming effect is blocked completely.

Resistance is deterministic. Non-immune resistance changes effect potency only; duration and Poison stack count retain their already-bounded validated values. Reduced potency floors at `1`, so resistance cannot accidentally become immunity. Unknown effect keys or resistance levels fail validation at the authoritative simulator boundary.

An action may return `targetEffects` containing constrained effect data. `AutomaticBattleSimulator` resolves every incoming effect through `AutomaticBattleResistancePolicy` before merging it into target state. Each turn records compact `effectApplications` metadata with the incoming potency, applied potency, resistance tier, multiplier, and whether immunity blocked the effect. This supplies inspectable facts for the ordered Battle Details/read-model milestones without moving combat rules into presentation code.

This milestone intentionally does not decide which generated equipment emits these effects; generated/special equipment effect definitions and validation belong to M3-06.

## Speed initiative policy

Speed controls both who acts first and how often a combatant acts. The policy uses a deterministic virtual timeline:

1. normalize effective Speed to an integer of at least `1` after active Ice projection;
2. count how many actions each combatant has already taken;
3. calculate `nextActionAt = (actionsTaken + 1) / effectiveSpeed`;
4. the combatant with the smallest `nextActionAt` acts next;
5. exact ties are resolved by stable combatant order.

Effective Speed remains capped at **2x the slowest combatant's Speed** for action-frequency purposes, preventing extreme/generated stats from producing runaway action chains.

## Compatibility and migration

No shipped player loop is switched to the new simulator in M3-05. Existing Hunt, simple dungeon, and legacy tactical-run behavior remain untouched so migration stays strangler-style and green. M4-01 remains the ordered Hunt migration point after Phase 3 semantics are complete.

Combatants without resistances behave exactly as before. Existing combatants without effects or Speed still normalize safely. The simulator remains activity-agnostic and reusable by Hunt, Adventure, Duel, and suitable boss phases.

## Objective acceptance

`test/automatic-battle-resistance-policy.test.js` proves:

1. the resistance vocabulary is constrained to normal/resistant/high-resistant/immune;
2. unknown effect keys and unsupported resistance mechanics are rejected;
3. normal effects retain full validated potency;
4. resistance and high resistance deterministically reduce potency to 50% and 25% with a minimum of one;
5. immunity blocks an incoming effect entirely;
6. the shared simulator applies `targetEffects` through resistance handling and records inspectable application metadata;
7. reduced Fire potency becomes the actual authoritative periodic damage on the affected target's later turn;
8. invalid resistance data fails at the authoritative simulator boundary.

Existing simulator, effect, action-policy, initiative-policy, unit/contract, and browser E2E suites remain regression gates. No new Playwright/UI-specific coverage or mobile screenshot is required because M3-05 changes no currently shipped player-facing presentation.

## Next ordered task

After M3-05 is merged, documented, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M3-06 — implement generated/special equipment effects through constrained validated effect data**.
