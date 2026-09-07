# Threadbound

Threadbound is a separate persistent RPG that authenticates through Threaded and treats Threaded as the authoritative owner of Honey.

## Current vertical slice

The first playable foundation proves this loop:

1. Authenticate with Threaded via OAuth2 Authorization Code + PKCE.
2. Create/recover the persistent Threadbound character for that Threaded user.
3. Enter **Frayed Hollow**.
4. Clear three encounters.
5. Choose a temporary run upgrade.
6. Defeat **The First Needle**.
7. Receive a generated weapon assembled only from registered item/effect vocabulary.
8. Equip it and increase permanent attack power.
9. Unlock achievements and contribute to shared world-arc progress.
10. Retry a Honey purchase safely without a duplicate Threadbound grant or duplicate Threaded spend.

## Architecture

Threadbound intentionally starts as a **modular monolith**. Fowler-style enterprise application patterns are used where they solve real game-backend problems, without premature microservices or full event sourcing.

- **Service Layer** — `GameService` and `HoneyPurchaseService` coordinate use cases.
- **Domain Model** — `Character` and `DungeonRun` own game rules and state transitions instead of HTTP controllers.
- **Repository** — persistence is behind `SQLiteGameRepository`; application and HTTP code do not issue SQL.
- **Gateway** — Threaded OAuth/API calls remain behind `ThreadedGateway`, an explicit boundary between the applications.
- **Domain Events** — facts such as `EnemyDefeated`, `DungeonCompleted`, and `ItemEquipped` are published. Achievements consume those events. Threadbound is deliberately not fully event-sourced yet.
- **Idempotency** — Honey spending is authoritative in Threaded. Threadbound stores the resulting grant keyed by player + idempotency key and verifies retry transaction identity before granting again.

### Ownership boundary

Threadbound does **not** maintain a second Honey balance. The wallet held in the session is only the most recently observed Threaded value. Every spend goes through `ThreadedGateway`; Threaded remains the source of truth.

### Generated-content rule

Generated items are data assembled from a controlled effect vocabulary. Generators cannot invent arbitrary executable behavior or unbounded stats. The implemented effects are:

- `none`
- `opening_strike` — +2 on the first strike of each encounter
- `boss_bane` — +2 against bosses

This is the base pattern for later generated weapons, armor, enemies, and lore: generation chooses from rules we can validate, test, balance, and version.

## Persistence

Node 22's built-in SQLite adapter stores players, generated/purchased items, equipped items, dungeon runs, achievements, shared world progress, and idempotent purchase grants.

The HTTP session store is still in-memory. That is acceptable for this vertical slice but must be replaced by a durable/shared session strategy before multi-instance production deployment.

## Tests

```bash
npm install
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

The Node suite covers domain rules, persistence, service orchestration, PKCE, Threaded gateway contracts, generated-item constraints, and Honey grant idempotency.

The Playwright suite starts a deterministic fake Threaded OAuth/API provider and performs the user journey end-to-end: OAuth authorization, character creation, dungeon combat, upgrade choice, boss victory, generated loot, equipment progression, achievements, world progression, and retry-safe Honey spending.

GitHub Actions runs both the Node suite and Chromium Playwright E2E on pushes and pull requests.

## Next architectural increments

This is deliberately a vertical slice, not the finished game. The next systems should build on these boundaries rather than bypass them: co-op party/run ownership, player-count difficulty scaling, richer effect composition, item rarity/sets, world-arc milestones, and eventually constrained lore generation.
