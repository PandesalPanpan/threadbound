# Arena combat prototype

## Selected combat foundation — 2026-10-05

The owner approved this arena as the base foundation for future combat simulation. Preserve formation-driven autonomous combat and the overhead presentation with upright existing art. Develop independent attack and movement timing next. This is the chosen direction for subsequent combat work; integration into authoritative live gameplay is still a separate implementation step, not accomplished by this designation.

Open `/arena-combat` (or `/react-battle/?view=arena`) on the current branch. This is a separate, public, browser-local experiment alongside `/active-timing`, explicitly requested for evaluating an alternative combat direction. It does not complete or reorder any master-plan milestone. Phase K human reviews remain the earliest open gates.

Select a teammate and tap an empty tile in the bottom three rows. Selecting an occupied deployment tile swaps the two teammates. Keyboard users can focus a tile and press Enter. Start battle locks the formation and runs a 3v3 simulation. Pause, Resume, 1×/2×/4×, Replay battle, and Reposition control the replay. Reposition preserves the formation and restores prototype health.

## Simulation and presentation

`frontend/src/battle/arenaCombatPrototype.js` is a pure deterministic sandbox. It resolves fixed 250ms ticks, alternates initiative, searches paths around living units, enforces one living unit per tile, and caps combat at 60 simulated seconds (draw on timeout). Frontline closes to melee range; ranged selects the weakest opponent and retreats from nearby melee threats between attacks; support prioritizes allies below 82% HP and follows them into heal range. Actions gain 25 Mana. At 100 Mana, frontline/ranged use shield or damage skills and support uses an enhanced heal. No randomness or remote AI service is involved.

The React presentation replays immutable frames on a scoped GSAP timeline. Pause and speed affect playback only. Existing semantic character art is resolved through `public/sprite-catalog.js`; upright sprites stand on an overhead grid with ground shadows, team rings, depth ordering, facing flips, walking bounce, attack motion, projectiles, hit flashes, damage numbers, and heal/shield effects. Single images do not supply directional walk/attack frames: this is transform animation, not a new spritesheet. Reduced motion uses discrete positions and omits nonessential motion.

This module has no live gameplay, player, reward, economy, persistence, or game-command integration. The browser-local simulation is an explicit prototype exception, not a new source of authoritative Threadbound combat. Integrating this direction into Hunt/Dungeon would require a separate product decision, moving the simulation to the authoritative domain/service boundary, committed replay projections, and shared replay/reconnect coverage. No framework or dependency was added.

## Verification

Node tests cover determinism, placement sensitivity, legal deployment, exact semantic art identity, collision-free paths, bounded HP/Mana/shields, defeated-unit inactivity, differentiated behaviors, and timeout draws. Playwright covers both canonical viewports, placement/swapping, automatic combat, pause, speed, identical replay results, reposition, asset loading, overflow, no mutating API requests, keyboard controls, and reduced motion. Screenshots are written to `test-results/arena-{placement,fighting,result}-{390,1440}.png` for inspection.

Human playtesting still needs to judge readability, pacing, and whether positioning feels meaningful. This is a small test roster with placeholder balance, not a production Autochess roster, shop, or progression system.

### Branch-local evidence — 2026-10-05

`npm run check` passed, `npm test` passed (509 tests), and full `npm run test:e2e` passed (24 threaded, 21 simple-local, 28 React-local, 7 Workshop). The three arena Playwright journeys passed again after the final accessibility labels and effect-boundary adjustments were rebuilt. Mobile and desktop placement/fighting screenshots were inspected; six retained images are in `ux-review/arena-{placement,fighting,result}-{390,1440}.png`. An 80-formation deterministic sample produced 65 victories, 12 defeats, and 3 timeout draws; this establishes formation sensitivity, not balance or fun.

The local preview is served on port 3001 using an in-memory local-auth development server. The accepted baseline is checkpointed on `feat/active-timing-combat-prototype`, alongside the timing comparison lab. It has not been merged or verified on `main`; no master-plan boxes changed. The owner explicitly authorized subsequent combat-foundation improvements. The next canonical unchecked experience gate remains PV2-K01, requiring two human reviewers.
