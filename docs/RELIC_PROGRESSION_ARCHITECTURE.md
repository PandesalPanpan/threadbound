# Relic progression architecture

Threadbound relic progression is intended to deepen build identity without moving combat authority into the browser or turning gear into another independent game subsystem.

## Player-facing rules

- Clearing dungeons grants Thread Dust and relics through the existing reward transaction.
- Relics can be **Tempered** outside an active dungeon.
- Each Temper costs Dust and permanently adds +1 Attack.
- Rarity caps Temper level: Common 1, Uncommon 2, Rare/Epic/Legendary 3.
- The first Temper permanently selects one attunement:
  - **Bulwark Weave** — successful Guard earns +1 additional Focus.
  - **Disruptor Weave** — successful Interrupt primes +3 damage for the next damaging action.
  - **Executioner Weave** — consuming Exposed with Severing Knot primes +4 damage for the next damaging action.
  - **Mender Weave** — Mending Chorus heals +2 additional HP for each living Weaver it restores.
- A Tempered relic cannot switch attunement.
- Relics cannot be Tempered during an active run. A run therefore uses a stable loadout for its lifetime.

The Gear UI shows the server-computed level cap, next Dust cost, attunement, and build description. It does not calculate upgrade legality itself.

## Fowler-style boundaries

### Domain policies

`RelicProgressionPolicy` owns the stable progression vocabulary and rules: rarity caps, Dust costs, legal attunements, first-Temper selection, and attunement locking. It is side-effect free and has no repository or UI dependency.

`RelicCombatPolicy` owns the tactical meaning of an attunement. It receives a combat outcome produced by the run aggregate and applies the attunement consequence to that same authoritative run state. It never fetches the player, spends currency, persists rows, or broadcasts realtime messages.

This keeps the varying build rules out of HTTP handlers and avoids a growing switch statement inside the generic combat model.

### Aggregate consistency boundary

`DungeonRun` remains the generic combat **Domain Model**. `AdventureRun` remains the aggregate facade for the complete dungeon lifecycle and is the place where cross-cutting run policies, including equipped relic attunements, are composed with a combat command.

HP, Focus, reaction bonus, enemy state, skills, run phases, relic-triggered combat changes, and run `version` therefore still commit as one aggregate state. There is no second combat engine and no client-owned build state.

### Service Layer

`InventoryService` is the application **Service Layer** for Tempering. It verifies that the player has no active run, asks the domain policy for a legal upgrade plan, invokes the transactional repository operation, and publishes `ItemUpgraded` only after the write succeeds.

`GameService` remains the combat Service Layer. It resolves the equipped item, passes only the equipped attunement code into `AdventureRun`, persists the run with the existing optimistic version, and publishes the normal resolved combat receipt.

### Transaction Script at the persistence edge

`SQLiteInventoryRepository.upgradeItem` is intentionally a small atomic transaction rather than a second domain aggregate. It uses `BEGIN IMMEDIATE` to:

1. re-read the owned relic and player Dust;
2. compare the expected Temper level;
3. reject insufficient Dust or a stale repeated command;
4. update `attack_bonus` and relic progression metadata;
5. deduct Dust;
6. commit both changes together.

This prevents a crash or concurrent request from spending Dust without upgrading the item, or upgrading an item twice from the same stale level.

Progression metadata is stored additively in the existing item `effect_json`. Existing relic rows therefore hydrate as Temper 0 with no attunement, and no table migration is needed for this slice.

### Projection, not Event Sourcing

`ItemUpgraded` becomes one durable Adventure Stream entry because Tempering itself is a meaningful social action.

`RelicAttunementTriggered` is a fine-grained domain event only. It is folded into the existing `CombatActionResolved` receipt, so one Guard/Interrupt/skill command still creates one public combat result. The stream remains a projection/read surface and is not an event store or source of truth.

### Realtime is notification only

WebSocket/SSE refreshes announce committed state. They do not determine Dust costs, upgrade caps, attunement legality, Focus gains, bonus damage, or bonus healing. Refresh/reconnect reconstructs all progression from SQLite and all active combat state from the run aggregate.

## Why not split this into another service?

The item row, player Dust, equipped item, and active run are all local consistency concerns today. A separate gear service/database would add distributed transactions and synchronization without solving a demonstrated scaling problem. The modular-monolith boundaries above let those seams be extracted later if actual load or ownership requires it.

## Acceptance contract

Relic progression is not complete unless tests prove:

- first Temper requires a valid attunement and permanently locks it;
- rarity caps and server-computed Dust costs are enforced;
- Dust deduction and item mutation are atomic;
- stale repeated Temper commands cannot both commit;
- insufficient Dust leaves both player and item unchanged;
- active runs block gear mutation;
- Bulwark, Disruptor, Executioner, and Mender produce measurable tactical payoff in the aggregate;
- fine-grained attunement triggers do not create extra public combat messages;
- a 390×844 local Playwright journey earns a relic and Dust through a real run, exposes 44px-or-larger attunement controls, Tempers a relic, reloads, and sees the exact persisted level/attunement;
- existing Threaded, local realtime/co-op, boss encounter, skills, run-event, reconnect, Codex, and Arc Workshop acceptance suites remain green before merge.
