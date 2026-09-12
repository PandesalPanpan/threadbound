# Hunt automatic-battle migration

Status: M4-06 implementation candidate. The shipped `hunt` use case resolves combat through the shared `AutomaticBattleSimulator`, publishes one concise result-first Adventure Stream receipt, is paced by a server-owned short cooldown with capped equipment/buff reductions, and applies the normal carried-Gold death rule on defeat.

## Boundary

`HuntService` remains the Service Layer coordinator. It blocks Hunt during an active dungeon, loads the authoritative player and five-slot equipment loadout, validates that the player can act, projects the effective Hunt duration through `ActivityCooldownPolicy`, atomically claims that duration, asks the Hunt domain policy to resolve one automatic battle, then persists HP/rewards/progression and publishes one `HuntResolved` event.

`HuntEncounter` owns Hunt enemy selection and Hunt-specific reward values. `AutomaticBattleSimulator` owns authoritative HP mutation and turn lifecycle. The shared Attack/Defense/Crit, Speed initiative, constrained equipment effects, and status/resistance policies therefore apply to Hunt rather than a separate combat shortcut.

`HuntCooldownPolicy` owns the canonical base duration (15 seconds) and next-ready projection math. `ActivityCooldownPolicy` owns constrained modifier composition and the global 50% reduction cap. `SQLiteHuntCooldownRepository` owns durable `player_id -> ready_at` persistence and an atomic claim transaction. The browser never decides whether a Hunt is ready or how modifiers stack.

`DeathPenaltyPolicy` owns the normal death rule: lose 20% of carried Gold, rounded down to whole Gold. `HuntService` invokes that policy only after an authoritative defeat at zero HP. `SQLiteBankRepository.loseCarriedGold(...)` atomically mutates the carried balance while reading but never mutating banked Gold. M4-06 does not implement the dangerous-content item-loss fallback; that remains M4-07.

`HuntReceiptReadModel` consumes already-committed `HuntResolved` facts and projects Victory/Defeat, HP, Gold, XP, level-up, rarity-aware loot, potion, optional Quest-result facts, the exact next-Hunt timestamp, and any authoritative carried-Gold death loss without recalculating rules. A death receipt explicitly says the Bank is safe. Failed Hunts discard stale reward-looking fields. `ActivityStreamService` persists its complete text for accessibility and non-enhanced clients.

The richer browser Presentation Model consumes the same persisted event metadata and renders the shared stream. It does not own combat, rewards, loot, death penalties, Quest completion, or cooldown legality.

## Cooldown contract

A successful Hunt claim sets `nextHuntReadyAt` before combat resolution. An immediate duplicate Hunt therefore cannot receive a second combat/reward result. The cooldown record survives repository/service recreation because it is stored in the same authoritative SQLite database as the player.

A blocked Hunt fails with `hunt_cooldown` and a clear message containing both the remaining seconds and exact ISO next-ready timestamp. Successful Hunt API results and `HuntResolved` metadata also carry `cooldown.nextReadyAt` / `nextHuntReadyAt`, so presentation can show readiness without inventing a client timer as authority.

The canonical base Hunt cooldown remains 15 seconds. `ActivityCooldownPolicy` recognizes only allowlisted modifier codes. The generated equipment effect `quick_hunt` reduces Hunt cooldown by 20%. Future fight-count buffs can provide the allowlisted `hunt_haste_minor` (10%) or `hunt_haste_major` (25%) codes through the Service Layer once buff persistence arrives; arbitrary buff codes fail closed. Equipment and buff reductions add together but are capped at 50%, and non-zero activities retain at least a one-second cooldown. A zero-second explicit test override remains zero so existing fixture setup can bypass pacing intentionally.

Persisted/generated item `effect` JSON never controls cooldown mechanics. Equipment is interpreted only through stable allowlisted `effectCode` values, preserving the same generated-content safety boundary as combat effects.

## Normal death contract

Normal defeat at zero HP uses carried Gold as the only loss base. The domain policy calculates `floor(carriedGold * 20 / 100)`, which never takes more than 20% because of integer rounding. Banked Gold is excluded from the calculation and remains unchanged by the repository transaction. The committed `HuntResolved` event exposes `goldLost`, post-loss `carriedGold`, unchanged `bankedGold`, and the configured percentage so presentation never infers economy state.

This milestone deliberately does not risk or destroy equipment. Any future item-loss fallback must satisfy M4-07's explicit dangerous-content warning and protected/bound-item rules before it can be enabled.

## Quest projection boundary

M4-06 does **not** introduce the Quest domain ahead of Phase 6. `questProgress` is an optional list of `{ questId, questName, current, required, completed }` result data. Hunt currently publishes an empty list; a future authoritative Quest service may populate it without requiring the browser to infer progress. The read model also accepts the temporary `label`/`target` aliases used by migration callers.

## Migration compatibility

Existing Hunt enemy identities, baseline HP, Gold, XP, drop chances, and legacy `retaliation` values remain readable. Existing Gold/`threadDust` and XP aliases remain supported while new player-facing Hunt receipt copy uses **Gold** rather than Dust.

`resolveHunt(...)` remains as a focused legacy compatibility helper, but the shipped `HuntService.hunt(...)` path uses `resolveAutomaticHunt(...)` and returns the authoritative `battle` result.

## Objective acceptance

M4-06 tests prove:

1. normal death loss is domain-owned and fixed at 20% of carried Gold, rounded down;
2. Hunt defeat at zero HP applies that loss after authoritative combat resolution;
3. the SQLite mutation cannot reduce banked Gold, even when requested loss exceeds the carried balance;
4. `HuntResolved` and the Hunt receipt project the committed loss and explicitly communicate that the Bank is safe;
5. victory reward projection and migration aliases remain unchanged.

`npm run check`, the full unit/contract suite, and all active Chromium E2E suites remain merge gates. M4-06 changes economy/result data rather than the shipped layout, so the existing representative Hunt mobile screenshot remains the visual regression artifact.

## Next ordered task

After M4-06 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M4-07 — explicit warned dangerous-content item-loss fallback when configured and carried Gold is below minimum, never silently destroying protected/bound gear**.
