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

The browser does not calculate authoritative gameplay outcomes. Equip and Upgrade use server commands. **M7-03 now gives Sell its canonical server-authoritative transaction**: domain policy owns value/protection rules, the repository removes the item and credits Gold atomically, and one `ItemSold` event becomes one concise Adventure Stream receipt. The current `/salvage` route/name remains only as a migration transport alias to that Sell use case; it no longer owns separate salvage semantics.

## Compatibility

`gear` remains a typed command alias for `inventory`. The canonical rich-card identity is `inventory`; compatibility observers must not regress it to the legacy `gear` identity. Old endpoint/storage names remain only where migration safety requires them.

The legacy dashboard Inventory section remains a secondary compatibility surface. M2-02 does not turn it into the primary application shell and does not restore tactical combat controls.

Honey-purchased Training Cache items remain durable purchase grants and cannot be converted into locally minted Gold by Sell. Browser acceptance uses ordinary Shop equipment as the disposable Sell fixture while keeping the Honey grant intact.

## Browser acceptance

`test/e2e/inventory-rich-card.spec.js` runs at a 390px mobile viewport and proves that the card:

- stays inside the Adventure Stream rich-card shell;
- exposes all five slots and all five readable character stats;
- renders generated item art and rarity/slot metadata;
- exposes functional Equip and Upgrade actions that produce authoritative state changes and stream receipts;
- exposes Sell with an explicit confirmation step and no client-authored pricing;
- confirms an ordinary Shop item remains before confirmation, then removes it and credits the exact authoritative Gold value after confirmation;
- produces exactly one canonical Sell/Gold stream receipt for the committed sale;
- prevents selling currently equipped gear through presentation state while the server independently enforces all-slot protection;
- maintains 44px action targets and avoids horizontal overflow;
- writes `ux-review/inventory-rich-card-mobile.png` for visual inspection.

M7-03 changes Sell behavior and copy but does not introduce a new Inventory layout. The existing mobile hierarchy remains the approved presentation surface; authoritative Sell acceptance is covered by the same mobile journey.

## Handoff

M2-02 remains complete, and M7-03 owns the dedicated Sell transaction. After M7-03 is merged and green, continue the master plan at **M7-04 — simple crafting recipe model when item ingredients justify it** without introducing another headline currency.
