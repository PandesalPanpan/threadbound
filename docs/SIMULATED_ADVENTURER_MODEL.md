# Simulated Adventurer model (M8-01)

M8-01 establishes the shared character vocabulary for Threadbound's future persistent simulated adventurers without implementing offline progression yet.

## Authoritative domain boundary

`src/domain/SimulatedAdventurer.js` is a Domain Model. It deliberately reuses existing human-player policies instead of creating a second RPG ruleset:

- cumulative XP and derived Level come from `LevelProgressionPolicy`;
- equipment uses the canonical five slots: Weapon, Helmet, Armor, Boots, Accessory;
- Attack, Defense, Max HP, Speed, and Crit Chance come from `CharacterStatPolicy` over that loadout;
- Area state records current and highest unlocked Area with `current <= highest`;
- Hunt and Adventure counts are non-negative progression facts;
- achievement IDs and Duel record are explicit profile facts;
- leaderboard placement is optional profile/read-model decoration and is not calculated here;
- personality is inert display data, never executable behavior;
- `kind: simulated` / `isSimulated: true` intentionally matches the existing progression-boss human-only gate.

No Honey wallet exists on the model. M8-01 does not add any currency mutation path.

## Activity profile contract

The allowlisted activity identities are intentionally qualitative:

- `casual`
- `steady`
- `dedicated`

They express relative play style only. They do **not** contain an interval, timer, actions-per-day value, cron expression, or scheduler callback. M8-02 owns the exact bounded offline cadence and its retry-safe/idempotent scheduling semantics. This keeps M8-01 from accidentally making simulated adventurers grind continuously.

## Deliberately deferred

M8-01 does not add persistence/repository tables, background jobs, simulation ticks, Guild Hall population, leaderboard ordering, Profile UI, Duel execution, generated bot templates, Honey restrictions beyond not creating a wallet, or bot item/economy mutations. Those belong to the ordered M8-02 through M8-07 milestones.

The model is suitable for strong future rivals because it can represent higher XP/Area progress, richer equipment, achievements, and Duel history while still using the same canonical stat/progression policies as human adventurers.

## Verification

`test/simulated-adventurer-model.test.js` proves:

- the three activity-profile categories are allowlisted and contain no scheduling mechanics;
- canonical XP-to-Level, Area, five-slot equipment, and derived-stat reuse;
- Hunt/Adventure counters, achievements, Duel record, optional leaderboard placement, and personality projection;
- fail-closed validation for invalid Area state, counts, equipment, records, and activity profiles;
- the model is recognized as simulated by the existing human-only progression Adventure gate;
- no local Honey wallet is introduced.

No player-facing presentation changes are part of M8-01, so no mobile screenshot is required. The next ordered milestone after green merge and checklist evidence is **M8-02 — bounded offline/progression simulation with retry-safe/idempotent scheduling semantics**.
