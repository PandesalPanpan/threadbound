# Relic progression architecture

Threadbound relic progression is intended to deepen durable build identity without moving combat authority into the browser or turning gear into another independent combat dashboard.

## Player-facing rules

- Clearing dungeons grants Thread Dust and relics through the existing reward transaction.
- Relics can be **Tempered** outside an active dungeon.
- Each Temper costs Dust and permanently adds +1 Attack.
- Rarity caps Temper level: Common 1, Uncommon 2, Rare/Epic/Legendary 3.
- The first Temper permanently selects one attunement:
  - **Bulwark Weave** — a successful Guard primes +2 damage for the next damaging action.
  - **Disruptor Weave** — a successful Interrupt primes +3 damage for the next damaging action.
  - **Executioner Weave** — interrupting with Severing Knot primes +4 damage for the next damaging action.
  - **Mender Weave** — Mending Chorus heals +2 additional HP for each living Weaver it restores.
- A Tempered relic cannot switch attunement.
- Relics cannot be Tempered or re-equipped during an active run. A run therefore uses a stable loadout for its lifetime.

New streamlined runs use cooldown-only combat skills and do not expose Focus or the Exposed combo. Persisted runs created before that rule change retain their legacy Focus/Exposed behavior so they can finish without destructive migration. The compatibility branch lives in domain policy rather than in the browser.

The Gear UI shows the server-computed level cap, next Dust cost, attunement, and build description. It does not calculate upgrade legality itself. Gear controls are visibly locked while a run is active, while the server remains authoritative if a stale client still submits a command.

## Fowler-style boundaries

### Domain policies

`RelicProgressionPolicy` owns the stable progression vocabulary and rules: rarity caps, Dust costs, legal attunements, first-Temper selection, and attunement locking. It is side-effect free and has no repository or UI dependency.

`RelicCombatPolicy` owns the tactical meaning of an attunement. It receives a combat outcome produced by the run aggregate and applies the attunement consequence to that same authoritative run state. It never fetches the player, spends currency, persists rows, or broadcasts realtime messages. For streamlined runs it maps Bulwark and Executioner onto the simpler cooldown/reaction vocabulary; legacy runs can still resolve their persisted Focus/Exposed rules.

`StreamlinedSkillPolicy` is the compatibility policy between the complete run aggregate and the mature combat model. It lets new runs reuse the established `DungeonRun` resolution code while ensuring retired Focus/Exposed state cannot be persisted or projected from a streamlined action. This avoids duplicating a second combat engine merely to remove mechanics.

This keeps varying build and compatibility rules out of HTTP handlers and avoids a growing switch statement inside the generic combat model.

### Aggregate consistency boundary

`DungeonRun` remains the generic combat **Domain Model**. `AdventureRun` remains the aggregate facade for the complete dungeon lifecycle and is the place where cross-cutting run policies, including equipped relic attunements and streamlined-skill compatibility, are composed with a combat command.

HP, cooldowns, reaction bonus, enemy state, skills, run phases, relic-triggered combat changes, and run `version` therefore still commit as one aggregate state. Legacy Focus fields remain in stored participant state as compatibility data, but streamlined runs normalize them to zero and do not expose them as a current mechanic. There is no second combat engine and no client-owned build state.

### Service Layer

`InventoryService` is the application **Service Layer** for Tempering. It performs an early active-run check for fast feedback, asks the domain policy for a legal upgrade plan, invokes the transactional repository operation, and publishes `ItemUpgraded` only after the write succeeds.

`GameService` remains the combat Service Layer. It resolves the equipped item, passes only the equipped attunement code into `AdventureRun`, persists the run with the existing optimistic version, publishes the normal resolved combat receipt, and rejects equipment changes while a run is active. Its dashboard DTO exposes run-upgrade cards only when a legacy persisted run is actually waiting on an upgrade; streamlined runs receive an empty upgrade collection.

### Transaction Script at the persistence edge

`SQLiteInventoryRepository.upgradeItem` is intentionally a small atomic transaction rather than a second domain aggregate. It uses `BEGIN IMMEDIATE` to:

1. re-check that the player still has no active run while holding the SQLite write lock;
2. re-read the owned relic and player Dust;
3. compare the expected Temper level;
4. reject insufficient Dust or a stale repeated command;
5. update `attack_bonus` and relic progression metadata;
6. deduct Dust;
7. commit both changes together.

The Service Layer’s earlier active-run check is not the consistency boundary. The repository repeats it under the same write lock as the mutation so a concurrent dungeon start cannot slip between the check and the Temper commit.

This prevents a crash or concurrent request from spending Dust without upgrading the item, upgrading an item twice from the same stale level, or mutating a build after an active run has already committed.

Progression metadata is stored additively in the existing item `effect_json`. Fresh generated relics explicitly persist Temper 0 with no attunement, while older relic rows safely hydrate to those same defaults. No table migration is needed for this slice.

### Projection, not Event Sourcing

`ItemUpgraded` becomes one durable Adventure Stream entry because Tempering itself is a meaningful social action.

`RelicAttunementTriggered` is a fine-grained domain event only. It is folded into the existing `CombatActionResolved` receipt, so one Guard/Interrupt/skill command still creates one public combat result. Streamlined receipts omit retired Focus/Exposed state. The stream remains a projection/read surface and is not an event store or source of truth.

### Realtime is notification only

WebSocket/SSE refreshes announce committed state. They do not determine Dust costs, upgrade caps, attunement legality, cooldowns, bonus damage, or bonus healing. Refresh/reconnect reconstructs all progression from SQLite and all active combat state from the run aggregate.

## Why not split this into another service?

The item row, player Dust, equipped item, and active run are all local consistency concerns today. A separate gear service/database would add distributed transactions and synchronization without solving a demonstrated scaling problem. The modular-monolith boundaries above let those seams be extracted later if actual load or ownership requires it.

## Acceptance contract

Relic progression is not complete unless tests prove:

- first Temper requires a valid attunement and permanently locks it;
- rarity caps and server-computed Dust costs are enforced;
- Dust deduction and item mutation are atomic;
- stale repeated Temper commands cannot both commit;
- insufficient Dust leaves both player and item unchanged;
- the active-run rule is enforced again inside the Temper write transaction;
- active runs block both Temper and equipment changes;
- Mender’s bonus healing is reflected in HP, combat events, and contribution totals;
- Bulwark, Disruptor, Executioner, and Mender produce measurable tactical payoff in the streamlined aggregate without reintroducing Focus/Exposed;
- fine-grained attunement triggers do not create extra public combat messages;
- the Gear enhancer ignores its own DOM mutations instead of creating a dashboard-refetch loop;
- a 390×844 local Playwright journey earns a relic and Dust through a real run, exposes 44px-or-larger attunement controls, Tempers a relic, reloads, sees the exact persisted level/attunement, stays within the viewport, and confirms the public Equip route is locked once the next run begins;
- existing Threaded, local realtime/co-op, boss encounter, skills, reconnect, Codex, Arc Workshop, and legacy run compatibility acceptance suites remain green before merge.
