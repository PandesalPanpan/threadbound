# Area progression foundation

Status: **M5-01 complete — merged in PR #73 at `8884ee15`; M5-02 implemented in PR #74 pending merge/main-green reconciliation.**

## Boundary

`src/domain/AreaProgression.js` owns the invariant that a player's current Area must be at or below their highest unlocked Area. Threadbound's ordered world path is contiguous, so `highestUnlockedAreaNumber` is sufficient to prove access to every earlier Area without storing a duplicate unlock row per Area.

`src/infrastructure/SQLiteAreaRepository.js` owns durable player Area position in the shared SQLite database. Existing players are migration-safe: the first Area read lazily creates `current = 1` and `highest unlocked = 1`. The repository rejects unknown players and SQLite enforces the same current <= highest invariant.

`src/application/AreaService.js` is the M5-02 Service Layer boundary. It projects authoritative unlocked travel choices and coordinates current-Area changes through the existing Domain Model and Area repository. Browser code never grants an unlock or writes location state directly.

M5-01/M5-02 deliberately use stable canon-neutral identities (`area-1`, `area-2`, ...) and labels (`Area 1`, `Area 2`, ...). This is world-position/travel infrastructure, not new Arc content. Named Areas, Arc mappings, Adventure content, and progression unlock commands remain later ordered milestones.

## Domain and application contract

`AreaProgression` provides:

- a stable current Area projection;
- a stable highest-unlocked Area projection;
- `canVisit(areaNumber)` for travel policy composition;
- immutable `withCurrentArea(...)` and `withHighestUnlockedArea(...)` transitions;
- rejection of travel above the unlocked frontier;
- rejection of backwards highest-unlocked progression.

`AreaService` adds:

- `browse(playerId)` — projects current/highest state plus only the contiguous unlocked Area choices;
- `travel(playerId, areaNumber)` — validates through `AreaProgression`, persists through `SQLiteAreaRepository`, and publishes `AreaTraveled` only when location actually changes;
- same-Area travel is idempotent and does not create duplicate public receipts;
- locked travel fails server-side with `area_locked`, including direct API attempts that bypass presentation controls.

The Domain Model never depends on browser presentation, URLs, images, or Arc-generated executable behavior.

## Persistence

`player_area_progression` stores:

- `player_id` — one row per authoritative player;
- `current_area_number`;
- `highest_unlocked_area_number`;
- `updated_at`.

The row cascades with the player and survives normal process/database restart. Travel updates this same row; there is no browser-owned duplicate Area state.

## Adventure Stream presentation

M5-02 adds an app-like Area rich card inside the existing Adventure Stream rather than a new page. The exact `area` / `travel` commands (plus slash compatibility forms) open the card. It displays:

- current Area;
- highest unlocked Area;
- one row for each server-projected unlocked Area;
- a 44px Travel action for non-current choices;
- a disabled Current state for the active Area.

Only the server-returned unlocked list is rendered. A successful travel publishes one `AreaTraveled` domain event, which becomes one concise public Adventure Stream receipt. Historical Area cards collapse through the existing reusable rich-card snapshot behavior.

## Objective acceptance

`test/area-progression.test.js` continues to prove the M5-01 domain/repository invariants.

`test/area-service.test.js` proves:

1. browse projects current/highest state and only unlocked choices;
2. valid travel persists and publishes exactly one domain event;
3. locked travel fails without mutation or misleading receipt;
4. selecting the already-current Area is idempotent.

`test/area-stream-receipt.test.js` proves a committed `AreaTraveled` event creates one concise Adventure Stream receipt.

`test/e2e/area-rich-card.spec.js` runs at 390x844 and proves:

1. the card opens inside the Adventure Stream from the plain `area` command;
2. only authoritative unlocked Areas are presented;
3. a direct HTTP attempt to bypass the card and travel to locked Area 2 receives `area_locked` and leaves Area 1 authoritative;
4. the card fits mobile width and its dismiss/current controls meet the 44px target;
5. no retired Thread Dust / Relic Pouch / Temper language appears in the Area card;
6. a representative screenshot is emitted to `ux-review/area-rich-card-mobile.png` for visual inspection.

The active CI suite must pass syntax, unit/contract, and complete active Chromium E2E before PR #74 is mergeable. The M5-02 checklist box remains unchecked until that PR is merged and `main` is verified green.

## Next ordered task

After M5-02 is merged, checklist-reconciled, and green on `main`, the next earliest unchecked milestone is **M5-03 — allow free revisit of all previously unlocked Areas**. M5-03 should add explicit end-to-end evidence for revisiting an older Area once a player has multiple unlocked Areas; M5-02 does not pre-claim that milestone merely because its service can already represent those choices.
