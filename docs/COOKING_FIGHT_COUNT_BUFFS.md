# Cooking recipes and fight-count buffs

M7-05 adds the authoritative cooking/buff foundation without adding a wall-clock timer, another currency, or a separate cooking screen.

## Recipe contract

`CookingRecipePolicy` defines item-to-buff recipes. A recipe contains:

- a stable recipe id and readable food name;
- an Area number for progression gating;
- one to eight ordinary item ingredients using the same `definitionId` + quantity vocabulary as M7-04 crafting;
- one allowlisted fight buff code;
- a positive bounded number of fights.

Example:

```js
{
  id: 'spicy-wyvern-stew',
  name: 'Spicy Wyvern Stew',
  areaNumber: 2,
  ingredients: [
    { itemDefinitionId: 'wyvern-meat', quantity: 2 },
    { itemDefinitionId: 'red-herb', quantity: 1 },
  ],
  buff: { code: 'attack_boost_minor', fights: 8 },
}
```

Unknown recipe/buff fields fail closed. In particular, `durationSeconds`, `expiresAt`, arbitrary formulas, scripts, Gold costs, Honey costs, or new crafting wallets are not part of this contract.

## Buff policy

`FightBuffPolicy` is the constrained mechanic vocabulary. The initial cooking-oriented stat buff is `attack_boost_minor`, which raises authoritative Attack by 10% while it has fights remaining. Existing `hunt_haste_minor` and `hunt_haste_major` codes now share this same allowlist so cooldown modifiers and food/stat buffs cannot drift into separate vocabularies.

Attack percentage bonuses are bounded and applied by server domain policy. Browser code never interprets buff mechanics.

## Persistence and fight consumption

`SQLiteFightBuffRepository` stores only:

- player id;
- allowlisted buff code;
- source recipe id;
- remaining fight count;
- applied timestamp for ordering/audit only.

The timestamp never determines expiration. A buff with one remaining fight applies to that fight and is deleted after the authoritative battle resolves. Failed preconditions such as cooldown rejection do not consume a fight.

M7-05 wires active buffs into ordinary `HuntService` and `AdventureService` battles. Both services read active codes before combat, apply authoritative stat/cooldown effects, then decrement persisted fight counts exactly once after a resolved battle, regardless of victory or defeat.

## Cooking transaction

`CookingService` coordinates the use case and `SQLiteCookingRepository` owns the destructive transaction. The repository rechecks:

- player existence;
- no active dungeon;
- required Area already unlocked;
- the same buff is not already active;
- concrete ingredient ownership;
- equipped-item protection;
- protected/bound/Honey-purchased item safety.

Ingredient deletion and buff activation commit atomically. The browser never supplies a consume list or a buff payload. A successful use case publishes one `FoodCooked` domain event for a future chat/NPC presentation path.

Current production content remains equipment-oriented, so M7-05 does not invent fake ingredient drops merely to expose cooking early. Real cooking content can bind this foundation when validated Arc/item content is expanded in the ordered plan.

## Presentation boundary

There is no new cooking screen or rich-card hierarchy in M7-05, so no mobile screenshot is required. M7-06 owns player-facing projection of active buffs and remaining fight counts in Profile/relevant receipts.

## Verification

`test/cooking-fight-count-buff.test.js` proves:

- recipes reject wall-clock duration/expiry and unknown buff mechanics;
- the +10% Attack buff changes authoritative battle stats while stat-only buffs do not accidentally alter cooldowns;
- cooking atomically consumes eligible item instances and activates durable remaining-fight state;
- Honey-owned items cannot satisfy a destructive cooking ingredient requirement;
- Hunt uses and decrements a buff once per resolved fight, then returns to baseline after expiration;
- ordinary Adventure also consumes exactly one remaining fight after resolution.

Full Chromium remains the regression gate even though this milestone has no presentation change.

## Handoff

After M7-05 is merged and green on `main`, continue **M7-06 — show active remaining-fight buffs in Profile / relevant receipts**. Do not add a separate buff dashboard; project the authoritative persisted state into the existing chat-first surfaces.
