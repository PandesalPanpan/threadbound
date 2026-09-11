# Hunt recovery and receipt plan

## Outcome

Hunts remain instant, lightweight commands, but damage becomes durable attrition with understandable recovery. Results become compact, scan-first ledger receipts.

## Decisions

1. Store current out-of-combat health and potion count on the player record.
2. Recover one HP per minute outside active runs, calculated lazily from the last health change.
3. Give new players one potion; a potion restores 12 HP and cannot be wasted at full health.
4. Hunts remain cooldown-free. They persist remaining HP and may award a potion alongside Dust/gear.
5. Recovery is an application use case coordinated by `HuntService`; SQLite owns the atomic potion decrement/health update.
6. The activity stream remains a projection. One Hunt or potion command creates one durable result message.
7. Presentation turns Hunt metadata into a compact ledger: foe/outcome, health delta/current health, currency, then optional loot.

## Fowler-style boundaries

- `HuntEncounter`: Domain Policy calculating a Hunt from current stats and health.
- `HuntService`: Service Layer coordinating recovery, encounter resolution, rewards, persistence, and events.
- `SQLiteGameRepository`: Repository and transaction boundary for player health/potions.
- `ActivityStreamService`: event-to-readable-receipt projection.
- browser modules: Presentation Model only; generated asset selection stays outside the domain.

## Verification

- Domain tests cover current-health attrition.
- Service/repository tests cover persistence, regeneration, potion consumption, and insufficient-health rules.
- Projection tests cover concise receipt content.
- Mobile Playwright covers plain `hunt`/`heal`, bottom anchoring, and the scan-first receipt.
