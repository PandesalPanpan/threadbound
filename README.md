# Threadbound

Threadbound is a separate persistent cooperative RPG. In normal mode it authenticates through Threaded and treats Threaded as the authoritative owner of Honey. For development, it can also run completely standalone with a guarded local-auth mode.

## Current vertical slice

The playable foundation now proves solo/co-op progression **and a living in-game encyclopedia**:

1. Authenticate through Threaded OAuth2 + PKCE **or** use standalone local-development identities.
2. Create/recover a persistent Threadbound character.
3. Optionally create a party and share a six-character invite code.
4. Other players join, ready up, and are snapshotted into the run when the leader starts.
5. Enter **Frayed Hollow** solo or with up to four participants.
6. Enemy health and retaliation scale by player count; health scaling is intentionally sub-linear so cooperation is efficient without making solo impossible.
7. Players choose between Strike, Guard, Mend, and Revive.
8. The party leader chooses the shared temporary run upgrade.
9. Defeat **The First Needle**.
10. Every snapshotted participant receives their own generated weapon and Thread Dust, while the shared world arc advances once.
11. Generated discoveries and important world events automatically enter the **Threadbound Codex**.
12. Equip persistent rewards and enter future runs stronger.
13. In Threaded-auth mode, Honey purchases remain retry-safe and authoritative in Threaded.

## Living Threadbound Codex

Authenticated players can open `/codex` from the Game/Codex navigation. It is a responsive, searchable encyclopedia with category filters, counts, list/detail browsing, deep-link hashes, mechanics panels, achievement lock state, and history-to-item cross-links.

Current categories:

- **Items** — every persisted generated or purchased item instance is documented automatically from the item record. No separate wiki row is required.
- **Enemies** — projected directly from the live `DUNGEONS` domain definitions so HP/retaliation documentation cannot drift from gameplay code.
- **Bosses** — also projected from the live dungeon definition; The First Needle is the first entry.
- **Lore** — canonical narrative entries plus approved generated lore.
- **Achievements** — projected from the achievement catalog and decorated with the current player's locked/unlocked state.
- **History** — retry-safe records projected from meaningful domain events such as dungeon clears and generated-relic discoveries.

### Generated lore publication flow

AI/generated lore is treated as **content**, not executable game code:

```text
Story generator
    ↓
Draft content entry
    ↓ validation / moderation / consistency checks
Published content entry (versioned)
    ↓
Codex automatically displays it
```

`SQLiteCodexRepository.saveDraftContentEntry()` stores generated drafts. Drafts are intentionally invisible to players. `publishContentEntry()` changes the player-facing published projection. The Codex does not require new UI work for every new generated story entry.

This keeps future story generation compatible with the same principle used for generated items: generation produces constrained/versioned data while authoritative rules remain server-owned and testable.

### Fowler-style read model

The Codex deliberately behaves like a query/read model rather than another source of truth:

- `CodexService` is a query-oriented Service Layer.
- `SQLiteCodexRepository` owns Codex-specific persisted projections (`codex_content_entries`, `world_history`).
- combat facts still come from `DungeonRun`/`DUNGEONS`.
- achievement facts still come from `ACHIEVEMENTS` plus player unlock records.
- item facts still come from the persistent item instances.
- `WorldHistoryProjector` consumes domain events and creates idempotent historical records.

This is CQRS-like separation where it is useful, without introducing a separate service, database, message broker, or full Event Sourcing.

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

Open `http://127.0.0.1:3001`. The home screen offers Local Weaver A–D. To test co-op manually, sign in as one Weaver in your normal browser and another Weaver in a private/incognito window. The Codex is available at `/codex` after login.

Local auth has two hard boundaries:

- `NODE_ENV=production` rejects `THREADBOUND_AUTH_MODE=local` at startup.
- Honey purchasing is disabled in local mode because Threaded remains the only authoritative Honey wallet.

