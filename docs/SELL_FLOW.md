# Canonical Sell flow

M7-03 replaces the legacy player-facing salvage transaction with a canonical **Sell** use case while preserving migration aliases for older clients and persisted terminology.

## Authoritative boundary

`EquipmentSellPolicy` owns whether an item may be sold and the Gold value of a sale. `InventoryService.sell()` coordinates the use case. `SQLiteInventoryRepository.sellItem()` owns the destructive transaction that removes the item and credits carried Gold.

The browser does not calculate Sell value or decide whether an item is eligible. The existing Inventory rich card remains the chat-first presentation surface and keeps its explicit confirmation step.

## Sell value

M7-03 intentionally preserves the old salvage economics so the migration does not unexpectedly inflate or deflate existing inventories:

- Common: 4 Gold
- Uncommon: 7 Gold
- Rare: 12 Gold
- Epic: 20 Gold
- Legendary: 32 Gold
- Mythic: 50 Gold
- plus `floor(Attack bonus / 2)` Gold

The formula lives in domain policy, not browser code.

## Safety rules

A Sell is rejected when:

- the player is in an active dungeon/run;
- the item is equipped in **any** canonical slot (Weapon, Helmet, Armor, Boots, Accessory);
- the item came from a Honey purchase;
- the item is bound or otherwise protected;
- the item is not owned by the player or no longer exists.

The repository repeats the active-run, ownership, equipped-slot, Honey-source, and protection checks inside `BEGIN IMMEDIATE`. Item deletion and Gold credit occur in that same transaction, so a failed or raced Sell cannot delete gear without payment or pay without deleting the gear.

Honey-purchased Training Cache gear is deliberately non-sellable. Threadbound must not convert Threaded-owned premium spending into locally minted Gold.

## Stream receipt

A committed sale publishes one `ItemSold` event. The Adventure Stream projects it as one concise public receipt:

`Adventurer sold Cinder Helm · +12 Gold.`

Historical `ItemSalvaged` events remain readable but are projected with canonical Sell/Gold wording instead of reviving Thread Dust terminology.

## Migration compatibility

The old names remain only as temporary transport/code aliases:

- `InventoryService.salvage()` delegates to `sell()`;
- `SQLiteInventoryRepository.salvageItem()` delegates to `sellItem()`;
- the existing `/api/items/:itemId/salvage` route therefore executes the canonical Sell transaction until the HTTP transport is retired or renamed safely;
- response fields `salvaged` and `threadDust` remain compatibility aliases alongside canonical `sold`, `gold`, and `goldEarned`.

New gameplay code should call the Sell API at the Service Layer and use Gold terminology.

## Verification

`test/inventory-salvage.test.js` now proves the canonical transaction: successful atomic sale, all-slot equipped protection, Honey/protected-item rejection, active-run recheck inside the write transaction, and compatibility delegation.

`test/inventory-sell-stream.test.js` proves one canonical `ItemSold` receipt and canonical projection of old `ItemSalvaged` history.

`test/e2e/inventory-rich-card.spec.js` exercises the mobile chat-first Sell journey using ordinary Shop equipment: confirmation does not mutate state, confirmed Sell removes the item, credits the exact server-owned Gold value, and adds exactly one public Sell receipt.

M7-03 changes behavior/copy but not the Inventory card layout, so it does not introduce a new mobile hierarchy or separate screen.

## Handoff

After M7-03 is merged and green on `main`, continue **M7-04 — add a simple crafting recipe model when item ingredients justify it**. Do not introduce a new headline crafting currency merely to support recipes; ingredients should remain ordinary items unless product direction explicitly changes.
