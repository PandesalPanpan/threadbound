# Simulated Adventurer safety boundary (M8-03)

M8-03 makes the safety rules for simulated adventurers explicit before Guild Hall population, leaderboards, and Duels add more callers. Bots remain useful world actors without becoming a second privileged economy path.

## Domain policy

`src/domain/SimulatedAdventurerSafetyPolicy.js` is the authoritative safety vocabulary.

- Honey mutations always fail closed. Simulated adventurers never mint, receive, spend, or own an authoritative Honey wallet.
- Simulation actions are allowlisted to `tickKey`, `scheduledAt`, `actionType`, and `experienceAward`. Gold, Honey, item grants, target-player ids, or any other extra mutation fields are rejected.
- A bot-owned mutation target must be that same simulated adventurer with `targetKind: simulated`; human targets fail closed.
- Future bot equipment grants must materialize from an **extended validated Arc equipment template** through the same `ArcEquipmentTemplatePolicy` rarity/stat/effect/power-budget rules already used by authored game content. Arbitrary item-shaped data is not an equipment creation path.

## Service/repository enforcement

`SimulatedAdventurerSimulationService` validates the domain plan before handing it to persistence. `SQLiteSimulatedAdventurerRepository.applySimulationBatch` validates the same action contract again before opening its transaction, keeping the persistence boundary safe even if a future application caller bypasses the current service.

The repository transaction can mutate only the simulated-adventurer XP/activity counters, simulation cursor, and bot tick table. It has no SQL path to the human `players`, Bank, item ownership, or Honey integration tables.

This deliberately does **not** add Gold or loot to offline bot simulation. Those systems should only be introduced later when an ordered milestone actually requires them and must pass through this safety boundary rather than widening the scheduler payload casually.

## Verification

`test/simulated-adventurer-safety.test.js` proves:

- Honey operations are explicitly forbidden;
- human mutation targets are rejected;
- Gold/Honey/item/target fields cannot be smuggled into simulation ticks;
- the repository rejects an unsafe batch before changing XP, cursor, or ticks;
- valid future bot equipment can only be materialized through the canonical Arc equipment validator;
- over-budget or legacy/unvalidated item templates are rejected.

There is no player-facing presentation change in M8-03, so a mobile screenshot is not applicable.
