# Inventory rich card

Status: **M2-02 complete.** Merged through PR #49 at `43d7cf7c02e8d94d91d463e32127f4560e36c1af`; post-merge `main` CI #1111 passed both unit/contract and complete Chromium E2E gates.

The Adventure Stream remains Threadbound's application shell. `inventory` / `gear` resolve to one app-like Inventory card inside the stream rather than a separate product screen.

## Presentation contract

The Inventory card consumes the existing server-authoritative `/api/dashboard` projection. It shows:

- all five canonical equipment slots: Weapon, Helmet, Armor, Boots, Accessory;
- canonical character stats: Attack, Defense, Max HP, Speed, Crit Chance;
- all persisted equipment items in the player's inventory;
- slot and canonical rarity for every item;
- generated semantic equipment sprites through `sprite-catalog.js`;
- Equip, Upgrade, and Sell presentation actions;
- current Gold and health-potion context.

The browser does not calculate authoritative gameplay outcomes. Equip and Upgrade use existing server commands. The M2-02 Sell control is a migration-safe presentation over the existing authoritative salvage transaction; the dedicated canonical Sell transaction remains M7-03 and must not be pulled forward merely to satisfy this card milestone.

## Compatibility

`gear` remains a typed command alias for `inventory`. The canonical rich-card identity is `inventory`; compatibility observers must not regress it to the legacy `gear` identity. Old endpoint/storage names remain only where migration safety requires them.

The legacy dashboard Inventory section remains a secondary compatibility surface. M2-02 does not turn it into the primary application shell and does not restore tactical combat controls.

Honey-purchased Training Cache items remain durable purchase grants and are not used as disposable Sell/salvage fixtures. Browser acceptance earns ordinary Upgrade Gold through authoritative Hunts while keeping the purchase grant intact.

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

The green PR gate ran `npm run check`, `npm test`, and the complete active Chromium E2E suite. The representative 390px Inventory screenshot was inspected before merge and retained the chat-first hierarchy without reintroducing the tactical dashboard.

## Handoff

M2-02 is complete. Continue **M2-03 — Shop rich card**. Build it on the reusable rich-card primitive and the existing server-owned `ShopService`/catalog; keep prices, affordability, purchases, and future equipment stock authoritative on the server, and do not pull the later Arc/Town stock-generation milestone forward.
