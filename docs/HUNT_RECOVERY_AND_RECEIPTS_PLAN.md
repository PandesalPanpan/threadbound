# Hunt recovery and receipt plan

## Outcome

Hunts remain instant, lightweight commands, but damage becomes durable attrition with understandable recovery. Results become compact, scan-first ledger receipts.

## Decisions

1. Store current out-of-combat health and potion count on the player record.
2. Recover one HP per minute outside active runs, calculated lazily from the last health change.
3. Give new players one potion; a potion restores 12 HP and cannot be wasted at full health.
4. Hunts remain cooldown-free. They persist remaining HP and may award a potion alongside Dust/gear.
5. Mara's recovery shop presents illustrated potion choices (one for 5 Dust or three for 12), ensuring 0 HP + 0 potions is never an opaque dead end; `rest` displays live next-HP and full-recovery countdowns.
6. Hunt/recovery actions are coordinated by `HuntService`; shop browsing/purchasing is coordinated by `ShopService` from the server-owned `ShopCatalog`; SQLite owns the atomic potion purchase/decrement and health updates.
7. The activity stream remains a projection. One Hunt, potion, or shop command creates one durable result message, and Hunt loot explicitly says `You got …`.
8. Presentation turns Hunt metadata into a compact ledger: foe/outcome, health delta/current health, currency, then optional loot.

## Fowler-style boundaries

- `HuntEncounter`: Domain Policy calculating a Hunt from current stats and health.
- `HuntService`: Service Layer coordinating Hunt resolution, recovery, rewards, persistence, and events.
- `ShopCatalog`: constrained server-owned offer data: SKU, price, quantity, copy, and visual reference.
- `ShopService`: Service Layer projecting shop availability/affordability and coordinating purchases.
- `SQLiteGameRepository`: Repository and transaction boundary for player health, potions, and Thread Dust.
- `ActivityStreamService`: event-to-readable-receipt projection.
- browser modules: Presentation Model only; they render the shop projection and do not own price/quantity rules.

## Verification

- Domain tests cover current-health attrition.
- Hunt/repository tests cover persistence, regeneration, and potion consumption.
- `test/shop-service.test.js` covers projected offers, affordability, SKU validation, price/quantity grants, and insufficient-Dust behavior.
- Projection tests cover concise receipt content.
- Mobile Playwright covers plain `hunt`/`heal`, bottom anchoring, recovery, and the illustrated shop response.
