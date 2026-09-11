# Level progression foundation

Status: **M1-03 in progress; do not check it complete yet.**

This increment establishes the canonical domain math for cumulative XP and Level without changing persisted player state yet.

## Canonical rule

- Level 1 begins at 0 XP.
- Level 2 begins at 50 XP.
- Each following level costs 50 XP more than the previous level: level 3 begins at 150 cumulative XP, level 4 at 300, and so on.
- `src/domain/LevelProgressionPolicy.js` is the single source for level thresholds and progress projection.
- Level is derived from cumulative XP rather than stored independently, avoiding two authoritative values that can drift apart.

## Why this is only a foundation slice

M1-03 still requires migration-safe persistence of cumulative XP, authoritative XP awards from Hunt, Profile/dashboard projection, concise Hunt receipt output (`+XP` and level-up), and browser acceptance coverage. Those pieces must use this policy rather than duplicating formulas in services, repositories, or presentation code.

## Compatibility

This slice does not alter existing SQLite columns, Gold migration aliases, equipment compatibility, Honey ownership, or legacy persisted dungeon behavior. It does not introduce a new currency or tactical default.

## Handoff

Next work remains **M1-03**. Add an additive persisted XP field/table for existing players, wire Hunt rewards through the Service Layer, expose the derived Level/XP projection through the current player Profile/dashboard model, update the Adventure Stream Hunt receipt, and add migration + Playwright coverage. Only then mark M1-03 complete.
