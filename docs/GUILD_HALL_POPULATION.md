# Guild Hall population (M8-04)

M8-04 makes the existing Town `guild_hall` capability concrete without pulling Leaderboard, Duel, or inspectable bot Profile work forward.

## Authoritative boundary

- `src/content/FoundationGuildHallCatalog.js` owns the neutral Area-1 Guild Hall roster membership and presentation-neutral rival metadata. It contains three simulated adventurers and deliberately includes one veteran who has reached much farther progression than a new human player.
- The roster uses the existing `SimulatedAdventurer` model. The veteran's equipment is materialized through the M8-03 validated Arc-equipment safety boundary rather than arbitrary item-shaped data.
- `SQLiteSimulatedAdventurerRepository.ensure()` is an insert-once persistence path. A Town read may create a missing catalog adventurer, but later reads never overwrite XP, Hunt/Adventure counts, simulation cursor, equipment, or other progression that changed after initialization.
- `GuildHallService` coordinates catalog membership with persisted simulated-adventurer state and returns a narrow Town read projection. It does not rank the roster, resolve Duels, spend/mint Honey, or mutate human resources.
- `TownService` composes the Guild Hall projection only for Towns that explicitly expose the existing `guild_hall` service. `AreaService` obtains Town read models through `TownService`, keeping the browser from becoming a second source of roster truth.

## Chat-first presentation

`public/town-rich-card.js` renders a Guild Hall section inside the existing `town` Adventure Stream card. It shows each persistent adventurer's name, Level, highest Area reached, activity profile, generated character sprite, and a clear `Veteran rival` marker for the deliberately strong long-term rival.

M8-04 intentionally adds no Duel button, Leaderboard ordering, or inspectable bot Profile action. Those remain M8-05 through M8-07. Historical Town-card collapse and NPC Talk behavior are unchanged.

## Verification

- `test/guild-hall-population.test.js` proves the neutral roster contains exactly one intentionally strong rival, initial seeding is persistent/idempotent, later offline simulation progress survives repeated Town reads, and Town/Area projections expose the same roster.
- `test/e2e/guild-hall-rich-card.spec.js` proves the authoritative `/api/areas` projection and the 390x844 Town card show the three simulated adventurers, generated character assets, the Level-15/Area-5 veteran marker, and no premature Duel/Leaderboard controls. It writes `ux-review/guild-hall-town-mobile.png` for visual inspection.
- Required gates remain `npm run check`, `npm test`, and full Chromium E2E before merge.

No new headline currency, new Arc, tactical dashboard, or HUMAN gate is introduced here.
