# Simulated Adventurer Profile cards (M8-07)

M8-07 makes persistent Guild Hall adventurers inspectable without creating a separate people/profile dashboard. Bot Profiles remain read-only projections inside the Adventure Stream and reuse the same simulated-adventurer, equipment, simulation, Leaderboard, and Duel state introduced by M8-01 through M8-06.

## Authoritative boundaries

- `SQLiteSimulatedAdventurerRepository` remains the source of persistent bot identity, XP/Level inputs, Area progression, Hunt/Adventure counts, equipment, achievements, personality, activity profile, and bounded simulation ticks.
- `SQLiteDuelRepository` remains the immutable Duel-result source and now exposes a bounded participant-relative recent-history read. It does not create a second Duel record or mutate combat state.
- `GuildHallService` composes the current Town roster into one read model. For simulated adventurers it adds profile-ready Level/XP, canonical stats, five-slot equipment, achievements/personality, authoritative Duel record, and at most five recent Hunt/Adventure/Duel history entries. Ranking continues to use `LeaderboardRankingPolicy`; Profile rendering does not calculate progression or power in the browser.
- Existing Town/Area availability remains authoritative. The browser resolves inspectable bots only from the current `/api/areas` Guild Hall projection, so an arbitrary bot id cannot be used as a new global lookup path.

## Chat-first presentation

The existing Leaderboard row for each simulated adventurer now has two mobile-sized actions:

- **Profile** — replaces the current command card with that bot's read-only Profile.
- **Duel** — retains the M8-06 authoritative automatic battle path.

The Profile card shows:

- generated character portrait, name, personality/activity profile, and veteran-rival marker when relevant;
- Level, XP, highest Area, Hunt count, Adventure count, and Duel record;
- Attack, Defense, Max HP, Speed, and Crit Chance from canonical persisted stats;
- Weapon, Helmet, Armor, Boots, and Accessory slots with item art/rarity where equipped;
- achievement ids rendered as readable labels;
- a bounded recent-history summary composed from persisted offline simulation ticks and immutable Duel results.

Typing `profile <name>` or `/profile <name>` is a convenience path to the same current-Guild-Hall projection. Plain `profile` continues to open the human player's own Profile card.

Bot Profile inspection is read-only and therefore does not publish a gameplay mutation receipt. Opening it still participates in the reusable rich-card historical-snapshot contract when it supersedes another card.

## Explicit non-goals

M8-07 does not add bot inventory mutation, equipment editing, direct messaging, recruiting, a social graph, a new bot persistence model, a new currency, Honey access, Arc expansion, or any Phase 9 activity. HUMAN gates remain untouched.

## Verification

- `test/simulated-adventurer-profile.test.js` proves the profile projection uses persisted simulated state, validated five-slot equipment, canonical stats, personality/achievements, participant-relative Duel record, and bounded recent Hunt/Adventure/Duel history.
- `test/e2e/simulated-profile-rich-card.spec.js` exercises the Leaderboard Profile action and typed `profile <name>` path at 390x844, verifies generated art, all five slots, progression/stats/history, current-Guild-Hall scoping, viewport containment, and minimum touch targets. It writes `ux-review/simulated-profile-mobile.png` for visual inspection.
- Required gates remain `npm run check`, `npm test`, and full active Chromium Playwright E2E before merge.

After M8-07 is merged, verified green on `main`, and checked in the master plan, Phase 8 is complete and the next ordered task is **M9-01 — implement Gold-only Blackjack with authoritative transactions/idempotency**.
