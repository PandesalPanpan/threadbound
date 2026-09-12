# Progression Adventure foundation

Status: **M5-06 and M5-07 complete. M5-07 merged in PR #79 at `dfeeee72`; post-merge `main` CI #1497 is green.**

## Shipped contract

- Major progression Adventures require exactly **two ready human players by default**.
- The requirement is enforced by `ProgressionAdventurePolicy` on the server, never inferred by browser controls.
- Only the party leader may start the challenge and every required participant is resolved from persisted player state before a run exists.
- Simulated-adventurer-shaped participants cannot satisfy the human requirement. This remains important when Phase 8 adds persistent simulated adventurers.
- The current foundation deliberately reuses the existing migration-safe **Frayed Hollow** simple-combat definition through the reserved `progression-area-1` activity id. It does not author a new Arc before Phase 10.
- The resulting run snapshots both participants and uses the existing attack-only, chat-first co-op run boundary. It does not restore the legacy tactical dashboard.
- `progression-area-1` now declares the fixed server-owned reward `unlocksAreaNumber: 2`. A valid first clear unlocks Area 2 for every snapshotted participant.
- The unlock is monotonic and idempotent. Re-clearing the same progression challenge cannot advance a player to Area 3, and retrying an already rewarded completion cannot duplicate the unlock.
- Unlocking advances `highest_unlocked_area_number` only. It does not silently teleport the player away from their current Area; existing Area travel remains the explicit movement boundary.

## Fowler-style boundary

- **Domain policy:** `src/domain/ProgressionAdventurePolicy.js` owns party-size, readiness, leader, and human-participant legality. `AreaProgression` continues to own the monotonic Area invariant.
- **Service Layer:** `SimpleDungeonService` coordinates persisted party/player lookup and starts the run only after the progression policy accepts the request. `GameService` passes only trusted progression-definition unlock metadata into the completion transaction and publishes committed `AreaUnlocked` facts.
- **Repository:** `SQLiteGameRepository.completeRunWithRewards(...)` is the atomic completion boundary. Reward insertion, world clear progress, run completion, party reset, and any configured Area unlock commit or roll back together. `player_area_progression` keeps the same invariant/schema used by `SQLiteAreaRepository`.
- **Presentation:** the existing `/api/dungeons/:dungeonId/start-simple` and Adventure Stream boundaries remain presentation-only. The browser never decides which Area is earned and no tactical dashboard was reintroduced.

## Transactional Area unlock

M5-07 intentionally uses a **fixed configured target Area**, not `highest unlocked + 1`. That distinction prevents farming an Area-1 progression boss from skipping the ordered world path. Only definitions marked `progressionAdventure` may pass their valid `unlocksAreaNumber` into completion. Ordinary dungeon clears do not mutate Area progression.

The repository ensures an Area row exists for each authoritative run participant inside the same `BEGIN IMMEDIATE` transaction, then updates only when the persisted highest-unlocked Area is below the configured target. It returns objective unlock facts only for participants whose row actually advanced; `GameService` publishes `AreaUnlocked` only after that transaction commits.

## Explicitly deferred

Boss failure/enrage stacks belong to **M5-08**. New Arc identities/content remain Phase 10 work. HUMAN playtest gates remain manual and are not satisfied by this automation/CI coverage.

## Verification

`test/progression-adventure.test.js` proves that solo starts fail, an unready pair fails, an exact ready pair succeeds and snapshots both humans, and an oversized party is rejected rather than accidentally satisfying the progression gate.

`test/progression-area-unlock.test.js` proves that:

1. a valid committed progression completion unlocks Area 2 for every snapshotted participant;
2. the completion retry is idempotent and produces no second unlock;
3. re-clearing the same fixed progression challenge remains capped at Area 2 rather than skipping forward;
4. an ordinary completion with no progression unlock target does not change Area state.

PR #79 passed `npm run check`, the full unit/contract suite, and the complete active Chromium E2E suite before merge. Post-merge `main` CI #1497 repeated the required gates successfully. M5-07 changed persistence/application behavior only and introduced no substantial browser layout change, so no new mobile visual baseline was required.

## Next ordered task

The next earliest unchecked implementation milestone is **M5-08 — add capped progression-boss death/enrage stacks and reset-on-victory**.
