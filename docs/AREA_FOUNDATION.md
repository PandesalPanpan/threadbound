# Area progression foundation

Status: **M5-01 complete — merged in PR #73 at `8884ee15`; M5-02 complete — merged in PR #74 at `fbf8cf37`, with merged `main` CI #1437 green; M5-03 complete — merged in PR #75 at `a2ed6cb8`, with merged `main` CI #1445 green.**

## Boundary

`src/domain/AreaProgression.js` owns the invariant that a player's current Area must be at or below their highest unlocked Area. Threadbound's ordered world path is contiguous, so `highestUnlockedAreaNumber` is sufficient to prove access to every earlier Area without storing a duplicate unlock row per Area.

`src/infrastructure/SQLiteAreaRepository.js` owns durable player Area position in the shared SQLite database. Existing players are migration-safe: the first Area read lazily creates `current = 1` and `highest unlocked = 1`. The repository rejects unknown players and SQLite enforces the same current <= highest invariant.

`src/application/AreaService.js` is the Service Layer boundary. It projects authoritative unlocked travel choices and coordinates current-Area changes through the existing Domain Model and Area repository. Browser code never grants an unlock or writes location state directly.

M5-01 through M5-03 deliberately use stable canon-neutral identities (`area-1`, `area-2`, ...) and labels (`Area 1`, `Area 2`, ...). This is world-position/travel infrastructure, not new Arc content. Named Areas, Arc mappings, Adventure content, and progression unlock commands remain later ordered milestones.

## Domain and application contract

`AreaProgression` provides:

- a stable current Area projection;
- a stable highest-unlocked Area projection;
- `canVisit(areaNumber)` for travel policy composition;
- immutable `withCurrentArea(...)` and `withHighestUnlockedArea(...)` transitions;
- rejection of travel above the unlocked frontier;
- rejection of backwards highest-unlocked progression.

`AreaService` adds:

- `browse(playerId)` — projects current/highest state plus every contiguous unlocked Area choice;
- `travel(playerId, areaNumber)` — validates through `AreaProgression`, persists through `SQLiteAreaRepository`, and publishes `AreaTraveled` only when location actually changes;
- any Area at or below `highestUnlockedAreaNumber` remains visitable, so moving back to an older Area never lowers or consumes the unlock frontier;
- same-Area travel is idempotent and does not create duplicate public receipts;
- locked travel fails server-side with `area_locked`, including direct API attempts that bypass presentation controls.

The Domain Model never depends on browser presentation, URLs, images, or Arc-generated executable behavior.

## Persistence

`player_area_progression` stores:

- `player_id` — one row per authoritative player;
- `current_area_number`;
- `highest_unlocked_area_number`;
- `updated_at`.

The row cascades with the player and survives normal process/database restart. Travel updates this same row; there is no browser-owned duplicate Area state. Revisiting an older Area changes only `current_area_number`; `highest_unlocked_area_number` remains durable and monotonic.

## Adventure Stream presentation

M5-02 adds an app-like Area rich card inside the existing Adventure Stream rather than a new page. The exact `area` / `travel` commands (plus slash compatibility forms) open the card. It displays:

- current Area;
- highest unlocked Area;
- one row for each server-projected unlocked Area;
- a 44px Travel action for non-current choices;
- a disabled Current state for the active Area.

M5-03 keeps all previously unlocked rows available after each successful revisit. The browser renders the server projection returned after travel; it does not infer, consume, or mutate unlock state locally.

Only the server-returned unlocked list is rendered. A successful travel publishes one `AreaTraveled` domain event, which becomes one concise public Adventure Stream receipt. Historical Area cards collapse through the existing reusable rich-card snapshot behavior.

## Objective acceptance

`test/area-progression.test.js` continues to prove the M5-01 domain/repository invariants.

`test/area-service.test.js` proves:

1. browse projects current/highest state and only unlocked choices;
2. valid travel persists and publishes exactly one domain event;
3. with Areas 1-3 unlocked, travel 3 -> 1 -> 2 -> 3 remains legal and keeps highest-unlocked at Area 3 throughout;
4. each real location change publishes the corresponding authoritative `AreaTraveled` transition without changing the unlock frontier;
5. locked travel fails without mutation or misleading receipt;
6. selecting the already-current Area is idempotent.

`test/area-stream-receipt.test.js` proves a committed `AreaTraveled` event creates one concise Adventure Stream receipt.

`test/e2e/area-rich-card.spec.js` runs at 390x844 and proves:

1. the card opens inside the Adventure Stream from the plain `area` command;
2. only authoritative unlocked Areas are presented;
3. a direct HTTP attempt to bypass the card and travel to locked Area 2 receives `area_locked` and leaves Area 1 authoritative;
4. the card can present a server projection with Areas 1-3 unlocked and keeps older Areas tappable while moving 3 -> 1 -> 2 -> 3;
5. current/highest labels update independently, so revisiting Area 1 still shows the Area 3 unlock frontier;
6. the card fits mobile width and its dismiss/current controls meet the 44px target;
7. no retired Thread Dust / Relic Pouch / Temper language appears in the Area card;
8. a representative screenshot is emitted to `ux-review/area-rich-card-mobile.png` for visual inspection.

The Playwright multi-Area projection is presentation-contract coverage only; authoritative revisit legality and persistence are proven by the real Domain Model + SQLite repository/service test above. No test-only production unlock endpoint was introduced merely to pre-empt M5-06 progression unlocking.

PR #75 passed `npm run check`, the full unit/contract suite, and the complete active Chromium E2E suite before merge. Merged `main` CI #1445 repeated both required jobs successfully. M5-03 made no shipped layout change, so the existing 390x844 Area-card visual baseline remains applicable rather than requiring a new visual redesign pass.

## Next ordered task

The next earliest unchecked milestone is **M5-04 — implement ordinary Adventure activity using shared battle/world policies**.
