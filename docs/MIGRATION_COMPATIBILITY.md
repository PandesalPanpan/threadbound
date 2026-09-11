# Threadbound migration compatibility boundary

This document records the legacy names and state that must remain readable while the product migrates toward `docs/THREADBOUND_MASTER_PLAN.md`.

It is a compatibility contract, not a player-facing design. New default UX must use the simple language and gameplay direction in the master plan.

## Strangler rule

Migrate Threadbound from the outside in:

1. change read models, receipts, cards, and player-facing copy first;
2. introduce new canonical domain concepts behind compatibility adapters where useful;
3. change persisted schema/API names only when a tested migration is necessary;
4. keep old persisted runs and saves readable until their replacement path is proven;
5. never let a compatibility name become justification for expanding the old product model.

## Legacy terminology that may remain internally for now

| Legacy/internal name | Target player-facing concept | Compatibility requirement |
| --- | --- | --- |
| `Thread Dust`, `threadDust`, `thread_dust` | Gold | Existing balances must remain readable and spendable while projections/API/domain migrate. Do not zero or duplicate balances merely to rename the currency. |
| `Temper`, temper levels/attunement data | Upgrade | Existing upgraded items must preserve their power/progression. New UI says Upgrade even while old fields/services remain temporarily. |
| `Relic`, `Relic Pouch` | Equipment / Inventory | Existing persisted items and generated item identities remain valid. Familiar slots are added incrementally rather than invalidating old item rows. |
| `Weaver` | Adventurer / player name | Authentication/player identifiers and historical copy may retain Weaver where migration would add risk; routine new UI should not. |
| `Mend` and other tactical combat terms | Heal / sparse progression-boss decisions | Preserve only where required to hydrate or regress legacy tactical runs. Do not surface them in the new routine Hunt/Adventure loop. |
| legacy tactical `DungeonRun` / `/api/dungeons/:dungeonId/start` | legacy persisted-run compatibility | Old runs may hydrate and focused regression tests may exercise the route. New player-facing runs must not choose it by default. |

## Persisted state that must remain safe

During the rebuild, changes must preserve at minimum:

- existing player/session identity and durable SQLite sessions;
- existing normal-currency balances while Thread Dust becomes Gold;
- potions/recovery state until the new inventory/consumable projection replaces it safely;
- existing generated/persisted item IDs, rarity, power, upgrade/attunement data, and `visualAssetId` identity;
- equipment ownership/equipped state;
- party membership/readiness and participant snapshots;
- active legacy/simple dungeon snapshots, optimistic versions, idempotency records, and exactly-once completion rewards;
- achievements, world history, Codex/Arc content, and published manifest state;
- Threaded-owned Honey/idempotent Honey grant state.

A migration may reshape these concepts later, but it must have explicit conversion/backward-compatibility tests before old fields or routes are removed.

## Tactical-default rejection

The legacy tactical model is not the target product. Compatibility code/tests exist so persisted historical state remains safe, not so Focus, Guard, Interrupt, Mend, skills, run powers, or random run-buff choices can return to the default gameplay surface.

The default direction is:

- chat-first;
- routine Hunt/Adventure/Duel battles auto-resolve;
- concise result receipts with Battle Details on demand;
- simple commands such as Hunt, Adventure, Heal, Inventory, Shop, Bank, Quest, Duel;
- only sparse, intentional interactivity for major progression bosses.

Any proposal that reintroduces the old permanent tactical dashboard requires an explicit product decision that changes the master plan.

## Removal criteria

A legacy name/route/state may be removed only when:

1. no supported persisted state requires it, or a deterministic migration exists;
2. authoritative unit/repository migration tests cover the conversion;
3. player-facing and browser acceptance tests use the replacement path;
4. reconnect/retry/exactly-once guarantees remain intact where applicable;
5. merged `main` CI is green.

Until then, prefer adapters and projections over destructive renames.