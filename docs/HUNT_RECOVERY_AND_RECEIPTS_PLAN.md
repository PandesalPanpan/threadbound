# Hunt recovery and receipt plan

## Outcome

Hunts remain lightweight commands, but damage becomes durable attrition with understandable healing. Results become compact, scan-first ledger receipts. The later canonical master plan adds a short server-owned Hunt cooldown; this document no longer treats cooldown-free Hunt as a product requirement.

## Decisions

1. Store current out-of-combat health and potion count on the player record.
2. Recover one HP per minute outside active runs, calculated lazily from the last health change.
3. **Heal** is the canonical routine player action: outside an active dungeon, a wounded player may consume one health potion; a potion restores up to 12 HP and cannot be wasted at full health.
4. Natural out-of-combat HP recovery is presented as part of Heal rather than as a separate headline recovery system. `/rest` and `/recovery` remain compatibility aliases for viewing the live next-HP/full-heal countdown; `/potion` and the existing recovery route remain migration adapters for older callers.
5. Hunts persist remaining HP and may award a potion alongside Gold/gear. The canonical Hunt path also enforces the short server-owned cooldown defined by the master plan.
6. Mara's shop presents illustrated potion choices so 0 HP + 0 potions is never an opaque dead end. Player-facing copy uses Heal/healing terminology; legacy storage/pricing terminology remains migration context only.
7. `HealingPolicy` owns routine Heal legality, the fixed potion amount, and passive-recovery timing vocabulary. `HuntService` coordinates the Heal use case and preserves the legacy potion adapter; SQLite owns authoritative potion/health persistence.
8. The activity stream remains a projection. One Hunt, Heal/potion, or shop command creates one durable result message.
9. Presentation turns Hunt metadata into a compact ledger: foe/outcome, health delta/current health, Gold/rewards, optional loot, and server-projected next-Hunt readiness.
10. Legacy tactical `Mend` remains isolated to persisted tactical-run compatibility and is not the routine Heal action.

## Fowler-style boundaries

- `HuntEncounter`: Domain Policy calculating a Hunt from current stats and health.
- `HuntCooldownPolicy`: Domain Policy defining the base cooldown duration and next-ready projection math.
- `HealingPolicy`: Domain Policy defining routine Heal legality, bounded potion healing, and passive-recovery timing vocabulary.
- `HuntService`: Service Layer coordinating Hunt resolution, cooldown claim, Heal, rewards, persistence, and events while retaining compatibility adapters.
- `SQLiteHuntCooldownRepository`: authoritative atomic cooldown persistence/claim boundary.
- `ShopCatalog`: constrained server-owned offer data: SKU, price, quantity, copy, and visual reference.
- `ShopService`: Service Layer projecting shop availability/affordability and coordinating purchases.
- `SQLiteGameRepository`: Repository and transaction boundary for player health, potions, and legacy-backed Gold storage.
- `ActivityStreamService`: event-to-readable-receipt projection.
- browser modules: Presentation Model only; they render server projections and do not own prices, healing legality, cooldown legality, or reward rules.

## Verification

- Domain tests cover bounded routine Heal, full-health/no-potion rejection, active-dungeon rejection, passive recovery, current-health attrition, and cooldown projection.
- Hunt/repository tests cover cooldown persistence/atomic claims, regeneration, and potion consumption.
- `test/shop-service.test.js` covers projected offers, affordability, SKU validation, price/quantity grants, and insufficient-balance behavior.
- Projection tests cover concise receipt content and exact next-ready timestamps.
- Mobile Playwright covers plain Hunt/Heal, authoritative HP/potion mutation, bottom anchoring, natural-healing countdowns, and illustrated shop response.
