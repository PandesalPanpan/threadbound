# Hunt recovery and receipt plan

## Outcome

Hunts remain lightweight commands, but damage becomes durable attrition with understandable recovery. Results become compact, scan-first ledger receipts. The later canonical master plan adds a short server-owned Hunt cooldown; this document no longer treats cooldown-free Hunt as a product requirement.

## Decisions

1. Store current out-of-combat health and potion count on the player record.
2. Recover one HP per minute outside active runs, calculated lazily from the last health change.
3. Give new players one potion; a potion restores 12 HP and cannot be wasted at full health.
4. Hunts persist remaining HP and may award a potion alongside Gold/gear. The current canonical Hunt path also enforces the short server-owned cooldown defined by the master plan.
5. Mara's recovery shop presents illustrated potion choices, ensuring 0 HP + 0 potions is never an opaque dead end; `rest` displays live next-HP and full-recovery countdowns. Legacy storage/pricing terminology in this older plan remains migration context only.
6. Hunt/recovery actions are coordinated by `HuntService`; shop browsing/purchasing is coordinated by `ShopService` from the server-owned `ShopCatalog`; SQLite owns authoritative potion, health, and Hunt-cooldown persistence.
7. The activity stream remains a projection. One Hunt, potion, or shop command creates one durable result message.
8. Presentation turns Hunt metadata into a compact ledger: foe/outcome, health delta/current health, Gold/rewards, optional loot, and server-projected next-Hunt readiness.

## Fowler-style boundaries

- `HuntEncounter`: Domain Policy calculating a Hunt from current stats and health.
- `HuntCooldownPolicy`: Domain Policy defining the base cooldown duration and next-ready projection math.
- `HuntService`: Service Layer coordinating Hunt resolution, cooldown claim, recovery, rewards, persistence, and events.
- `SQLiteHuntCooldownRepository`: authoritative atomic cooldown persistence/claim boundary.
- `ShopCatalog`: constrained server-owned offer data: SKU, price, quantity, copy, and visual reference.
- `ShopService`: Service Layer projecting shop availability/affordability and coordinating purchases.
- `SQLiteGameRepository`: Repository and transaction boundary for player health, potions, and legacy-backed Gold storage.
- `ActivityStreamService`: event-to-readable-receipt projection.
- browser modules: Presentation Model only; they render server projections and do not own prices, cooldown legality, or reward rules.

## Verification

- Domain tests cover current-health attrition and cooldown projection.
- Hunt/repository tests cover cooldown persistence/atomic claims, regeneration, and potion consumption.
- `test/shop-service.test.js` covers projected offers, affordability, SKU validation, price/quantity grants, and insufficient-balance behavior.
- Projection tests cover concise receipt content and exact next-ready timestamps.
- Mobile Playwright covers plain Hunt/Heal, bottom anchoring, recovery, and illustrated shop response.
