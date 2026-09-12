# Hunt automatic-battle migration

Status: M4-04 implementation candidate. The shipped `hunt` use case resolves combat through the shared `AutomaticBattleSimulator`, publishes one concise result-first Adventure Stream receipt, and is paced by a server-owned short cooldown with capped equipment/buff reductions.

## Boundary

`HuntService` remains the Service Layer coordinator. It blocks Hunt during an active dungeon, loads the authoritative player and five-slot equipment loadout, validates that the player can act, projects the effective Hunt duration through `ActivityCooldownPolicy`, atomically claims that duration, asks the Hunt domain policy to resolve one automatic battle, then persists HP/rewards/progression and publishes one `HuntResolved` event.

`HuntEncounter` owns Hunt enemy selection and Hunt-specific reward values. `AutomaticBattleSimulator` owns authoritative HP mutation and turn lifecycle. The shared Attack/Defense/Crit, Speed initiative, constrained equipment effects, and status/resistance policies therefore apply to Hunt rather than a separate combat shortcut.

`HuntCooldownPolicy` owns the canonical base duration (15 seconds) and next-ready projection math. `ActivityCooldownPolicy` owns constrained modifier composition and the global 50% reduction cap. `SQLiteHuntCooldownRepository` owns durable `player_id -> ready_at` persistence and an atomic claim transaction. The browser never decides whether a Hunt is ready or how modifiers stack.

`HuntReceiptReadModel` consumes already-committed `HuntResolved` facts and projects Victory/Defeat, HP, Gold, XP, level-up, rarity-aware loot, potion, optional Quest-result facts, and the exact next-Hunt timestamp without recalculating rules. Failed Hunts discard stale reward-looking fields. `ActivityStreamService` persists its complete text for accessibility and non-enhanced clients.

The richer browser Presentation Model consumes the same persisted event metadata and renders compact semantic chips plus sprite-backed loot and Quest rows. It does not own combat, rewards, loot, Quest completion, or cooldown legality. The complete text becomes visually hidden when the rich receipt is attached, preventing duplicate visible outcomes.

## Cooldown contract

A successful Hunt claim sets `nextHuntReadyAt` before combat resolution. An immediate duplicate Hunt therefore cannot receive a second combat/reward result. The cooldown record survives repository/service recreation because it is stored in the same authoritative SQLite database as the player.

A blocked Hunt fails with `hunt_cooldown` and a clear message containing both the remaining seconds and exact ISO next-ready timestamp. Successful Hunt API results and `HuntResolved` metadata also carry `cooldown.nextReadyAt` / `nextHuntReadyAt`, so presentation can show readiness without inventing a client timer as authority.

The canonical base Hunt cooldown remains 15 seconds. `ActivityCooldownPolicy` recognizes only allowlisted modifier codes. The generated equipment effect `quick_hunt` reduces Hunt cooldown by 20%. Future fight-count buffs can provide the allowlisted `hunt_haste_minor` (10%) or `hunt_haste_major` (25%) codes through the Service Layer once buff persistence arrives; arbitrary buff codes fail closed. Equipment and buff reductions add together but are capped at 50%, and non-zero activities retain at least a one-second cooldown. A zero-second explicit test override remains zero so existing fixture setup can bypass pacing intentionally.

Persisted/generated item `effect` JSON never controls cooldown mechanics. Equipment is interpreted only through stable allowlisted `effectCode` values, preserving the same generated-content safety boundary as combat effects.

## Quest projection boundary

M4-04 does **not** introduce the Quest domain ahead of Phase 6. `questProgress` is an optional list of `{ questId, questName, current, required, completed }` result data. Hunt currently publishes an empty list; a future authoritative Quest service may populate it without requiring the browser to infer progress. The read model also accepts the temporary `label`/`target` aliases used by migration callers.

## Migration compatibility

Existing Hunt enemy identities, baseline HP, Gold, XP, drop chances, and legacy `retaliation` values remain readable. Existing Gold/`threadDust` and XP aliases remain supported while new player-facing Hunt receipt copy uses **Gold** rather than Dust.

`resolveHunt(...)` remains as a focused legacy compatibility helper, but the shipped `HuntService.hunt(...)` path uses `resolveAutomaticHunt(...)` and returns the authoritative `battle` result.

## Objective acceptance

M4-04 tests prove:

1. Hunt combat still comes from `AutomaticBattleSimulator`, and `HuntService` persists HP/rewards/progression before publishing `HuntResolved`.
2. A successful Hunt returns and publishes an exact authoritative next-ready timestamp.
3. An equipped `quick_hunt` item reduces the canonical 15-second Hunt cooldown to 12 seconds at the domain policy boundary.
4. Equipment and allowlisted future buff modifiers compose but cannot reduce an activity beyond the 50% global cap.
5. Unknown buff mechanics fail closed and unrelated equipment does not change Hunt pacing.
6. The SQLite cooldown still enforces the resulting effective duration authoritatively and existing migration aliases/reward presentation remain intact.

`npm run check`, the full unit/contract suite, and all active Chromium E2E suites remain merge gates. M4-04 changes authoritative timing data rather than the shipped layout, so the existing representative Hunt mobile screenshot remains the visual regression artifact.

## Next ordered task

After M4-04 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M4-05 — normalize `heal` command/action and recovery rules with simple terminology**.
