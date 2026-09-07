# Threadbound

Threadbound is a separate persistent cooperative RPG that authenticates through Threaded and treats Threaded as the authoritative owner of Honey.

## Current vertical slice

The playable foundation now proves both solo and two-player cooperative progression:

1. Authenticate with Threaded via OAuth2 Authorization Code + PKCE.
2. Create/recover the persistent Threadbound character for that Threaded user.
3. Optionally create a party and share a six-character invite code.
4. Other authenticated players join, ready up, and are snapshotted into the run when the leader starts.
5. Enter **Frayed Hollow** solo or with up to four participants.
6. Enemy health and retaliation scale by player count; health scaling is intentionally sub-linear so cooperation is efficient without making solo impossible.
7. Each player has independent HP, first-strike state, equipment effects, and recorded damage contribution.
8. The party leader chooses the shared temporary run upgrade.
9. Defeat **The First Needle**.
10. Every snapshotted participant receives their own generated weapon and Thread Dust, while the shared world arc advances once for the completed run.
11. Equip persistent rewards and enter future runs stronger.
12. Retry a Honey purchase safely without a duplicate Threadbound grant or duplicate Threaded spend.

## Architecture

Threadbound intentionally remains a **modular monolith**. Fowler-style enterprise application patterns are used where they solve real game-backend problems, without premature microservices or full event sourcing.

- **Service Layer** — `GameService`, `PartyService`, and `HoneyPurchaseService` coordinate use cases.
- **Domain Model** — `Character`, `Party`, and `DungeonRun` own game rules and state transitions instead of HTTP controllers.
- **Repository** — persistence is behind `SQLiteGameRepository`; application and HTTP code do not issue SQL.
- **Gateway** — Threaded OAuth/API calls remain behind `ThreadedGateway`, an explicit boundary between the applications.
- **Domain Events** — facts such as `EnemyDefeated`, `DungeonCompleted`, and `ItemEquipped` are published. Achievements consume those events. Threadbound is deliberately not fully event-sourced yet.
- **Idempotency** — Honey spending is authoritative in Threaded. Threadbound stores the resulting grant keyed by player + idempotency key and verifies retry transaction identity before granting again.
- **Transactional shared rewards** — all participant items, Thread Dust, world progress, run reward state, and party reset are committed in one SQLite transaction so a co-op completion cannot partially reward only some members.

### Party and run ownership

Party membership is mutable only while the party is forming. Starting a dungeon snapshots the current member IDs into `dungeon_run_participants`; that snapshot owns the run even if future party membership changes after completion.

A party-owned run has one leader for coordination, but combat actions are individual. Each participant can attack with their own permanent equipment and HP state. A downed player cannot act, while surviving party members can continue the run. The run fails only when every participant is down.

Frayed Hollow currently supports 1–4 players and recommends 2. Scaling multipliers are deterministic and server-owned:

| Players | Enemy HP | Retaliation |
| ---: | ---: | ---: |
| 1 | ×1.00 | ×1.00 |
| 2 | ×1.65 | ×1.15 |
| 3 | ×2.25 | ×1.30 |
| 4 | ×2.80 | ×1.45 |

This deliberately makes a strong solo character viable while giving coordinated players a real efficiency advantage.

### Ownership boundary

Threadbound does **not** maintain a second Honey balance. The wallet held in the session is only the most recently observed Threaded value. Every spend goes through `ThreadedGateway`; Threaded remains the source of truth.

### Generated-content rule

Generated items are data assembled from a controlled effect vocabulary. Generators cannot invent arbitrary executable behavior or unbounded stats. The implemented effects are:

- `none`
- `opening_strike` — +2 on that player's first strike of each encounter
- `boss_bane` — +2 against bosses

This is the base pattern for later generated weapons, armor, enemies, and lore: generation chooses from rules we can validate, test, balance, and version.

## Persistence

Node 22's built-in SQLite adapter stores players, parties, party readiness, generated/purchased items, equipped items, dungeon runs, run participant snapshots, achievements, shared world progress, and idempotent purchase grants.

The HTTP session store is still in-memory. That is acceptable for this vertical slice but must be replaced by a durable/shared session strategy before multi-instance production deployment.

## Tests

```bash
npm install
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

The Node suite covers domain rules, solo compatibility, party capacity/readiness/leadership, player-count scaling, per-player contribution, persistence, shared transactional rewards, service orchestration, PKCE, Threaded gateway contracts, generated-item constraints, and Honey grant idempotency.

The Playwright suite starts a deterministic fake Threaded OAuth/API provider. It runs both the original solo journey and a real cooperative journey using two isolated Chromium browser contexts: two Threaded logins, party creation, invite-code join, readiness, a leader-started shared run, alternating participant attacks, leader-owned upgrade choice, shared completion rewards, achievements, and world progression.

GitHub Actions runs both the Node suite and Chromium Playwright E2E on pushes and pull requests.

## Next architectural increments

This is still intentionally a vertical slice. The next systems should build on these boundaries rather than bypass them: richer cooperative roles/effects, revival/support mechanics, item rarity and sets, world-arc milestones, party invitations tied to Threaded social identity, and eventually constrained lore/content generation.
