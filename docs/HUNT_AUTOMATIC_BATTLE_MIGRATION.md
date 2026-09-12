# Hunt automatic-battle migration

Status: M4-02 implementation candidate. The shipped `hunt` use case resolves combat through the shared `AutomaticBattleSimulator`, and its committed `HuntResolved` event now projects one canonical concise reward receipt.

## Boundary

`HuntService` remains the Service Layer coordinator. It blocks Hunt during an active dungeon, loads the authoritative player and five-slot equipment loadout, asks the Hunt domain policy to resolve one automatic battle, then persists HP/rewards/progression and publishes one `HuntResolved` event.

`HuntEncounter` owns Hunt enemy selection and Hunt-specific reward values. `AutomaticBattleSimulator` owns authoritative HP mutation and turn lifecycle. The shared Attack/Defense/Crit, Speed initiative, constrained equipment effects, and status/resistance policies therefore apply to Hunt rather than a separate `ceil(enemy HP / Attack)` combat shortcut.

`HuntReceiptReadModel` is the application projection boundary for the main Adventure Stream receipt. It consumes already-committed `HuntResolved` facts and formats result-first Gold, XP, HP, level-up, loot, potion, and optional quest-progress facts without recalculating rewards or progression. Failed Hunts project zero Gold/XP even if malformed/stale reward-looking fields are supplied.

The browser remains presentation-only. The generated Hunt card decorates the same persisted event metadata and does not own Gold, XP, loot, quest completion, or combat formulas.

## Quest projection boundary

M4-02 does **not** introduce the Quest domain ahead of Phase 6. The receipt read model accepts an optional `questProgress` list only when an authoritative future service has already supplied those facts. It can render those deltas without deciding objectives or completion itself.

## Migration compatibility

The existing Hunt enemy identities, baseline HP, Gold, XP, drop chances, and legacy `retaliation` values remain readable. Canonical enemy Attack values preserve the baseline ordinary no-Crit damage profile. Existing Gold/`threadDust` aliases and XP aliases remain readable during migration, while new player-facing Hunt receipt copy uses **Gold** rather than Dust.

`resolveHunt(...)` remains as a focused legacy compatibility helper, but the shipped `HuntService.hunt(...)` path no longer calls it. New Hunt combat uses `resolveAutomaticHunt(...)` and returns the authoritative `battle` result for later Battle Details integration.

## Objective acceptance

Focused tests prove that:

1. baseline Hunt combat still comes from `AutomaticBattleSimulator`;
2. `HuntService` persists final HP/rewards/progression before publishing `HuntResolved`;
3. Hunt receipts project Gold, XP, HP, level-up, rarity-aware loot, potion finds, and optional authoritative quest deltas;
4. failed Hunts cannot display reward gain from stale reward-looking fields;
5. legacy `threadDust` / `xp` aliases remain readable while canonical copy says Gold;
6. `ActivityStreamService` persists the canonical receipt while retaining raw event metadata for presentation/migration consumers;
7. existing mobile Playwright Hunt coverage still verifies visible Gold/XP chips and emits `ux-review/simple-loop-hunt.png` at 390x844.

The M4-02 work does not alter the rich Hunt-card layout, so the existing representative mobile screenshot remains the visual regression artifact. Complete active Chromium E2E remains the browser gate.

## Next ordered task

After M4-02 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M4-03 — add a server-owned short Hunt cooldown and clear next-ready projection**.
