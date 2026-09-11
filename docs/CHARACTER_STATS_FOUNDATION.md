# Character stats foundation

Status: **M1-05 implementation complete on this branch; check it only after merge and green `main` CI.**

Threadbound now has one authoritative Domain Policy and one Service Layer projection for the readable character-stat vocabulary. Presentation reads these values; it does not reproduce gameplay formulas.

## Canonical stat contract

`CharacterStatPolicy` owns these derived values:

- Attack
- Defense
- Max HP
- Speed
- Crit Chance

The current migration-safe baseline is Attack 6, Defense 2, Max HP 40, Speed 10, and Crit Chance 5% before equipment bonuses.

Existing equipment currently persists `attackBonus`; to preserve shipped behavior, only the equipped Weapon's legacy `attackBonus` contributes to Attack. The policy already has explicit constrained inputs for future `defenseBonus`, `maxHpBonus`/`maxHealthBonus`, `speedBonus`, and `critChanceBonus` fields, so later equipment-template work can extend persistence without moving rules into SQLite or the browser.

## Service Layer and compatibility

`GameService` passes the canonical five-slot loadout into `Character`, derives `character.stats` once through the Domain Policy, and projects:

- `attack`
- `defense`
- `maxHp`
- `speed`
- `critChance`
- `critChancePercent`

The complete object is also available as `character.stats`.

Legacy `attackPower` and `maxHealth` remain compatibility aliases of canonical Attack and Max HP. Legacy combat context now also constructs `Character` from the complete loadout, so future persisted slot bonuses can flow through the same policy rather than requiring another combat formula.

## Presentation

The existing player shell displays a compact five-stat strip using the authoritative `/api/dashboard` projection. On mobile the strip wraps to three columns rather than causing horizontal overflow. This is a presentation enhancement inside the existing chat-first shell, not a new dashboard or separate Profile screen.

## Verification

- `test/character-stats.test.js` covers baseline values, five-slot bonus derivation, existing Weapon Attack compatibility, malformed numeric inputs, lower bounds, and Crit Chance clamping.
- `test/equipment-loadout-integration.test.js` proves `GameService` exposes the canonical stats from the loadout and that `attackPower` / `maxHealth` remain aliases.
- `test/e2e/derived-stats.local.spec.js` proves the five values are visible and readable at a 390px mobile viewport and remain consistent with the authoritative API projection.

## Handoff

After this branch merges and post-merge `main` CI is green, mark **M1-05 complete**. The next ordered milestone is **M1-06 — Common through Mythic rarity contract and consistent rich-card styling**. Do not begin M1-06 until the M1-05 merge is green.
