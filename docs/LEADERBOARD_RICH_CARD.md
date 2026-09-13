# Leaderboard rich card (M8-05, extended by M8-06)

M8-05 adds a server-ranked Guild Hall Leaderboard without turning Threadbound into a separate dashboard. M8-06 extends the same card with authoritative Duel actions while bot Profile inspection remains deferred.

## Authoritative boundaries

- `LeaderboardRankingPolicy` owns deterministic placement from already-authoritative progression facts: Level/XP, highest Area reached, Hunt count, achievements, and canonical equipment-derived stats as later tie breakers. It never mutates either human or simulated adventurers.
- `SQLiteLeaderboardRepository` owns the durable human activity read model. Existing retained `HuntResolved` / `AdventureResolved` stream facts are backfilled once, and future committed stream inserts increment durable counters through the shared SQLite transaction boundary. Stream retention therefore cannot erase already-projected leaderboard activity.
- Human Level/XP, Area, achievements, equipment, and stats are read through the same persistence/domain policies used by normal gameplay. Simulated adventurer rows use the persisted M8 model populated by the Guild Hall.
- `GuildHallService` composes human and simulated rows and invokes the ranking policy. From M8-06 it also projects Duel records derived by `SQLiteDuelRepository`. The browser receives placement, power summaries, and records as read projections; it does not calculate them.

## Chat-first presentation

Typing `leaderboard` or `/leaderboard` opens a large interactive-style card inside the existing Adventure Stream command-card slot. It shows placement, player/simulated identity, Level, Hunt count, highest Area, achievements, Attack/Defense, equipped-slot count, and authoritative Duel record.

From M8-06, simulated Adventurer rows expose a **Duel** action in this same card. The browser posts the command to the authoritative Duel service, refreshes the server-owned standings/records, shows the concise result, and can open the shared Battle Details modal. It does not expose Attack/Guard/skill controls or calculate the fight. Inspectable bot Profile actions remain deferred to M8-07.

No new headline currency, separate leaderboard page, tactical dashboard, Honey mutation, or Arc content is introduced.

## Verification

- `test/leaderboard-ranking.test.js` covers deterministic ranking and the combined human/simulated persisted read model, including durable Hunt activity and the intentionally strong veteran.
- `test/e2e/leaderboard-rich-card.spec.js` covers the `/api/areas` projection and the 390x844 mobile Adventure Stream card, including placement, readable progression/power facts, generated character sprites, authoritative Duel records/actions, minimum touch targets, and viewport containment. It writes `ux-review/leaderboard-mobile.png` for visual inspection.
- `test/e2e/duel.spec.js` covers the M8-06 Duel action, result receipt, record refresh, and Battle Details presentation.
- Required gates remain `npm run check`, `npm test`, and the full active Chromium Playwright suite.

After M8-06 is merged, verified green on `main`, and checked in the master plan, the next ordered milestone is **M8-07 — add Profile cards for bots with visible equipment, Hunts, Level, Area, achievements, and Duel record**.
