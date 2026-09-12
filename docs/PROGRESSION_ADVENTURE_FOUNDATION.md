# Progression Adventure foundation

Status: **M5-06 and M5-07 complete. M5-08 is implemented in PR #80 pending green merge verification.**

## Shipped contract

- Major progression Adventures require exactly **two ready human players by default**.
- The requirement is enforced by `ProgressionAdventurePolicy` on the server, never inferred by browser controls.
- Only the party leader may start the challenge and every required participant is resolved from persisted player state before a run exists.
- Simulated-adventurer-shaped participants cannot satisfy the human requirement. This remains important when Phase 8 adds persistent simulated adventurers.
- The current foundation deliberately reuses the existing migration-safe **Frayed Hollow** simple-combat definition through the reserved `progression-area-1` activity id. It does not author a new Arc before Phase 10.
- The resulting run snapshots both participants and uses the existing attack-only, chat-first co-op run boundary. It does not restore the legacy tactical dashboard.
- `progression-area-1` declares the fixed server-owned reward `unlocksAreaNumber: 2`. A valid first clear unlocks Area 2 for every snapshotted participant.
- The unlock is monotonic and idempotent. Re-clearing the same progression challenge cannot advance a player to Area 3, and retrying an already rewarded completion cannot duplicate the unlock.
- Unlocking advances `highest_unlocked_area_number` only. It does not silently teleport the player away from their current Area; existing Area travel remains the explicit movement boundary.
- Progression-boss failure now adds one durable Enraged stack for that progression challenge. Stacks cap at **4**.
- Each stack increases only the progression boss's base HP and retaliation by **10%**. Normal encounters are unchanged, preventing an unwinnable whole-run spiral.
- A run failure is counted at most once by run id. A valid progression victory resets the stored stack to zero.
- The next progression run snapshots the authoritative Enraged boss definition. When a stack is active, the normal chat-first start receipt states the current stack/cap and percentage consequence; there is still no tactical dashboard.

## Fowler-style boundary

- **Domain policy:** `src/domain/ProgressionAdventurePolicy.js` owns party-size, readiness, leader, and human-participant legality. `AreaProgression` owns the monotonic Area invariant. `ProgressionBossEnragePolicy` owns the cap and boss-only difficulty multiplier.
- **Service Layer:** `SimpleDungeonService` coordinates persisted party/player lookup, applies the persisted progression-boss Enrage policy before run creation, and records authoritative failed/completed run outcomes through the Enrage repository. `GameService` passes only trusted progression-definition unlock metadata into the completion transaction and publishes committed `AreaUnlocked` facts.
- **Repository:** `SQLiteGameRepository.completeRunWithRewards(...)` remains the atomic reward/Area-unlock completion boundary. `SQLiteProgressionBossEnrageRepository` owns durable boss-failure stacks and run-outcome idempotency without introducing another service boundary.
- **Presentation:** the existing `/api/dungeons/:dungeonId/start-simple` and Adventure Stream boundaries remain presentation-only. The browser never calculates Enrage or Area unlocks and no tactical dashboard was reintroduced.

## Transactional Area unlock

M5-07 intentionally uses a **fixed configured target Area**, not `highest unlocked + 1`. That distinction prevents farming an Area-1 progression boss from skipping the ordered world path. Only definitions marked `progressionAdventure` may pass their valid `unlocksAreaNumber` into completion. Ordinary dungeon clears do not mutate Area progression.

The repository ensures an Area row exists for each authoritative run participant inside the same `BEGIN IMMEDIATE` transaction, then updates only when the persisted highest-unlocked Area is below the configured target. It returns objective unlock facts only for participants whose row actually advanced; `GameService` publishes `AreaUnlocked` only after that transaction commits.

## Progression boss Enrage

M5-08 deliberately keeps the consequence modest and bounded: four stacks maximum, ten percent boss HP/retaliation per stack. The stack belongs to the progression challenge rather than a browser session or an individual party member, so both human players see the same authoritative boss state.

Failure and victory processing are retry-safe by `(run_id, outcome)`. Re-publishing the same failed-run event does not add another stack. Completion resets the challenge to zero; subsequent duplicate completion facts remain harmless. Only definitions explicitly marked as progression Adventures consume this state.

## Explicitly deferred

New Arc identities/content remain Phase 10 work. HUMAN playtest gates remain manual and are not satisfied by automation/CI coverage.

## Verification

`test/progression-adventure.test.js` proves that solo starts fail, an unready pair fails, an exact ready pair succeeds and snapshots both humans, and an oversized party is rejected rather than accidentally satisfying the progression gate.

`test/progression-area-unlock.test.js` proves first-clear unlock, retry idempotency, fixed-target re-clear behavior, and ordinary-clear isolation.

`test/progression-boss-enrage.test.js` proves the four-stack cap, boss-only 10%-per-stack scaling, failure idempotency, durable reset-on-victory, and `SimpleDungeonService` projection of persisted Enrage into the next authoritative progression definition.

M5-08 changes authoritative gameplay/persistence and receipt copy only; it does not introduce a substantial layout change, so a new mobile visual baseline is not required unless Playwright/CI reveals presentation regression.

## Next ordered task

After M5-08 is merged and green on `main`, the next earliest unchecked dependency-satisfied milestone is the first item in **Phase 6 — Towns, NPCs, Quests**.
