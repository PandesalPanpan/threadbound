# Level progression foundation

Status: **Cumulative XP, mechanical Level growth, and migration reconciliation are implemented and branch-verified. Delivery remains pending merge and green `main` CI.**

Threadbound has one canonical cumulative XP model, a derived Level projection,
migration-safe persistence, and authoritative XP from Hunt, ordinary Adventure,
and Quest claims. A centralized growth policy makes Level mechanically
meaningful without erasing damage already taken.

## Canonical rule

- Level 1 begins at 0 XP.
- Level 2 begins at 50 XP.
- Each following level costs 50 XP more than the previous level: Level 3
  begins at 150 cumulative XP, Level 4 at 300, and so on.
- `src/domain/LevelProgressionPolicy.js` is the single source for thresholds
  and progress projection.
- Level is derived from cumulative XP rather than stored independently.

## Level-derived health

`src/domain/CharacterGrowthPolicy.js` grants +3 base Max HP per gained Level.
Gaining one or multiple Levels increases current HP by the same total amount as
Max HP. For example, 24/40 HP becomes 30/46 HP after two Levels: the previous
16-point damage deficit is preserved rather than fully healed.

Equipment Max HP bonuses remain additive at the equipment projection boundary.
They do not inflate the persisted base Max HP or get mistaken for permanent
level growth.

## Persistence and compatibility

`SQLitePlayerProgressionRepository` owns the additive `player_progression`
table: one row per player, cumulative non-negative XP, and no stored Level.
Existing players without a progression row still read as 0 XP / Level 1.

The repository adds `players.growth_level_applied` as a reconciliation marker.
When it encounters XP from before this growth policy, it raises persisted base
Max HP by the missing per-Level amount once, but leaves current HP unchanged.
Repeated repository construction does not reapply growth. Current and maximum
HP updates for new XP gains share the XP transaction.

## Authoritative XP sources and receipts

Area-authored Hunt enemy definitions and ordinary Adventure rewards supply XP.
Only a successful authoritative Hunt grants its reward. Adventure XP and
reward metadata are committed with the resolved run. Quest claims award the
Quest's snapshotted Gold and XP atomically with the claimed lifecycle state.

`GameService.dashboard()` exposes cumulative XP, derived Level, and the
level-progress read model. Hunt, Adventure, and Quest receipts show the
authoritative XP/Gold changes and, when applicable, the Level transition and
Max HP gain. Browser code does not calculate Level or health growth.

## Verification contract

Automated coverage proves:

- old players without a progression row read safely;
- old accumulated XP receives one-time Max HP reconciliation without healing;
- multiple-level XP grants preserve the prior HP deficit;
- equipment Max HP bonuses compose with level-derived base Max HP;
- Hunt and ordinary Adventure grant their Area-authored XP on success;
- a Quest claim commits XP and Gold together and cannot claim twice;
- receipts and dashboard read models expose committed progression facts.

Focused coverage lives in `test/character-growth-policy.test.js`,
`test/progression-health-persistence.test.js`,
`test/hunt-automatic-battle.test.js`, `test/ordinary-adventure.test.js`,
`test/quest-rewards.test.js`, and the receipt suites.

## Handoff

The current milestone combines XP growth with five-slot stat-bearing
Equipment, Area-specific rewards, and chat-first result receipts. Mark the
relevant master-plan acceptance complete only after the work is documented,
verified, merged, and `main` CI is green.
