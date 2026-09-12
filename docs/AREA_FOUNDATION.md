# Area progression foundation

Status: **M5-01 complete — merged in PR #73 at `8884ee15`; post-merge main CI #1420 is green.**

## Boundary

`src/domain/AreaProgression.js` owns the invariant that a player's current Area must be at or below their highest unlocked Area. Threadbound's ordered world path is contiguous, so `highestUnlockedAreaNumber` is sufficient to prove access to every earlier Area without storing a duplicate unlock row per Area.

`src/infrastructure/SQLiteAreaRepository.js` owns durable player Area position in the shared SQLite database. Existing players are migration-safe: the first Area read lazily creates `current = 1` and `highest unlocked = 1`. The repository rejects unknown players and SQLite enforces the same current <= highest invariant.

M5-01 deliberately uses stable canon-neutral identities (`area-1`, `area-2`, ...) and labels (`Area 1`, `Area 2`, ...). This is world-position infrastructure, not new Arc content. Named Areas, Arc mappings, travel cards, and actual unlock commands are introduced only by their later ordered milestones.

## Domain contract

`AreaProgression` provides:

- a stable current Area projection;
- a stable highest-unlocked Area projection;
- `canVisit(areaNumber)` for later travel policy composition;
- immutable `withCurrentArea(...)` and `withHighestUnlockedArea(...)` transitions;
- rejection of travel above the unlocked frontier;
- rejection of backwards highest-unlocked progression.

The Domain Model never depends on browser presentation, URLs, images, or Arc-generated executable behavior.

## Persistence

`player_area_progression` stores:

- `player_id` — one row per authoritative player;
- `current_area_number`;
- `highest_unlocked_area_number`;
- `updated_at`.

The row cascades with the player and survives normal process/database restart. M5-02/M5-03 can consume this repository rather than inventing browser-owned location state.

## Objective acceptance

`test/area-progression.test.js` proves:

1. new progression starts in Area 1;
2. Area identity is deterministic and canon-neutral;
3. current Area cannot exceed highest unlocked Area;
4. highest unlocked progress cannot move backwards through the Domain Model;
5. previously unlocked Areas remain visitable by policy;
6. SQLite lazily initializes existing players and persists current/highest state across repository restart;
7. unknown players cannot receive orphaned Area state.

PR #73 passed `npm run check`, the complete unit/contract suite, and the complete active Chromium Playwright suite before merge. Post-merge `main` CI #1420 passed the same gates. No browser presentation changed in M5-01, so no new mobile screenshot was required.

## Next ordered task

The next earliest unchecked milestone is **M5-02 — add Area rich card / travel selection entirely through the Adventure Stream**.
