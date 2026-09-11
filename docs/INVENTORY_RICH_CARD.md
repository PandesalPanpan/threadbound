# Inventory rich card

Status: **M2-02 implementation complete pending green merge/main verification.**

The Adventure Stream remains Threadbound's application shell. `inventory` / `gear` now resolve to one app-like Inventory card inside the stream rather than a separate product screen.

## Presentation contract

The Inventory card consumes the existing server-authoritative `/api/dashboard` projection. It shows:

- all five canonical equipment slots: Weapon, Helmet, Armor, Boots, Accessory;
- canonical character stats: Attack, Defense, Max HP, Speed, Crit Chance;
- all persisted equipment items in the player's inventory;
- slot and canonical rarity for every item;
- generated semantic equipment sprites through `sprite-catalog.js`;
- Equip, Upgrade, and Sell presentation actions;
- current Gold and health-potion context.

The browser does not calculate authoritative gameplay outcomes. Equip and Upgrade use the existing server commands. The M2-02 Sell control is a migration-safe presentation over the existing authoritative salvage transaction; the dedicated canonical Sell transaction remains M7-03 and must not be pulled forward merely to satisfy this card milestone.

## Compatibility

`gear` remains a command alias for `inventory`. The card normalizes the visible command/title to Inventory while preserving old endpoint/storage names where required for migration safety.

The legacy dashboard Inventory section remains a secondary compatibility surface. M2-02 does not turn it into the primary application shell and does not restore tactical combat controls.

## Browser acceptance

`test/e2e/inventory-rich-card.spec.js` runs at a 390px mobile viewport and proves that the card:

- stays inside the Adventure Stream rich-card shell;
- exposes all five slots and all five readable character stats;
- renders generated item art and rarity/slot metadata;
- exposes functional Equip and Upgrade actions that produce authoritative state changes and stream receipts;
- exposes the Sell action with confirmation without client-authored pricing;
- prevents selling the equipped item;
- maintains 44px action targets and avoids horizontal overflow;
- writes `ux-review/inventory-rich-card-mobile.png` for visual inspection.

## Handoff

After PR CI is green, inspect the mobile screenshot, merge, verify `main` CI, then mark M2-02 complete in `docs/THREADBOUND_MASTER_PLAN.md`. The next ordered milestone is M2-03, the Shop rich card.
