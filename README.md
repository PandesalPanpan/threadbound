# Threadbound

Threadbound is a persistent cooperative **chat-first RPG**. In normal mode it authenticates through Threaded and treats Threaded as the authoritative owner of Honey. For development, it can also run standalone with guarded local authentication.

## Canonical product direction

Threadbound is now migrating toward an **EPIC-RPG-clear standalone two-player adventure RPG**: simple commands and readable receipts on the surface, with richer server-authoritative progression underneath. The Adventure Stream remains the primary application shell.

The canonical ordered product/execution checklist is **`docs/THREADBOUND_MASTER_PLAN.md`**. New gameplay work must follow that plan before expanding Arc content. In particular, the project is deliberately moving toward plain player-facing terms such as **Gold, Inventory, Equipment, Upgrade, Heal, Bank, Area, Town, Quest, Adventure, Duel, Profile, and Leaderboard**. Existing Thread Dust / Temper / Relic terminology below describes the currently shipped legacy-compatible implementation and is being migrated incrementally rather than rewritten unsafely in one step.

## Current player loop

The currently shipped player experience is intentionally smaller than the legacy tactical prototype:

```text
Hunt -> earn Thread Dust / find permanent gear
     -> Inventory: equip, Temper, or salvage
     -> Shop / Recovery when wounded
     -> Dungeon when strong enough
     -> Attack until clear or defeated
     -> reward -> Inventory -> repeat
```

This is the migration baseline, not the final target loop. See `docs/THREADBOUND_MASTER_PLAN.md` for the replacement foundation and ordered milestones.

The Adventure Stream is the primary play surface. Players can type commands directly or use at most two contextual actions near the composer.

Current contextual behavior:

- fresh/no permanent gear: **Hunt + Dungeon readiness**;
- gear exists but Attack is below the recommendation: **Hunt + Inventory**;
- Attack meets the recommendation and gear exists: **Dungeon + Inventory**;
- zero Hunt HP: **Recovery + Shop**;
- active simple dungeon: **Attack** only.

Typed commands remain available even when they are not one of the two surfaced actions. See `docs/SIMPLE_GAMEPLAY_LOOP.md` and `docs/CHAT_META_LOOP_V2.md` for the current migration baseline.

## Hunts, recovery, and Mara's shop

`hunt` resolves one short solo encounter. Hunt damage persists instead of resetting after every command. Outside active dungeons, Hunt HP regenerates lazily at one HP per minute.

Health potions restore up to 12 Hunt HP. New characters begin with one potion, Hunts may find more, and Mara's in-thread field shop provides a recovery sink for Thread Dust.

Shop offers are server-owned:

- `ShopCatalog` defines the allowlisted offers and prices;
- `ShopService` projects the current catalog/affordability and coordinates purchases;
- SQLite performs the atomic Thread Dust / potion transaction;
- the browser renders `/api/shop` and does not own economy prices or purchase effects.

The current shelf is intentionally small: one health potion or a discounted three-potion satchel. That catalog can expand later without embedding economy rules into the chat presentation.

## Inventory and permanent progression

`inventory` and `gear` open the same authoritative Relic pouch rather than separate inventory implementations. Permanent equipment can be equipped, Tempered, or salvaged for Thread Dust subject to server-side rules.

Generated item identity and mechanics are constrained data. Runtime visuals use stable semantic `visualAssetId` references so artwork can change without changing canonical gameplay identity.

## Simple dungeons

New player-facing dungeons use the simplified combat path. Frayed Hollow is currently a readable progression check: the baseline Weaver begins at 6 Attack while the canonical dungeon recommends 9+.

Simple dungeon rules intentionally remove the tactical dashboard:

- Attack is the only combat command;
- no Focus;
- no Guard or Interrupt;
- no combat skills;
- no temporary run powers;
- no random run-event buff choices;
- party/run state remains server-authoritative and durable across reload/reconnect.

The old tactical `DungeonRun` behavior and legacy route remain temporarily available for old persisted runs and focused regression/migration coverage. This is a strangler-style transition; legacy mechanics are not the default player-facing loop.

## Cooperative play and realtime stream

Players can create a party, share a join code, ready up, and start a shared dungeon. Starting a run snapshots its participants so later party membership changes cannot rewrite run ownership.

The shared Adventure Stream carries both player chat and Threadbound system receipts. WebSocket is the preferred realtime transport with SSE fallback. Realtime transport never decides game outcomes: HTTP application commands invoke authoritative services/domain rules, committed outcomes are persisted, then state/stream changes are broadcast.

## Living Threadbound Codex

Authenticated players can open `/codex` from navigation or search it through the thread. It is a responsive, searchable encyclopedia built from authoritative game/content state rather than manually duplicated wiki facts.

Current categories include:

- **Items** — persisted generated or purchased item instances;
- **Enemies / Bosses** — projected from authoritative dungeon/content definitions;
- **Lore** — canonical narrative plus approved generated content;
- **Achievements** — catalog entries decorated with player unlock state;
- **History** — retry-safe records projected from meaningful domain events.

