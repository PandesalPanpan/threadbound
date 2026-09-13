# Simple crafting recipe model

M7-04 adds a small domain recipe contract without adding another wallet, material currency, Craft screen, or partially-authoritative browser flow.

## Scope

A crafting recipe is item-to-item data:

- stable recipe id and readable name;
- Area number for later progression gating;
- one to eight ingredient requirements;
- each ingredient references an ordinary persisted item `definitionId` plus a quantity;
- one item output definition plus quantity.

Example:

```js
{
  id: 'wolf-leather-boots',
  name: 'Wolf Leather Boots',
  areaNumber: 2,
  ingredients: [
    { itemDefinitionId: 'wolf-pelt', quantity: 2 },
    { itemDefinitionId: 'iron-thread', quantity: 1 },
  ],
  output: { itemDefinitionId: 'wolf-leather-boots-template', quantity: 1 },
}
```

Ingredients are **items**, not Gold, Honey, Thread Dust, crafting points, shards, or another headline wallet. This keeps the master-plan economy at exactly Gold + Honey while allowing future Arc content to introduce ordinary material items when that content actually needs them.

## Domain boundary

`CraftingRecipePolicy` owns the reusable recipe rules:

- stable lowercase ids;
- positive bounded quantities;
- bounded ingredient count;
- no duplicate ingredient definitions;
- no recipe whose output is also one of its own ingredients;
- availability projection from owned item instances;
- deterministic planning of the concrete item instance ids a future authoritative transaction would consume.

The domain planner is intentionally pure. It **does not** delete ingredients, grant output items, emit receipts, or decide browser state.

## Deferred execution boundary

M7-04 does not add a player-facing `craft` command or Crafter card. A later crafting use case must still provide a Service Layer and repository transaction that rechecks, inside the authoritative write boundary:

- player ownership;
- current Area/Town/Crafter eligibility;
- exact ingredient availability;
- equipped/protected/Honey-origin item safety where relevant;
- retry/idempotency behavior;
- atomic ingredient consumption and output creation;
- one concise Adventure Stream receipt.

That future transaction must not trust a browser-authored consume list or output definition. `planCraftingConsumption()` is a domain planning helper, not permission to mutate persistence.

## Why there is no production material catalog yet

Current Threadbound item pools are still equipment-oriented. M7-04 therefore adds the recipe model without inventing placeholder material currencies or a fake crafting grind merely to exercise it. Future validated Arc/item content can introduce ordinary ingredient items and then bind recipes to Town/Crafter content without changing the basic recipe shape.

## Verification

`test/crafting-recipe-policy.test.js` proves:

- normalized recipes contain item requirements and no currency fields;
- duplicate ingredients, invalid quantities, recipe cycles, and oversized recipes fail closed;
- availability counts persisted-style item instances by `definitionId`;
- consumption planning selects concrete item ids deterministically while performing no mutation;
- missing ingredients report exact deficits for a future Service/Repository transaction.

There is no presentation change in M7-04, so no new mobile screenshot is required. Full Chromium remains a regression gate before merge.

## Handoff

After M7-04 is merged and green on `main`, continue **M7-05 — cooking recipes with fight-count buffs rather than wall-clock expiration**. Cooking may reuse the item-ingredient vocabulary, but its buff outcome should remain a constrained domain contract rather than arbitrary executable recipe effects.
