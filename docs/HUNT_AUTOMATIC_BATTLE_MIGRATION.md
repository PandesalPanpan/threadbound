# Hunt automatic-battle migration

Status: M4-01 implementation candidate. The shipped `hunt` use case now resolves combat through the shared `AutomaticBattleSimulator` while preserving the existing one-command Hunt persistence/reward boundary.

## Boundary

`HuntService` remains the Service Layer coordinator. It blocks Hunt during an active dungeon, loads the authoritative player and five-slot equipment loadout, asks the Hunt domain policy to resolve one automatic battle, then persists HP/rewards/progression and publishes one `HuntResolved` event.

`HuntEncounter` still owns Hunt enemy selection and Hunt-specific reward values. `AutomaticBattleSimulator` now owns authoritative HP mutation and turn lifecycle. The shared Attack/Defense/Crit, Speed initiative, constrained equipment effects, and status/resistance policies therefore apply to Hunt rather than a separate `ceil(enemy HP / Attack)` combat shortcut.

The browser still owns no combat rules. This milestone does not add cooldowns, death penalties, new reward projection, or new Arc content; those remain ordered M4 tasks.

## Migration compatibility

The existing Hunt enemy identities, baseline HP, Gold, XP, drop chances, and legacy `retaliation` values remain readable. Canonical enemy Attack values are chosen so the baseline Level-1 Adventurer with 2 Defense takes the same ordinary no-Crit damage as before. Existing Gold/`threadDust` aliases and `HuntResolved` fields remain compatible.

`resolveHunt(...)` remains as a focused legacy compatibility helper, but the shipped `HuntService.hunt(...)` path no longer calls it. New Hunt combat uses `resolveAutomaticHunt(...)` and returns the authoritative `battle` result for later concise-receipt/Battle Details projection work.

## Objective acceptance

Focused tests prove that:

1. the baseline Thread Wolf Hunt preserves its familiar result while turn history and HP come from `AutomaticBattleSimulator`;
2. Hunt consumes shared Speed semantics and constrained equipment effects;
3. `HuntService` persists the simulator's final HP and rewards and exposes battle outcome/turn count in the authoritative event;
4. existing Hunt recovery, Gold migration, and XP/Level tests remain regression gates.

No new browser presentation is introduced by M4-01, so there is no additional screenshot requirement for this milestone. The complete active Chromium E2E suite remains the browser regression gate.

## Next ordered task

After M4-01 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M4-02 — add XP/Gold/loot/quest result projection to Hunt receipts**.
