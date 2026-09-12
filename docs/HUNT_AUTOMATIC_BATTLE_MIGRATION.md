# Hunt automatic-battle migration

Status: M4-07 implementation candidate. The shipped `hunt` use case resolves combat through the shared `AutomaticBattleSimulator`, publishes one concise result-first Adventure Stream receipt, is paced by a server-owned short cooldown with capped equipment/buff reductions, and applies the normal carried-Gold death rule on defeat. Dangerous-content item loss now exists only as an opt-in reusable foundation and is not enabled for ordinary Hunt.

## Boundary

`HuntService` remains the Service Layer coordinator. It blocks Hunt during an active dungeon, loads the authoritative player and five-slot equipment loadout, validates that the player can act, projects the effective Hunt duration through `ActivityCooldownPolicy`, atomically claims that duration, asks the Hunt domain policy to resolve one automatic battle, then persists HP/rewards/progression and publishes one `HuntResolved` event.

`HuntEncounter` owns Hunt enemy selection and Hunt-specific reward values. `AutomaticBattleSimulator` owns authoritative HP mutation and turn lifecycle. The shared Attack/Defense/Crit, Speed initiative, constrained equipment effects, and status/resistance policies therefore apply to Hunt rather than a separate combat shortcut.

`HuntCooldownPolicy` owns the canonical base duration (15 seconds) and next-ready projection math. `ActivityCooldownPolicy` owns constrained modifier composition and the global 50% reduction cap. `SQLiteHuntCooldownRepository` owns durable `player_id -> ready_at` persistence and an atomic claim transaction. The browser never decides whether a Hunt is ready or how modifiers stack.

`DeathPenaltyPolicy` owns both death-rule decisions. Ordinary death remains the 20% carried-Gold rule. Its dangerous-content path is deliberately opt-in: item loss can only replace Gold loss when an activity explicitly enables it, carried Gold is below that activity's configured minimum, the canonical risk warning was acknowledged before the authoritative activity start time, and at least one equipped item is eligible.

`DangerousDeathPenaltyService` coordinates that future dangerous-activity use case from persisted risk evidence. `SQLiteEquipmentRepository.loseEquippedItem(...)` owns the destructive equipment transaction and defensively rechecks ownership, equipped state, and protection before deletion. No browser code may select or delete the item.

`HuntReceiptReadModel` consumes already-committed `HuntResolved` facts and projects Victory/Defeat, HP, Gold, XP, level-up, rarity-aware loot, potion, optional Quest-result facts, the exact next-Hunt timestamp, and any authoritative carried-Gold death loss without recalculating rules. A death receipt explicitly says the Bank is safe. Failed Hunts discard stale reward-looking fields. `ActivityStreamService` persists its complete text for accessibility and non-enhanced clients.

The richer browser Presentation Model consumes the same persisted event metadata and renders the shared stream. It does not own combat, rewards, loot, death penalties, Quest completion, or cooldown legality.

## Cooldown contract

A successful Hunt claim sets `nextHuntReadyAt` before combat resolution. An immediate duplicate Hunt therefore cannot receive a second combat/reward result. The cooldown record survives repository/service recreation because it is stored in the same authoritative SQLite database as the player.

A blocked Hunt fails with `hunt_cooldown` and a clear message containing both the remaining seconds and exact ISO next-ready timestamp. Successful Hunt API results and `HuntResolved` metadata also carry `cooldown.nextReadyAt` / `nextHuntReadyAt`, so presentation can show readiness without inventing a client timer as authority.

The canonical base Hunt cooldown remains 15 seconds. `ActivityCooldownPolicy` recognizes only allowlisted modifier codes. The generated equipment effect `quick_hunt` reduces Hunt cooldown by 20%. Future fight-count buffs can provide the allowlisted `hunt_haste_minor` (10%) or `hunt_haste_major` (25%) codes through the Service Layer once buff persistence arrives; arbitrary buff codes fail closed. Equipment and buff reductions add together but are capped at 50%, and non-zero activities retain at least a one-second cooldown. A zero-second explicit test override remains zero so existing fixture setup can bypass pacing intentionally.

