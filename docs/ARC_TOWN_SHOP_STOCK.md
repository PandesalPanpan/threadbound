# Arc / Town Shop stock

M7-02 extends the existing server-owned Shop catalog so published Arc content can contribute equipment offers to an established Town without moving economy rules into the browser.

## Authoritative boundary

`shopStocks` is optional Arc Manifest data. Each stock definition names an established `TownCatalog` Town, its Area, and one or more fixed-Gold equipment offers. Each offer references an equipment template from the same Arc Manifest rather than copying or redefining item mechanics.

`ArcManifestService.validate()` runs `validateArcTownShopStocks()` before a draft can be saved or published. Validation rejects:

- unknown Town references;
- Town/Area mismatches;
- missing or invalid offers;
- invalid or duplicate stock/SKU identity;
- non-positive or excessive Gold prices;
- missing equipment-template references;
- equipment authored for a later Area than the Town stock.

Published data is validated again at the Shop projection boundary and fails closed if legacy or externally seeded invalid data is encountered.

## Runtime consumption

`ShopService` obtains the player's current Area from `SQLiteAreaRepository`, reads only published Arc Manifests, and combines matching Arc/Town equipment with the migration-safe foundation stock.

The browser receives display-safe offer fields only. Private item construction data remains server-side. Buying Arc stock uses the same `SQLiteShopRepository.purchaseEquipment()` transaction as foundation equipment: validate carried Gold, persist the owned item, and debit Gold atomically.

The generated item's slot, rarity, stats, effects, Level/Area metadata, budget, and `visualAssetId` come from the already-validated M7-01 equipment template. Shop code does not reinterpret or invent equipment mechanics.

## Manifest shape

```json
{
  "shopStocks": [
    {
      "id": "area-1-market-stock",
      "townId": "area-1-town",
      "areaNumber": 1,
      "offers": [
        {
          "sku": "ember-needle",
          "itemTemplateId": "ember-needle-template",
          "cost": 14
        }
      ]
    }
  ]
}
```

The JSON Schema exposes the same constrained shape. This is deliberately a migration-stage Town binding: M7-02 targets Town IDs already established by `TownCatalog`. Full Arc vNext packaging for generated Areas/Towns/NPCs/Shops remains Phase 10 and must preserve this authoritative validation boundary.

## Player experience

M7-02 does not introduce a new screen or change the chat shell. Matching stock appears in the existing Shop rich card and existing Buy action/receipt path. Gold remains the only normal Shop currency; Honey ownership is unchanged.

No Sell behavior is added here. M7-03 owns the Sell flow and its authoritative transaction tests.

## Verification

`test/arc-town-shop-stock.test.js` covers stock validation, publication-time validation integration, fail-closed runtime behavior, browser-safe projection, current-Area consumption, and atomic generated-equipment purchase. Existing Shop Playwright coverage remains the presentation regression gate because M7-02 does not change Shop card structure or mobile hierarchy.
