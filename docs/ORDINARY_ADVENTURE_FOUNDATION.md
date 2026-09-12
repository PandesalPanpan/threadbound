# Ordinary Adventure foundation

Status: M5-04 implementation candidate. The master checklist remains authoritative; this document records the boundary implemented by the milestone and does not mark the checklist complete before merge and green `main` CI.

## Player contract

`adventure` and `/adventure` start one ordinary automatic battle from the Adventure Stream. The command does not open or revive the legacy tactical dashboard. One explicit Adventure produces one concise `AdventureResolved` stream receipt with Area, opponent, result, HP change, final HP, and any normal carried-Gold death loss.

M5-04 deliberately does **not** grant Adventure XP, Gold, loot, cooldown state, or story events. Those are the ordered M5-05 milestone, so the event exposes explicit zero/null placeholders rather than letting the browser invent rewards.

## Authority and modular-monolith boundaries

- `AdventureEncounter` is the Domain Model/Policy boundary for ordinary Area encounter selection and automatic battle resolution.
- `AutomaticBattleSimulator` remains the shared battle lifecycle; Adventure does not fork Attack/Defense/Crit/Speed/equipment-effect rules.
- `AdventureService` is the Service Layer boundary. It reads the player's persisted current Area and equipment, coordinates the battle, persists resulting HP, applies the already-established normal death penalty when necessary, and publishes one `AdventureResolved` fact.
- `SQLiteAreaRepository`, `SQLiteEquipmentRepository`, `SQLiteBankRepository`, and the game repository remain persistence/transaction boundaries.
- `ActivityStreamService` and `public/ordinary-adventure.js` are projections/presentation. They do not select encounters, resolve combat, or calculate death loss.

## World/content scope

The initial Area 1 ordinary encounter intentionally reuses the already-shipped `Thread Wolf` identity. It is a fixed Area snapshot and does not scale automatically to player level. No new Arc, named Area, currency, or progression-boss content is introduced by M5-04.

Areas without an ordinary Adventure encounter fail closed with `adventure_unavailable_in_area`; content breadth belongs to later ordered world/content milestones rather than ad-hoc fallback generation.

## Verification target

Authoritative tests cover Area-owned encounter selection, use of the shared automatic battle context, persisted HP mutation, one `AdventureResolved` event, and wounded-player rejection. Mobile-width Playwright coverage enters `adventure` through the Adventure Stream, observes the receipt, confirms authoritative HP changed, and verifies the event carries the persisted current Area.

There is no substantial new layout in M5-04: the existing Adventure Stream receipt presentation is reused, so a new visual-design screenshot is not required unless implementation changes make the presentation materially different.

## Next ordered task

After M5-04 is merged, green on `main`, and objectively checked off, the next earliest milestone is **M5-05 — add Adventure cooldown/rewards/loot/story-event projection**.
