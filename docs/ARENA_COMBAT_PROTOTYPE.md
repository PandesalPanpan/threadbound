# Arena combat prototype

## Selected combat foundation — 2026-10-05

The owner approved this arena as the base foundation for future combat simulation. Preserve formation-driven autonomous combat and the overhead presentation with upright existing art. The first refinement adds independent attack and movement timing. This is the chosen direction for subsequent combat work; integration into authoritative live gameplay is still a separate implementation step, not accomplished by this designation.

Open `/arena-combat` (or `/react-battle/?view=arena`) on the current branch. This is a separate, public, browser-local experiment alongside `/active-timing`, explicitly requested for evaluating an alternative combat direction. It does not complete or reorder any master-plan milestone. Phase K human reviews remain the earliest open gates.

Select a teammate and tap an empty tile in the bottom three rows. Selecting an occupied deployment tile swaps the two teammates. Keyboard users can focus a tile and press Enter. Start battle locks the formation and runs a 3v3 simulation. Pause, Resume, 1×/2×/4×, Replay battle, and Reposition control the replay. Reposition preserves the formation and restores prototype health.

## Simulation and presentation

`frontend/src/battle/arenaCombatPrototype.js` is a pure deterministic sandbox. A 50ms resolution step samples independent per-unit clocks; it does not force every unit to act or move together. Attack speed is actions per second (including support casts), and movement speed is tiles per second. Each unit has different defaults and a small deterministic starting offset. The lab exposes separate speed sliders for the selected teammate before battle; configuration locks during combat and persists across Replay/Reposition. Reset unit speeds restores that teammate's authored defaults.

Movement travels continuously between adjacent tiles over `1000 / moveSpeed` milliseconds. The simulation reserves both source and destination, commits tile arrival only when travel completes, uses fractional current positions for attack/heal range, and prevents attacks while moving. Rendering interpolates the sampled positions. Attack cooldowns use `1000 / attackSpeed` milliseconds independently of movement; increasing speed changes actual action count, damage, Mana gain, and skill frequency. The 50ms sampling step rounds execution to the first eligible sample without allowing faster-than-configured attacks. These sandbox stats are not yet mapped to live equipment's Speed stat.

The simulator alternates tie initiative, searches paths around living units and reserved destinations, and caps combat at 60 simulated seconds (draw on timeout). Frontline closes to melee range; ranged selects the weakest opponent and retreats from nearby melee threats between attacks; support prioritizes allies below 82% HP and follows them into heal range. Actions gain 25 Mana. At 100 Mana, frontline/ranged use shield or damage skills and support uses an enhanced heal. No randomness or remote AI service is involved.

The React presentation replays immutable frames on a scoped GSAP timeline. Pause and speed affect playback only. Existing semantic character art is resolved through `public/sprite-catalog.js`; upright sprites stand on an overhead grid with ground shadows, team rings, depth ordering, facing flips, walking bounce, attack motion, projectiles, hit flashes, damage numbers, and heal/shield effects. Single images do not supply directional walk/attack frames: this is transform animation, not a new spritesheet. Reduced motion uses discrete positions and omits nonessential motion.

This module has no live gameplay, player, reward, economy, persistence, or game-command integration. The browser-local simulation is an explicit prototype exception, not a new source of authoritative Threadbound combat. Integrating this direction into Hunt/Dungeon would require a separate product decision, moving the simulation to the authoritative domain/service boundary, committed replay projections, and shared replay/reconnect coverage. No framework or dependency was added.

## Verification

Node tests cover determinism, placement sensitivity, legal deployment, exact semantic art identity, collision-free paths, bounded HP/Mana/shields, defeated-unit inactivity, differentiated behaviors, and timeout draws. Playwright covers both canonical viewports, placement/swapping, automatic combat, pause, speed, identical replay results, reposition, asset loading, overflow, no mutating API requests, keyboard controls, and reduced motion. Screenshots are written to `test-results/arena-{placement,fighting,result}-{390,1440}.png` for inspection.

Human playtesting still needs to judge readability, pacing, and whether positioning feels meaningful. This is a small test roster with placeholder balance, not a production Autochess roster, shop, or progression system.

### Accepted baseline evidence — 2026-10-05

`npm run check` passed, `npm test` passed (509 tests), and full `npm run test:e2e` passed (24 threaded, 21 simple-local, 28 React-local, 7 Workshop). The three arena Playwright journeys passed again after the final accessibility labels and effect-boundary adjustments were rebuilt. Mobile and desktop placement/fighting screenshots were inspected; six retained images are in `ux-review/arena-{placement,fighting,result}-{390,1440}.png`. An 80-formation deterministic sample produced 65 victories, 12 defeats, and 3 timeout draws; this establishes formation sensitivity, not balance or fun.

The local preview is served on port 3001 using an in-memory local-auth development server. The accepted baseline is checkpointed on `feat/active-timing-combat-prototype`, alongside the timing comparison lab. It has not been merged or verified on `main`; no master-plan boxes changed. The owner explicitly authorized subsequent combat-foundation improvements. The next canonical unchecked experience gate remains PV2-K01, requiring two human reviewers.

### Independent timing follow-up — 2026-10-05

The accepted baseline was committed first as `20c9c27` (including the timing comparison lab's existing animation changes and shared dependencies, keeping the tested build reproducible). The follow-up replaces shared movement cadence with independent speed-based travel and attack cooldowns, reserves destinations during travel, interpolates current positions for range and rendering, and adds configurable teammate speeds. Combat effects retain a 350ms lifetime on the replay clock, so finer simulation samples do not make them blink away; pause and playback speed also control these effects.

`npm run check` passed; `npm test` passed (513); all four arena Playwright journeys passed, including speed adjustment, locked controls during combat, pause freezing actual transforms, reposition retaining settings, and resetting authored defaults. Nine focused simulation tests cover the baseline invariants plus independent cooldowns, increased action count, speed-based travel duration, fractional positions, reservation safety, in-transit attack prevention, and validated tuning. Updated mobile/desktop screenshots were inspected and retained in `ux-review/`. The earlier 80-test full E2E evidence above belongs to the baseline; this follow-up ran the changed arena journeys. This remains branch-local work, with live server integration and human experience gates still open.
