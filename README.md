# Threadbound

Threadbound is a persistent cooperative **chat-first RPG**. In normal mode it authenticates through Threaded and treats Threaded as the authoritative owner of Honey. For development, it can also run standalone with guarded local authentication.

## Canonical product direction

Threadbound is a **standalone two-player adventure RPG**: simple commands and readable receipts on the surface, with server-authoritative progression underneath. The Adventure Stream remains the primary application shell.

The canonical ordered product/execution checklist is **`docs/THREADBOUND_MASTER_PLAN.md`**. Follow it before expanding Arc content. Player-facing terms include **Gold, Inventory, Equipment, Upgrade, Heal, Bank, Area, Town, Quest, Adventure, Duel, Profile, and Leaderboard**. Legacy persistence and API names remain only where compatibility requires them.

## Current player loop

The connected player loop is:

```text
Hunt -> earn XP / Gold / Area-specific loot
     -> Quest progress, NPCs, Inventory, and Equipment upgrades
     -> party progression Dungeon with Mana skills and multi-enemy battles
     -> replay the committed result, then use the shared intermission Heal if needed
     -> clear the challenge -> unlock and travel to the next Area
     -> stronger Hunts, new Quests and NPC context, better loot -> repeat
```

Hunt, Adventure, Quest, Duel, and Dungeon outcomes are resolved on the server. The browser presents persisted state and replays committed combat; it does not calculate game rules. See `docs/SIMPLE_GAMEPLAY_LOOP.md` and the focused foundation docs for mechanics.

The Adventure Stream is the primary play surface. Players can type commands directly or use at most two contextual actions near the composer.

Current contextual behavior:

- fresh/no permanent gear: **Hunt + Dungeon readiness**;
- gear exists but Attack is below the recommendation: **Hunt + Inventory**;
- Attack meets the recommendation and gear exists: **Dungeon + Inventory**;
- zero Hunt HP: **Recovery + Shop**;
- active shared Dungeon: the latest Dungeon card owns the battle replay; after
  playback, both participants see the intermission Heal state while only the
  leader can Continue or Leave.

Typed commands remain available even when they are not one of the two surfaced actions. See `docs/SIMPLE_GAMEPLAY_LOOP.md` and `docs/CHAT_META_LOOP_V2.md` for the current migration baseline.

## Hunts, recovery, and Mara's shop

`hunt` resolves a short encounter from the player's current Area. Area-authored
enemies, rewards, and loot improve along the four-Area progression ladder.
Hunt damage persists instead of resetting after every command. Outside active
dungeons, Hunt HP regenerates lazily at one HP per minute.

Minor Health Potions restore up to 8 Hunt HP. New characters begin with one potion, Hunts may find more, and Mara's in-thread field shop provides a recovery sink for Gold. Higher potion tiers unlock with later Areas.

Shop offers are server-owned:

- `ShopCatalog` defines the allowlisted offers and prices;
- `ShopService` projects the current catalog/affordability and coordinates purchases;
- SQLite performs atomic Gold / potion transactions;
- the browser renders `/api/shop` and does not own economy prices or purchase effects.

Offers, prices, and Area potion availability remain server-owned. Inventory,
Shop, Hunt, Adventure, and Dungeon receipts use canonical item projections and
semantic item artwork.

## Inventory and permanent progression

Inventory contains generated and purchased equipment across Weapon, Helmet,
Armor, Boots, and Accessory slots. Equipment families affect their stats:
weapons favor Attack, armor favors Defense and Max HP, boots favor Speed, and
accessories favor critical chance and utility. Equipment can be equipped,
upgraded, or sold using server-side rules.

Level growth increases base Max HP while preserving damage already taken.
Generated item identity and mechanics are constrained data. New items use the
official Figma item library; old visual IDs resolve through a compatibility
policy. Runtime visuals use stable semantic `visualAssetId` references.

## Simple dungeons