Generated lore/content follows a constrained draft -> validate/review -> publish flow. Generated content is data, not executable game code.

## Arc Manifest workflow

Arc Manifests are portable, untrusted content contracts for new narrative, encounters, rewards, achievements, and allowlisted visual references. The Arc Workshop can validate and publish manifests in local development without requiring a paid AI API.

See `docs/ARC_MANIFEST_WORKFLOW.md` and the manifest schema for the current authoring contract. The master plan intentionally postpones new Arc expansion until the simpler Gold/Level/Equipment/Inventory/Shop/Bank/automatic-combat foundation is coherent end-to-end.

## Architecture

Threadbound remains a **modular monolith**. Fowler-style patterns are used where they solve concrete boundaries without premature microservices or full event sourcing.

- **Service Layer** — `GameService`, `HuntService`, `SimpleDungeonService`, `ShopService`, `InventoryService`, `PartyService`, `CodexService`, `ArcManifestService`, `HoneyPurchaseService`.
- **Domain Model / policies** — characters, parties, runs, Hunt resolution, simple-dungeon rules, relic progression, and constrained content vocabularies own gameplay rules.
- **Repositories** — SQLite repositories isolate persistence and transaction boundaries.
- **Gateway** — `ThreadedGateway` is the external Threaded boundary.
- **Domain events / projections** — committed game facts drive achievements, world history, activity-stream receipts, and realtime notifications.
- **Idempotency / optimistic concurrency** — external Honey grants and mutating run commands are retry-safe; stale run versions fail instead of silently overwriting another action.

The activity stream, Codex, shop catalog response, and dashboard are read/projection surfaces. They do not become alternate sources of gameplay truth.

### Honey ownership boundary

Threadbound does **not** maintain a second writable Honey wallet. In Threaded mode, Honey spending goes through `ThreadedGateway`; Threaded remains the source of truth. Local mode disables Honey purchasing.

## Persistence and sessions

Node 22's built-in SQLite adapter stores players (including persistent Hunt health and potions), parties/readiness, items/equipment, dungeon participant snapshots, run state/version, achievements, world progress, idempotent purchase grants, Arc/Codex content, world history, and activity-stream state.

Authenticated HTTP sessions use the SQLite-backed `SQLiteSessionStore`, so a signed `threadbound.sid` can resolve after application/database restart and multiple Node processes sharing the same authoritative SQLite file can read the same session state.

Explicit long-lived run expiry/abandon semantics remain a production gate; see `docs/PLAYER_EXPERIENCE_ACCEPTANCE.md` and Phase 12 of the master plan.

## Running locally without Threaded

Threaded is **not required** for local gameplay/testing.

Create `.env` with at least:

```env
PORT=3001
SESSION_SECRET=replace-with-a-long-random-secret
THREADBOUND_DB_PATH=./data/threadbound.sqlite
THREADBOUND_AUTH_MODE=local
```

Then:

```bash
npm install
npm start
```

Open `http://127.0.0.1:3001`. The home screen currently offers Local Weaver A-D; this legacy player-facing naming is part of the planned terminology migration. To test co-op manually, sign in as one local profile in a normal browser and another in a private/incognito window.

Local auth has two hard boundaries:

- `NODE_ENV=production` rejects `THREADBOUND_AUTH_MODE=local` at startup;
- Honey purchasing is unavailable because Threaded owns the authoritative Honey wallet.

For the real integration path, use `THREADBOUND_AUTH_MODE=threaded` and configure `THREADED_BASE_URL`, `THREADED_CLIENT_ID`, and `THREADED_REDIRECT_URI`.

## Tests

```bash
npm install
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

GitHub Actions gates pushes and pull requests on syntax checks, Node/unit-contract tests, and the active Chromium Playwright suites.

The browser acceptance coverage includes the current chat-first Hunt loop, compact receipts, recovery/shop UI, contextual Inventory navigation, simple solo/co-op dungeons, realtime continuity, Codex behavior, Arc Workshop behavior, and representative mobile screenshots.

`docs/PLAYER_EXPERIENCE_ACCEPTANCE.md` remains the broader pre-merge experience/reliability checklist. HUMAN items still require real-player evidence; automation does not prove that a loop is fun.

## Next increments

Do **not** use this section to improvise the roadmap. Follow the ordered checklist in `docs/THREADBOUND_MASTER_PLAN.md`.

The immediate target is the migration-safe foundation:

```text
profile -> hunt -> level / earn Gold
        -> inventory / equip / upgrade
        -> shop / buy / sell
        -> bank
        -> heal
        -> hunt again
```

with generated sprites, polished chat receipts/cards, server-authoritative progression, simple terminology, and green automated/mobile gates. Areas, Adventure, Towns, Quests, simulated adventurers, Duels, gambling, and new Arc content follow in their ordered phases.