For the real integration path, use `THREADBOUND_AUTH_MODE=threaded` (the default) and configure `THREADED_BASE_URL`, `THREADED_CLIENT_ID`, and `THREADED_REDIRECT_URI`.

## Cooperative combat

Each run snapshots participant state and tracks HP, threat, damage contribution, healing, revives, and prevented damage independently.

- **Strike** — deals equipment-scaled damage and generates threat equal to effective damage.
- **Guard** — adds strong threat and halves the next enemy retaliation that lands on that player.
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

- **Service Layer** — `GameService`, `PartyService`, `HoneyPurchaseService`, `CodexService`.
- **Domain Model** — `Character`, `Party`, `DungeonRun` own rules/state transitions rather than HTTP controllers.
- **Repositories** — `SQLiteGameRepository` isolates game persistence/transactions; `SQLiteCodexRepository` isolates Codex read projections.
- **Gateway** — `ThreadedGateway` is the explicit external-system boundary.
- **Domain Events** — combat/progression facts drive achievement and world-history projection without making the application fully event-sourced.
- **Idempotency** — Honey spends, Threadbound grants, and historical projections are retry-safe.
- **Transactional shared rewards** — participant items, Thread Dust, world progress, run reward state, and party reset commit together.
- **Optimistic concurrency** — each dungeon row has a version. Stale writes fail instead of silently overwriting another participant's action.

### Party and run ownership

Party membership is mutable only while forming. Starting a dungeon snapshots member IDs into `dungeon_run_participants`. The run owns that snapshot rather than reading mutable party membership during combat.

### Honey ownership boundary

Threadbound does **not** maintain a second writable Honey balance. In Threaded mode, every spend goes through `ThreadedGateway`; Threaded remains the source of truth. In local mode the Honey UI is explicitly disabled.

### Generated-content rule

Generated items are assembled from a controlled effect vocabulary. Generators cannot invent arbitrary executable behavior or unbounded stats. Current effects include `none`, `opening_strike`, and `boss_bane`. Generated story/lore enters the versioned draft→published content path instead of modifying runtime code.

## Persistence

Node 22's built-in SQLite adapter stores players (including persistent Hunt health and potions), parties/readiness, items/equipment, dungeon participant snapshots, run state/version, achievements, shared world progress, idempotent purchase grants, published/draft Codex content, and projected world history.

The HTTP session store is still in-memory. Replace it with a durable/shared session strategy before multi-instance production deployment.

## Tests

```bash
npm install
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` runs **both** browser modes:

1. **Threaded E2E** — deterministic fake Threaded OAuth/API server, solo flow, two-browser party flow, loot/equipment, achievements/world progress, Honey retry safety, and Codex browsing of generated/purchased items.
2. **Standalone local E2E** — starts Threadbound with `THREADBOUND_AUTH_MODE=local` and no Threaded server/config; verifies co-op combat plus the living Codex UI: category counts, boss mechanics, lore search, achievement unlock state, automatic generated-item pages, world-history records, related-item navigation, and return to gameplay.

The Node suite additionally verifies that:

- enemy/boss Codex mechanics come from the live dungeon model;
- generated item instances appear without hand-written documentation;
- generated lore drafts are hidden until published;
- publishing a generated lore revision immediately makes it searchable;
- world-history projections are idempotent under repeated events;
- player-specific achievement unlock status is reflected correctly;
- existing combat, auth, Honey, transaction, and optimistic-concurrency rules remain green.

GitHub Actions gates pushes and pull requests on syntax checks, Node tests, and both Chromium Playwright suites.

## Next increments

With the Codex in place, the next high-value slice is a **Content Manifest / World Arc pipeline**: world milestones create a constrained Arc proposal containing new lore, enemies, bosses, item-effect combinations, achievements, and dungeon metadata; validation/publishing then makes those entries visible in the Codex and available to gameplay. After that, equipment set bonuses and teammate-status synergies can deepen the combat loop while the Codex automatically documents every approved addition.