Progression Dungeons connect Areas 1–4. Their committed rooms can contain one
to three simultaneous enemies, including boss adds. Each battle uses the real
party and authored encounter roster.

The Adventure Stream keeps Dungeon play concise:

- the server resolves automatic combat, including Mana gain, signature skills,
  status effects, and encounter composition;
- the browser replays committed HP, Mana, target, and skill changes before
  showing the result or intermission actions;
- one participant may spend their own potion for their own HP at each
  intermission; both participants see when the shared Heal opportunity is used;
- party/run state remains server-authoritative and durable across reload and
  reconnect.

Legacy run records continue to hydrate through compatibility paths.

## Cooperative play and realtime stream

Players can create a party, share a join code, ready up, and start a shared dungeon. Starting a run snapshots its participants so later party membership changes cannot rewrite run ownership.

The shared Adventure Stream carries player chat, NPC dialogue, and concise
Threadbound receipts. WebSocket is the preferred realtime transport with SSE
fallback. Realtime transport never decides game outcomes: HTTP application
commands invoke authoritative services/domain rules, committed outcomes are
persisted, then state/stream changes are broadcast.

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

See `docs/ARC_MANIFEST_WORKFLOW.md` and the manifest schema for the current authoring contract. New Arc expansion follows the ordered master plan; published Arc content remains validated data and never introduces executable game rules.

## Architecture

Threadbound remains a **modular monolith**. Fowler-style patterns are used where they solve concrete boundaries without premature microservices or full event sourcing.

- **Service Layer** — `GameService`, `HuntService`, `AdventureService`, `SimpleDungeonService`, `DuelService`, `QuestService`, `TownService`, `ShopService`, `InventoryService`, `PartyService`, and `CodexService` coordinate use cases.
- **Domain Model / policies** — characters, equipment, Area content, quests, parties, runs, automatic battle skills, Dungeon rules, growth, and constrained content vocabularies own gameplay rules.
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

## Combat prototypes

The current branch includes two isolated local experiments: `/active-timing`
for manual attack/defense timing and `/arena-combat` for an overhead 3v3 arena.
In the Arena Lab, select teammates, place them in the deployment zone, and
watch automatic movement, targeting, attacks, and skills. Pause, playback speed,
replay, and reposition controls help compare formations. These prototypes do
not grant rewards or save player progress. See `docs/ARENA_COMBAT_PROTOTYPE.md`.

The overhead arena is the owner-approved authoritative combat direction for
every live encounter. The current Arena Lab remains an isolated comparison
experiment while the reusable server-side engine is integrated across Hunt,
Adventure, Duel, Dungeon, and Arc encounters. See
[`docs/ARENA_COMBAT_INTEGRATION.md`](docs/ARENA_COMBAT_INTEGRATION.md) and the
parallel Phase M checklist in the master plan.

## Tests

```bash
npm install
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

GitHub Actions gates pushes and pull requests on syntax checks, Node/unit-contract tests, and the active Chromium Playwright suites.

The browser acceptance coverage includes Area progression, Quest rotation,
contextual NPC dialogue, canonical item art, Mana skill playback, Duel replays,
multi-enemy co-op Dungeons, intermission healing, reconnect recovery, Codex and
Arc Workshop behavior, and mobile/desktop screenshots.

`docs/PLAYER_EXPERIENCE_ACCEPTANCE.md` remains the broader pre-merge experience/reliability checklist. HUMAN items still require real-player evidence; automation does not prove that a loop is fun.

## Next increments

Do **not** use this section to improvise the roadmap. Follow the ordered checklist in `docs/THREADBOUND_MASTER_PLAN.md`.

The RPG progression increment is implemented on `feat/rpg-progression-loop`
and documented in `docs/SIMPLE_GAMEPLAY_LOOP.md`. Keep Phase K's human
experience gates and Phase L's production lifecycle gates in
`docs/THREADBOUND_MASTER_PLAN.md` open until their evidence exists. Branch-local
green tests do not replace merge and `main` CI verification.
