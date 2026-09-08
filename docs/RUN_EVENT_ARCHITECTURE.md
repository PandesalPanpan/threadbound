# Run event architecture

Threadbound's mid-run discoveries add encounter variety without moving game authority into the browser or creating a second persistence model.

## Domain boundaries

`DungeonRun` remains the combat **Domain Model**. It owns attacks, support actions, skills, telegraphs, boss phases, damage, and encounter-to-encounter combat transitions.

`AdventureRun` is the aggregate facade for the broader dungeon lifecycle. It delegates combat commands to `DungeonRun`, then coordinates non-combat phases such as a mid-run discovery. Both models still operate on one persisted run state and one optimistic `version`, so this is not a second aggregate or a microservice boundary.

`RunEventCatalog` is a deterministic policy/catalog. It defines the available event choices and snapshots the applicable schedule into a run when that run starts. Active runs therefore do not change when the catalog changes later. The selected event is deterministic for the run seed; the browser never rolls authoritative randomness.

## Service and persistence

`GameService` remains the **Service Layer**. It loads the persisted run, enforces party-leader authorization for shared choices, invokes `AdventureRun`, saves through the repository, and publishes the resulting domain events.

SQLite remains behind the repository boundary. The existing run `version` continues to provide an **Optimistic Offline Lock**, so concurrent party commands cannot silently overwrite a discovery choice.

An unresolved `event` phase is an active run. Refreshing, reconnecting, or closing the page must reconstruct the same snapshotted event and choices. Pre-event persisted runs hydrate without a schedule so an old in-progress run is never surprised by newly introduced content.

## Projection and realtime

The Adventure Stream is a read/presentation projection, not the source of truth. `RunEventDiscovered` is a fine-grained domain event used to refresh affected clients; the combat command that discovers it still produces the normal single durable public receipt. `RunEventChosen` creates the public choice result after the committed state exists.

Realtime broadcasts only committed state changes. It does not own the event timer, choice, random selection, HP changes, Focus changes, or run Attack bonus.

## Why this shape

This follows the same Fowler-style direction used elsewhere in Threadbound: a rich Domain Model, a Service Layer for application coordination, repositories for persistence, and optimistic locking for shared mutable state. The extra `AdventureRun` facade is justified because non-combat run phases are growing independently from combat; it prevents `DungeonRun` from becoming a god object while preserving a single transaction/consistency boundary.

Do not split run events into a separate service, database, event store, or client-side state machine unless future scale creates a concrete need for that boundary.

## Acceptance contract

A run-event change is not complete unless tests prove:

- the schedule/event definition is snapshotted and deterministic;
- the run pauses once and blocks combat until a choice is resolved;
- choices have materially different HP/Focus/Attack consequences;
- party leadership controls a shared choice;
- partner clients see the waiting state and resume from committed state;
- refresh/reconnect preserves the exact unresolved choice;
- legacy active runs do not gain surprise events;
- the mobile UI shows readable consequences and 44px-or-larger choice targets;
- existing Combat V2, realtime, local auth, Threaded auth, Arc Workshop, and reconnect suites remain green.
