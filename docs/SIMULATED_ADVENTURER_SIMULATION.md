# Simulated Adventurer offline progression (M8-02)

M8-02 adds bounded, retry-safe offline progression for the persistent simulated-adventurer model introduced by M8-01. It deliberately does not populate Guild Halls, create bot equipment, mutate Gold/Honey, build rankings, or resolve Duels; those remain ordered M8-03+ work.

## Fowler-style boundaries

- **Domain Policy — `SimulatedAdventurerSimulationPolicy`** owns cadence, catch-up caps, deterministic activity selection, and the small XP award attached to each simulated activity credit.
- **Service Layer — `SimulatedAdventurerSimulationService`** loads authoritative bot state, asks the policy for a plan, and coordinates one repository transaction. It does not run a timer itself; a future process/job may call it safely at any reasonable cadence.
- **Repository — `SQLiteSimulatedAdventurerRepository`** owns durable profile state, the simulation cursor, unique tick claims, and the atomic XP/count mutation.

No browser or Adventure Stream code participates in simulation outcomes.

## Bounded cadence

The cadence is intentionally human-like rather than continuous:

| Profile | Minimum interval | Maximum applied actions per scheduler run |
| --- | ---: | ---: |
| Casual | 8 hours | 2 |
| Steady | 4 hours | 3 |
| Dedicated | 2 hours | 4 |

A first scheduler observation only establishes `lastSimulatedAt`; it does not grant retroactive progress from an unknown start time.

When a bot has been offline for longer than the cap, only the latest capped action windows are applied and the cursor advances to the current scheduler time. Older backlog is discarded. Repeated immediate scheduler calls therefore cannot drain weeks of backlog into continuous grinding.

For M8-02, progression is intentionally narrow: simulated Hunts grant 12 XP and increment Hunt count; every fourth deterministic cadence bucket is an Adventure granting 20 XP and incrementing Adventure count. Level remains derived from the same `LevelProgressionPolicy` used by human players. No loot, Gold, Honey, Area unlock, achievements, or equipment are created by these ticks.

## Retry and concurrency safety

Each planned action has a stable tick key derived from the activity profile and absolute cadence bucket. SQLite stores `(adventurer_id, tick_key)` as a primary key.

`applySimulationBatch` runs under `BEGIN IMMEDIATE` and compares the persisted simulation cursor with the service's expected cursor before applying anything. If another worker already advanced that bot, the stale caller returns `stale`; the service reloads once and replans. Within the transaction, duplicate tick inserts are ignored and only newly claimed ticks may increment XP/activity counts. Cursor advancement and progression mutation commit together.

This gives deterministic retry behavior without introducing a distributed scheduler, microservice, or event-sourcing layer.

## Verification

`test/simulated-adventurer-simulation.test.js` proves:

- qualitative activity profiles map to explicit bounded cadences;
- large offline gaps are capped and excess backlog is discarded;
- first observation grants no retroactive actions;
- XP/Hunt/Adventure progression persists through the repository;
- immediate retry cannot duplicate progression;
- stale concurrent batches fail harmlessly through cursor compare-and-swap;
- invalid backwards clock movement fails closed.

M8-02 has no player-facing UI change, so a mobile screenshot is not applicable. The next ordered milestone is **M8-03 — prevent bots from Honey use, invalid item creation, or direct human-economy mutations**.
