# Threadbound

Threadbound is a separate persistent cooperative RPG. In normal mode it authenticates through Threaded and treats Threaded as the authoritative owner of Honey. For development, it can also run completely standalone with a guarded local-auth mode.

## Current vertical slice

The playable foundation now proves solo and cooperative progression:

1. Authenticate through Threaded OAuth2 + PKCE **or** use standalone local-development identities.
2. Create/recover a persistent Threadbound character.
3. Optionally create a party and share a six-character invite code.
4. Other players join, ready up, and are snapshotted into the run when the leader starts.
5. Enter **Frayed Hollow** solo or with up to four participants.
6. Enemy health and retaliation scale by player count; health scaling is intentionally sub-linear so cooperation is efficient without making solo impossible.
7. Players choose between direct damage and cooperative combat actions: Strike, Guard, Mend, and Revive.
8. The party leader chooses the shared temporary run upgrade.
9. Defeat **The First Needle**.
10. Every snapshotted participant receives their own generated weapon and Thread Dust, while the shared world arc advances once.
11. Equip persistent rewards and enter future runs stronger.
12. In Threaded-auth mode, Honey purchases remain retry-safe and authoritative in Threaded.

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

Open `http://127.0.0.1:3001`. The home screen offers Local Weaver A–D. To test co-op manually, sign in as one Weaver in your normal browser and another Weaver in a private/incognito window.

Local auth has two hard boundaries:

- `NODE_ENV=production` rejects `THREADBOUND_AUTH_MODE=local` at startup.
- Honey purchasing is disabled in local mode because Threaded remains the only authoritative Honey wallet.

For the real integration path, use `THREADBOUND_AUTH_MODE=threaded` (the default) and configure `THREADED_BASE_URL`, `THREADED_CLIENT_ID`, and `THREADED_REDIRECT_URI`.

## Cooperative combat

Each run snapshots participant state and tracks HP, threat, damage contribution, healing, revives, and prevented damage independently.

- **Strike** — deals equipment-scaled damage and generates threat equal to effective damage.
- **Guard** — adds strong threat and halves the next enemy retaliation that lands on that player. This lets one player deliberately protect allies by pulling aggro.
- **Mend** — heals a living ally for up to 8 HP, once per encounter per acting player.
- **Revive** — restores a downed ally to 30% HP, once per run per acting player. Self-revive is not allowed.

Enemy retaliation targets the living participant with the highest current threat. Threat decays after retaliation. A downed player cannot act until revived, but surviving party members can continue. The run fails only when everyone is down.

Frayed Hollow supports 1–4 players and recommends 2:

| Players | Enemy HP | Retaliation |
| ---: | ---: | ---: |
| 1 | ×1.00 | ×1.00 |
| 2 | ×1.65 | ×1.15 |
| 3 | ×2.25 | ×1.30 |
| 4 | ×2.80 | ×1.45 |

## Architecture

Threadbound remains a **modular monolith**. Fowler-style enterprise application patterns are used where they solve real backend problems without premature microservices or full event sourcing.

- **Service Layer** — `GameService`, `PartyService`, `HoneyPurchaseService`.
- **Domain Model** — `Character`, `Party`, `DungeonRun` own rules/state transitions rather than HTTP controllers.
- **Repository** — `SQLiteGameRepository` isolates persistence and transactions.
- **Gateway** — `ThreadedGateway` is the explicit external-system boundary.
- **Domain Events** — combat/progression facts drive achievement projection without making the application fully event-sourced.
- **Idempotency** — Honey spends and Threadbound grants remain retry-safe.
- **Transactional shared rewards** — participant items, Thread Dust, world progress, run reward state, and party reset commit together.
- **Optimistic concurrency** — each dungeon row has a version. Stale writes fail instead of silently overwriting another participant's action.

### Party and run ownership

Party membership is mutable only while forming. Starting a dungeon snapshots member IDs into `dungeon_run_participants`. The run owns that snapshot rather than reading mutable party membership during combat.

### Honey ownership boundary

Threadbound does **not** maintain a second writable Honey balance. In Threaded mode, every spend goes through `ThreadedGateway`; Threaded remains the source of truth. In local mode the Honey UI is explicitly disabled.

### Generated-content rule

Generated items are assembled from a controlled effect vocabulary. Generators cannot invent arbitrary executable behavior or unbounded stats. Current effects include `none`, `opening_strike`, and `boss_bane`. The same pattern will later constrain generated armor, enemies, bosses, and story content.

## Persistence

Node 22's built-in SQLite adapter stores players, parties/readiness, items/equipment, dungeon participant snapshots, run state/version, achievements, shared world progress, and idempotent purchase grants.

The HTTP session store is still in-memory. Replace it with a durable/shared session strategy before multi-instance production deployment.

## Tests

```bash
npm install
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` now runs **both** browser modes:

1. **Threaded E2E** — deterministic fake Threaded OAuth/API server, solo flow, two-browser party flow, loot/equipment, achievements/world progress, and Honey retry safety.
2. **Standalone local E2E** — starts Threadbound with `THREADBOUND_AUTH_MODE=local` and no Threaded server/config, signs in two local Weavers, verifies UI panels/readiness gating, downs a player, Revives them, Mends an ally, verifies Guard damage prevention/aggro, completes the dungeon, verifies shared rewards, verifies Honey is disabled, and signs out.

The Node suite additionally covers domain rules, local-auth production safety, support-charge rules, co-op scaling, transaction behavior, Honey idempotency, and stale-write optimistic concurrency.

GitHub Actions gates pushes and pull requests on syntax checks, Node tests, and both Chromium Playwright suites.

## Next increments

The next useful gameplay layers are equipment effects that modify Guard/Mend/Revive, status combinations between teammates, item rarity/set bonuses, stronger enemy telegraphs, and world-arc milestones. The current run/version and domain-event boundaries are designed so those can be added without moving game rules into controllers.
