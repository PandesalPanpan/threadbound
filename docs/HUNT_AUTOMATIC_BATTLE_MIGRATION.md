# Hunt automatic-battle migration

Status: M4-02 implementation candidate. The shipped `hunt` use case resolves combat through the shared `AutomaticBattleSimulator` and projects its authoritative rewards as one concise result-first Adventure Stream receipt.

## Boundary

`HuntService` remains the Service Layer coordinator. It blocks Hunt during an active dungeon, loads the authoritative player and five-slot equipment loadout, asks the Hunt domain policy to resolve one automatic battle, then persists HP/rewards/progression and publishes one `HuntResolved` event.

`HuntEncounter` still owns Hunt enemy selection and Hunt-specific reward values. `AutomaticBattleSimulator` now owns authoritative HP mutation and turn lifecycle. The shared Attack/Defense/Crit, Speed initiative, constrained equipment effects, and status/resistance policies therefore apply to Hunt rather than a separate `ceil(enemy HP / Attack)` combat shortcut.

The browser still owns no combat or reward rules. Cooldowns, death penalties, and new Arc content remain ordered later M4 tasks.

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

## Hunt result projection (M4-02)

`HuntResolved` is the single public receipt source for one Hunt command. Its persisted body now leads with Victory/Defeat and includes canonical HP, Gold, XP, level-up, rarity-aware loot, potion, and optional Quest-result copy. The richer browser Presentation Model consumes the same persisted event metadata and renders the values as compact semantic chips and sprite-backed result rows. The underlying text remains complete for accessibility and non-enhanced clients while becoming visually hidden when the rich receipt is attached, so the result is not duplicated on screen.

Quest support in this milestone is projection-only. `questProgress` is an explicit optional list of `{ questId, questName, current, required, completed }` result data. Hunt currently publishes an empty list; the Phase 6 authoritative Quest service may populate it later without requiring the browser to infer progress or moving Quest rules ahead of schedule.

M4-02 acceptance proves:

1. Victory receipts project HP, Gold, XP, level-up, item rarity/stats, potion finds, and optional in-progress/completed Quest results in one entry.
2. Defeat receipts report HP and `No rewards` without noisy `+0` reward fields.
3. Hunt events expose canonical Gold/XP plus the explicit Quest projection seam while retaining migration aliases.
4. Enhanced mobile receipts show the same authoritative Gold/XP result, and their accessible fallback contains no legacy Dust terminology.
5. The representative 390×844 Hunt screenshot preserves the compact result-first hierarchy and unobstructed next actions.

## Next ordered task

After M4-02 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M4-03 — add a server-owned short Hunt cooldown and clear next-ready projection**.
