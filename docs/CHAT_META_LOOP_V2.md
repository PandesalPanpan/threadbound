# Chat Meta Loop V2

## Product outcome

Threadbound keeps the Adventure Stream as the primary play surface while making permanent progression and recovery reachable at the moment they matter. The player should not need a permanent tactical dashboard to discover the next useful action.

The default loop is:

```text
Hunt -> loot / Dust -> Inventory -> equip / Temper / salvage
     -> Shop / Recovery when wounded
     -> Dungeon when strong enough -> reward -> Inventory -> repeat
```

## Contextual action policy

The composer may show at most two contextual actions outside a simple dungeon. Everything remains reachable through typed commands and the existing mobile navigation.

- Fresh or under-geared Weaver with no inventory: **Hunt + Dungeon readiness**.
- Under recommended Attack with permanent gear available: **Hunt + Inventory**.
- At or above recommended Attack with permanent gear available: **Dungeon + Inventory**.
- At zero Hunt HP: **Recovery + Shop**.
- Active simple dungeon: **Attack** only.

Inventory and Shop buttons do not implement progression rules. They submit the same `inventory` / `shop` commands handled by the Adventure Stream presentation model.

## Inventory boundary

The existing Gear/Inventory surfaces remain the same authoritative inventory projection. Chat navigation is an additional entry point, not a second inventory implementation.

- Equipment ownership, equipping, Tempering, and salvaging remain server-authoritative.
- The browser may select which already-authoritative surface to reveal, but it does not calculate combat outcomes or mutate inventory locally.
- The bottom Gear navigation remains available for deliberate browsing even when Inventory is not one of the two contextual actions.

## Shop boundary

Mara's shop remains an in-thread response, but its shelf is now a server-projected read model instead of browser-authored economy data.

- `ShopCatalog` owns the allowlisted SKU, name, description, visual asset, price, and quantity grant.
- `ShopService.browse()` projects the vendor, current Dust balance, offer affordability, and availability.
- `ShopService.purchase()` resolves the SKU from the same catalog and coordinates the atomic repository transaction.
- the browser renders `/api/shop` and posts to `/api/shop/purchases/:sku`; it does not contain the authoritative price or quantity grant.
- the old `/api/shop/health-potion` route remains temporarily as a compatibility adapter during migration.

The current recovery shelf is intentionally small:

- Health potion: 1 for 5 Thread Dust.
- Potion satchel: 3 for 12 Thread Dust.

New consumables/materials or rotating offers should extend the server catalog/service boundary rather than adding browser-side economy conditions.

## Acceptance gates

- [x] **META-01:** The contextual action bar never renders more than two actions outside combat.
- [x] **META-02:** A fresh Weaver still sees Hunt and Dungeon readiness without needing to open another screen.
- [x] **META-03:** When inventory contains permanent gear and Attack is below the dungeon recommendation, Inventory replaces Dungeon in the contextual pair while typed `dungeon` remains available.
- [x] **META-04:** When Attack reaches the dungeon recommendation and inventory exists, Dungeon and Inventory are the contextual pair.
- [x] **META-05:** Zero Hunt HP renders Recovery and Shop, with no dead-end Hunt action.
- [x] **META-06:** Inventory from the contextual action opens the same Relic pouch used by the `inventory` / `gear` command path.
- [x] **META-07:** Shop remains an illustrated in-thread merchant response and purchases update authoritative Dust/potion state.
- [x] **META-08:** Simple dungeons expose Attack only; meta actions do not compete with the current combat command.
- [x] **META-09:** The 390x844 mobile viewport has no horizontal overflow and all contextual controls retain 44px minimum touch targets.
- [x] **META-10:** Unit/contract tests and Chromium Playwright suites are green on the merged implementation.
- [x] **META-11:** Shop offer price/quantity/availability are projected by the server catalog/service; changing browser presentation cannot change the authoritative purchase terms.

## Verification

The implementation landed through the contextual meta-loop and server-projected shop changes on `main`. `test/e2e/simple-loop.spec.js` is the primary browser gate for the contextual action policy. Recovery/shop behavior remains covered by `test/e2e/simple-loop.local.spec.js`, Hunt/recovery unit tests, and `test/shop-service.test.js` for catalog projection and purchase rules.

Keep these boxes checked only while CI remains green and the implementation continues to satisfy the same contract. Any future change that intentionally alters one of these behaviors should update this document and its automated gate in the same pull request.