Persisted/generated item `effect` JSON never controls cooldown mechanics. Equipment is interpreted only through stable allowlisted `effectCode` values, preserving the same generated-content safety boundary as combat effects.

## Normal death contract

Normal defeat at zero HP uses carried Gold as the only loss base. The domain policy calculates `floor(carriedGold * 20 / 100)`, which never takes more than 20% because of integer rounding. Banked Gold is excluded from the calculation and remains unchanged by the repository transaction. The committed `HuntResolved` event exposes `goldLost`, post-loss `carriedGold`, unchanged `bankedGold`, and the configured percentage so presentation never infers economy state.

Ordinary Hunt continues to use this rule. M4-07 does not silently make Hunt dangerous.

## Dangerous-content item-loss contract

Dangerous item loss is disabled unless the calling activity passes an explicit `{ enabled: true, minimumCarriedGold }` configuration. Even when enabled, carried Gold at or above the configured minimum uses the normal Gold penalty.

Below that threshold, `DeathPenaltyPolicy` requires authoritative pre-entry warning evidence: the acknowledgement must use the canonical `dangerous-item-loss-v1` warning id, match the exact activity id, contain a valid acknowledgement timestamp, and have been acknowledged no later than the persisted activity start time. Missing, mismatched, invalid, or late acknowledgement fails closed to normal Gold loss rather than equipment loss.

The canonical warning states the configured Gold threshold, that one eligible equipped item may be lost on death, and that bound, protected, and Honey-purchased equipment is safe. This warning is intended to be rendered and acknowledged by the future dangerous activity before it starts; M4-07 does not invent a dangerous activity ahead of the ordered Area/Adventure phases.

Eligibility is fail-safe. Items marked `bound`, `protected`, or with `lossProtection` of `bound`/`protected` are excluded. `honey-purchase` items are always excluded regardless of serialized metadata. If no eligible equipped item exists, the policy falls back to the normal Gold rule.

`SQLiteEquipmentRepository` repeats the protection check inside the destructive transaction. A caller therefore cannot bypass the domain decision to delete a protected item directly. The transaction also clears the legacy equipped-weapon pointer before deletion so migration-era reads cannot reference an item that no longer exists.

## Quest projection boundary

M4-07 does **not** introduce the Quest domain ahead of Phase 6. `questProgress` is an optional list of `{ questId, questName, current, required, completed }` result data. Hunt currently publishes an empty list; a future authoritative Quest service may populate it without requiring the browser to infer progress. The read model also accepts the temporary `label`/`target` aliases used by migration callers.

## Migration compatibility

Existing Hunt enemy identities, baseline HP, Gold, XP, drop chances, and legacy `retaliation` values remain readable. Existing Gold/`threadDust` and XP aliases remain supported while new player-facing Hunt receipt copy uses **Gold** rather than Dust.

`resolveHunt(...)` remains as a focused legacy compatibility helper, but the shipped `HuntService.hunt(...)` path uses `resolveAutomaticHunt(...)` and returns the authoritative `battle` result.

Protection metadata remains additive and migration-safe. Existing generated equipment without a protection marker remains ordinary eligible gear when used by an explicitly warned dangerous activity; Honey-purchased equipment is protected by authoritative source identity even for older rows.

## Objective acceptance

M4-07 tests prove:

1. dangerous item loss is disabled by default and only applies below an activity-configured carried-Gold threshold;
2. item loss requires the canonical warning to have been acknowledged for the same activity before its authoritative start time;
3. bound, protected, and Honey-purchased equipped items are excluded from eligibility;
4. no eligible item fails closed to the normal carried-Gold rule;
5. an eligible equipped-item loss commits atomically while carried and banked Gold remain unchanged;
6. the equipment repository independently rejects direct protected-item deletion;
7. ordinary Hunt remains on the M4-06 Gold-only death rule until a later dangerous activity explicitly opts in.

`npm run check`, the full unit/contract suite, and all active Chromium E2E suites remain merge gates. M4-07 changes authoritative domain/application/persistence behavior but does not alter the shipped browser layout, so the existing representative Hunt mobile screenshot remains the visual baseline.

## Next ordered task

After M4-07 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M5-01 — introduce persistent Area model and player highest-unlocked/current Area**.
