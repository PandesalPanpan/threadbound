# Progression Adventure foundation

Status: M5-06 implementation boundary.

## Shipped contract

- Major progression Adventures require exactly **two ready human players by default**.
- The requirement is enforced by `ProgressionAdventurePolicy` on the server, never inferred by browser controls.
- Only the party leader may start the challenge and every required participant is resolved from persisted player state before a run exists.
- Simulated-adventurer-shaped participants cannot satisfy the human requirement. This remains important when Phase 8 adds persistent simulated adventurers.
- The current foundation deliberately reuses the existing migration-safe **Frayed Hollow** simple-combat definition through the reserved `progression-area-1` activity id. It does not author a new Arc before Phase 10.
- The resulting run snapshots both participants and uses the existing attack-only, chat-first co-op run boundary. It does not restore the legacy tactical dashboard.

## Fowler-style boundary

- **Domain policy:** `src/domain/ProgressionAdventurePolicy.js` owns party-size, readiness, leader, and human-participant legality.
- **Service Layer:** `SimpleDungeonService` coordinates persisted party/player lookup and starts the run only after the progression policy accepts the request.
- **Repository:** the existing game repository remains authoritative for party membership, player identity, and the durable participant snapshot.
- **Presentation:** the existing `/api/dungeons/:dungeonId/start-simple` boundary can start `progression-area-1`; presentation does not decide whether one or two players are sufficient.

## Explicitly deferred

M5-06 does **not** unlock an Area. Transactional first-clear Area unlock belongs to **M5-07**. Boss failure/enrage stacks belong to **M5-08**. New Arc identities/content remain Phase 10 work.

## Verification

`test/progression-adventure.test.js` proves that solo starts fail, an unready pair fails, an exact ready pair succeeds and snapshots both humans, and an oversized party is rejected rather than accidentally satisfying the progression gate.
