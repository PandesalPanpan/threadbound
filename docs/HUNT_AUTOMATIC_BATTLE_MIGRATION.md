# Hunt automatic-battle migration

Status: M4-02 implementation candidate. The shipped `hunt` use case resolves combat through the shared `AutomaticBattleSimulator`, and its committed `HuntResolved` event projects one concise result-first Adventure Stream receipt.

## Boundary

`HuntService` remains the Service Layer coordinator. It blocks Hunt during an active dungeon, loads the authoritative player and five-slot equipment loadout, asks the Hunt domain policy to resolve one automatic battle, then persists HP/rewards/progression and publishes one `HuntResolved` event.

`HuntEncounter` owns Hunt enemy selection and Hunt-specific reward values. `AutomaticBattleSimulator` owns authoritative HP mutation and turn lifecycle. The shared Attack/Defense/Crit, Speed initiative, constrained equipment effects, and status/resistance policies therefore apply to Hunt rather than a separate combat shortcut.

`HuntReceiptReadModel` consumes already-committed `HuntResolved` facts and projects Victory/Defeat, HP, Gold, XP, level-up, rarity-aware loot, potion, and optional Quest-result facts without recalculating rules. Failed Hunts discard stale reward-looking fields. `ActivityStreamService` persists its complete text for accessibility and non-enhanced clients.

The richer browser Presentation Model consumes the same persisted event metadata and renders compact semantic chips plus sprite-backed loot and Quest rows. It does not own combat, rewards, loot, or Quest completion. The complete text becomes visually hidden when the rich receipt is attached, preventing duplicate visible outcomes.

## Quest projection boundary

M4-02 does **not** introduce the Quest domain ahead of Phase 6. `questProgress` is an optional list of `{ questId, questName, current, required, completed }` result data. Hunt currently publishes an empty list; a future authoritative Quest service may populate it without requiring the browser to infer progress. The read model also accepts the temporary `label`/`target` aliases used by migration callers.

## Migration compatibility

Existing Hunt enemy identities, baseline HP, Gold, XP, drop chances, and legacy `retaliation` values remain readable. Existing Gold/`threadDust` and XP aliases remain supported while new player-facing Hunt receipt copy uses **Gold** rather than Dust.

`resolveHunt(...)` remains as a focused legacy compatibility helper, but the shipped `HuntService.hunt(...)` path uses `resolveAutomaticHunt(...)` and returns the authoritative `battle` result.

## Objective acceptance

M4-02 tests prove:

1. Hunt combat still comes from `AutomaticBattleSimulator`, and `HuntService` persists HP/rewards/progression before publishing `HuntResolved`.
2. Victory receipts project HP, Gold, XP, level-up, item rarity/stats, potion finds, and optional in-progress/completed Quest results in one entry.
3. Defeat receipts report HP and `No rewards` without stale loot/progression or noisy `+0` reward fields.
4. Legacy `threadDust` / `xp` aliases remain readable while canonical copy says Gold.
5. Enhanced mobile receipts show the same authoritative Gold/XP result, and their accessible fallback contains no legacy Dust terminology.
6. The representative 390×844 Hunt screenshot preserves the compact result-first hierarchy and unobstructed next actions.

`npm run check`, the full unit/contract suite, and all active Chromium E2E suites remain merge gates.

## Next ordered task

After M4-02 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M4-03 — add a server-owned short Hunt cooldown and clear next-ready projection**.
