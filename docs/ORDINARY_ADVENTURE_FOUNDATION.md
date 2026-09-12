# Ordinary Adventure foundation

Status: M5-05 implementation candidate. The master checklist remains authoritative; this document records the boundary implemented by the milestone and does not mark the checklist complete before merge and green `main` CI.

## Player contract

`adventure` and `/adventure` start one ordinary automatic battle from the Adventure Stream. The command does not open or revive the legacy tactical dashboard. One explicit Adventure produces one concise `AdventureResolved` stream receipt with Area, opponent, result, HP change, final HP, XP/Gold rewards on victory, an important loot drop when present, optional story-event text, level-up state, and the exact server-owned next-ready timestamp. Normal carried-Gold death loss remains visible on defeat.

Ordinary Adventure uses a 45-second base cooldown. A repeat attempt during that window fails with `adventure_cooldown`, remaining seconds, and the exact next-ready timestamp. The browser does not decide readiness.

## Authority and modular-monolith boundaries

- `AdventureEncounter` is the Domain Model/Policy boundary for ordinary Area encounter selection and automatic battle resolution.
- `AdventureRewardPolicy` owns Area reward values, constrained loot chance/rarity, story-event projection, and the canonical Adventure cooldown duration.
- `ActivityCooldownPolicy` remains the shared bounded modifier policy; Adventure does not invent browser-side cooldown arithmetic.
- `AutomaticBattleSimulator` remains the shared battle lifecycle; Adventure does not fork Attack/Defense/Crit/Speed/equipment-effect rules.
- `AdventureService` is the Service Layer boundary. It reads persisted Area/equipment state, claims the durable cooldown, coordinates combat, commits Gold/XP/loot/HP/death loss, and publishes one authoritative `AdventureResolved` fact.
- `SQLiteAdventureCooldownRepository`, `SQLiteAreaRepository`, `SQLiteEquipmentRepository`, `SQLitePlayerProgressionRepository`, `SQLiteBankRepository`, and the game repository remain persistence/transaction boundaries.
- `ActivityStreamService` is presentation projection only. It formats committed Adventure facts and never calculates rewards, combat, or cooldown legality.

## World/content scope

The initial Area 1 ordinary encounter intentionally reuses the already-shipped `Thread Wolf` identity. It is a fixed Area snapshot and does not scale automatically to player level. M5-05 adds only a small neutral Area-1 story observation (`area-trail-signs`) so the projection contract is real without introducing a new Arc, named Area, currency, Town, quest, or progression-boss content.

Area 1 Adventure victory currently grants 6 Gold and 30 XP with a 50% constrained equipment-drop chance; generated Adventure drops are capped at Rare for this foundation. Areas without an ordinary Adventure encounter/reward definition fail closed rather than generating ad-hoc content.

## Verification target

Authoritative tests cover Area-owned encounter selection, shared automatic battle context, persisted HP, Gold/XP progression, reward/story projection, durable cooldown rejection, and wounded-player rejection. Active mobile-width Playwright coverage enters `adventure` through the Adventure Stream, verifies visible XP/Gold/next-ready projection, confirms the persisted Area metadata, and proves an immediate repeat is server-rejected.

The presentation change is additive text inside the existing compact stream receipt rather than a new layout/card family; the established 390×844 mobile stream hierarchy remains the visual baseline.

## Next ordered task

After M5-05 is merged, green on `main`, and objectively checked off, the next earliest milestone is **M5-06 — implement progression Adventure/boss requiring both human players by default**.
