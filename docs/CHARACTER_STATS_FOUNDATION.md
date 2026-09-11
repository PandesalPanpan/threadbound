# Character stats foundation

Status: **M1-05 in progress; do not check it complete yet.**

This increment establishes one authoritative Domain Policy for the readable character-stat vocabulary without changing the shipped combat loop or inventing browser-owned rules.

## Canonical stat contract

`CharacterStatPolicy` owns these derived values:

- Attack
- Defense
- Max HP
- Speed
- Crit Chance

The current migration-safe baseline is Attack 6, Defense 2, Max HP 40, Speed 10, and Crit Chance 5% before equipment bonuses.

Existing equipment currently persists `attackBonus`; to preserve shipped behavior, only the equipped Weapon's legacy `attackBonus` contributes to Attack. The policy already has explicit constrained inputs for future `defenseBonus`, `maxHpBonus`/`maxHealthBonus`, `speedBonus`, and `critChanceBonus` fields, so later equipment-template work can extend persistence without moving rules into SQLite or the browser.

`Character.attackPower` now delegates to this policy. Existing Hunt/dungeon callers therefore keep their current Attack semantics while sharing the new canonical derivation boundary.

## Why M1-05 remains unchecked

The Domain Policy and compatibility path are established and tested, but the dashboard/Profile read model does not yet project all five stats. The next M1-05 slice must pass the canonical five-slot loadout into the Character/read-model derivation, expose all five stats from the Service Layer, and add browser acceptance for their readable projection. Do not duplicate these formulas in presentation code.

## Verification

`test/character-stats.test.js` covers baseline values, five-slot bonus derivation, existing Weapon Attack compatibility, malformed numeric inputs, lower bounds, and Crit Chance clamping.

## Handoff

Continue **M1-05**. Wire the policy into the Service Layer/dashboard projection and the smallest chat-first/mobile presentation that makes the five values readable. Preserve `attackPower` and `maxHealth` compatibility aliases until their callers migrate. M1-06 rarity work remains blocked on completion of M1-05.
