# Leaderboard rich card (M8-05)

M8-05 adds a server-ranked Guild Hall Leaderboard without turning Threadbound into a separate dashboard or pulling Duel/Profile inspection forward.

## Authoritative boundaries

- `LeaderboardRankingPolicy` owns deterministic placement from already-authoritative progression facts: Level/XP, highest Area reached, Hunt count, achievements, and canonical equipment-derived stats as later tie breakers. It never mutates either human or simulated adventurers.
- `SQLiteLeaderboardRepository` owns the durable human activity read model. Existing retained `HuntResolved` / `AdventureResolved` stream facts are backfilled once, and future committed stream inserts increment durable counters through the shared SQLite transaction boundary. Stream retention therefore cannot erase already-projected leaderboard activity.
- Human Level/XP, Area, achievements, equipment, and stats are read through the same persistence/domain policies used by normal gameplay. Simulated adventurer rows use the persisted M8 model populated by the Guild Hall.
- `GuildHallService` composes human and simulated rows and invokes the ranking policy. The browser receives placement and power summaries as a read projection; it does not calculate ranking.

## Chat-first presentation

Typing `leaderboard` or `/leaderboard` opens a large interactive-style card inside the existing Adventure Stream command-card slot. It shows placement, player/simulated identity, Level, Hunt count, highest Area, achievements, Attack/Defense, equipped-slot count, and existing Duel record where one is authoritative.

The card deliberately does **not** add Duel buttons or inspectable bot Profile actions. Human Duel records remain absent until M8-06 establishes the authoritative Duel model. Simulated records already present in the M8 profile model may be displayed as read-only facts.

No new headline currency, separate leaderboard page, tactical dashboard, Honey mutation, or Arc content is introduced.

## Verification

- `test/leaderboard-ranking.test.js` covers deterministic ranking and the combined human/simulated persisted read model, including durable Hunt activity and the intentionally strong veteran.
- `test/e2e/leaderboard-rich-card.spec.js` covers the `/api/areas` projection and the 390x844 mobile Adventure Stream card, including placement, readable progression/power facts, generated character sprites, and the absence of premature Duel actions. It writes `ux-review/leaderboard-mobile.png` for visual inspection.
- Required gates remain `npm run check`, `npm test`, and the full active Chromium Playwright suite.

After M8-05 is merged, verified green on `main`, and checked in the master plan, the next ordered milestone is **M8-06 — implement Duel through the shared automatic battle engine**.
