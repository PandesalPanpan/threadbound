# Live arena parity and loadout overhaul

Status: implemented and merged to `main` by
[PR #116](https://github.com/PandesalPanpan/threadbound/pull/116) as commit
`123b92c` on 2026-10-05. [Post-merge main CI run 37317322994](https://github.com/PandesalPanpan/threadbound/actions/runs/37317322994)
passed both required jobs. This compares the accepted Arena Lab
(`20c9c27`, `f98694d`), the current `/arena-combat` implementation, and the
live arena replay on `main` (`3fc82f3`, with `feat/active-timing-combat-prototype`
at `edd1a82`). The Lab is a browser-local reference; only the shared server
engine and committed replay may resolve live outcomes. The matrix below records
the as-found baseline; the implementation record follows it.

## Baseline parity matrix

| Area | Accepted Arena Lab and current `/arena-combat` | Current live combat on `main` | Difference and confirmed cause |
| --- | --- | --- | --- |
| Simulation | 8×8, 50 ms deterministic frames; six fixed prototype units; role-specific behavior; 60 s timeout. | Same board/tick/timeout foundation; actual 1–4 party characters and 1–3 authored enemies; seeded domain simulation reused across Hunt, Adventure, Duel, and Dungeon. | The engine is shared and authoritative, but the Lab's rules are not a production roster or balance model. Keep its motion/action concepts, not its test characters or tuning. |
| Roles | Lab explicitly labels frontline, ranged, and support. Support uses ordinary HP healing before attacking; skills add stronger healing/shields. | `arenaCombatRole()` infers support from the signature skill's ally effects, then ranged from Weapon family, else frontline. `supportTarget()` returns no target until the signature skill's Mana cost is met; a support unit therefore attacks on ordinary actions and only heals through a ready Mana skill. | No loadout-owned ordinary basic action exists. The role and heal policy are coupled to the first Mana skill. This reproduces the reported Mana gate and fails the approved healer loop. |
| Formation | Player selects only their three allies in the bottom three rows; occupied tiles swap; placement locks during combat and can be retried. | `validateArenaPlacements()` accepts legal, unique deployments and the engine creates stable defaults. Live Hunt/Adventure/Duel/Dungeon adapters do not pass chosen placements; there is no formation command, ownership check, persistence, readiness flow, or room snapshot. | Domain validation exists without an application/repository/UI path. Current live encounters always use default formation. |
| Movement | Independent move duration (`1000 / moveSpeed`); reserved source and destination; BFS paths; range uses fractional position; ranged/support reposition between attacks only while their attack clock is waiting. | Independent movement interpolation/reservations and BFS paths exist. Movement is started only when the single `nextActionAtMs` attack clock makes a unit due. Ranged/support retreat is checked before the attack and then immediately `continue`s; a nearby frontline threat can repeatedly consume due actions and starve attacks. | `ArenaCombatEngine` has no movement-ready clock or scheduled reposition window. `retreatStep()` is invoked on every due action and does not preserve an attack opportunity. |
| Timing | 50 ms samples; distinct per-unit `readyAt` attack and `moveAt` clocks; attack rate and tile/second movement are independent. | 50 ms samples; character Speed maps to attack rate and movement rate independently, but only `nextActionAtMs` is stored. Movement duration is calculated separately, without an independent reposition clock. | The source stat mappings are independent; the scheduler is not. This is the retreat and movement-scheduling parity gap. |
| Playback timing | GSAP timeline duration follows simulation duration (`replay.duration + 0.3s`); the clock, movement, and short-lived effects advance together. | Live `ArenaReplaySurface` sets `timelineDuration = max(2, min(8, durationMs / 1000 * 0.12))`. | At 1×, live playback is intentionally compressed to 2–8 wall-clock seconds. In the running Room 4 replay, a 8.8 s simulated fight advanced from 2% / 0.1 s to 75% / 6.6 s in about 1.6 s; 1× was about 4.4× faster than simulation time. |
| Animation | Continuous unit travel, walking bounce, facing flips, depth by board row, ground shadows/rings, melee lunges, ranged projectiles, heal/shield rings, targeted impact, independent floating feedback, defeat fade/turn, and a recent-event feed. Effect groups overlap and fade after 350 ms of replay time. | Unit positions interpolate from move events, sprites and generic active/targeted styling render, and damage has a brief target label. No walking cycle/bounce, per-row depth, facing updates, or ground shadow is projected by the live arena renderer. It does not render the Lab's projectile, melee sweep/lunge, heal/shield ring, or defeat choreography. | `ArenaReplaySurface` reduces replay events to one current event/one latest action. Its markup only creates a damage label; it does not render `healingEvents`, effect groups, independent projectile paths, or event-clock lifetimes. Generic legacy turn replay CSS is not equivalent to the Lab renderer. |
| Replay state | Local frames contain the sampled combatant states and effects; Pause, 1×/2×/4×, replay, and reposition are available. | Versioned server replay contains initial/final combatants and ordered action/move events; Pause, 1×/2×/4×, Replay, Skip, and reduced-motion paths exist. | The live renderer's 1× preference resets to 1 on every surface and is not remembered. Playback also autostarts on mount. On the mobile live replay at 45%, the party summary displayed final `44/58 HP`, `100/100 Mana`, and the enemy `0 HP` while the arena still showed both units alive. `teamSummary()` and the screen-reader summary read `finalCombatants` throughout playback. |
| Persistence and authority | Browser-local experiment; no player save, rewards, or game commands. | Server services resolve and persist versioned replay with encounter result; existing activity-specific HP/rewards/cooldowns/death rules, run idempotency/versioning, party ownership, and historical replay readers remain authoritative. | This is the correct live boundary and must remain. Formation is the missing persisted command/state; do not move the Lab simulator or combat outcome into the browser. |

## Running playback observations

On 2026-10-05, the existing local server at `127.0.0.1:3001` was opened in
Edge and inspected in the running UI, with the browser viewport explicitly set
to **390×844** and **1440×960**. At mobile size, a saved solo Dungeon replay
was restarted at 1×. The progress label and arena clock were observed while it
advanced; the mobile mid-playback screenshot showed final team/enemy values in
the roster while the board was still in combat. At desktop size, the same room
was watched at 1×; the replay reached 75% with the arena clock at 6.6 s in
roughly 2 s, then completed an 8.8 s simulation in about 2.5 s. The arena showed
unit movement and damage text, but not the Lab's projectile/melee/heal/shield
choreography.

The `/arena-combat` Lab was then run live at mobile and desktop breakpoints. The
3v3 battle visibly moved units, changed health/Mana, showed damage and skill
feedback, and later displayed simultaneous healing/shield/support moments.
At desktop dimensions, the Lab used its two-column board and behavior panel; at
mobile dimensions it stacked the board and team cards. Its source and running
output agree on independent action/movement clocks and the animation list in
the matrix above. The fixed six-unit Lab roster remains comparison-only.

The timing and final-state leak are direct runtime observations corroborated
by `ArenaReplaySurface`; other rows combine runtime inspection with the listed
domain/rendering contracts. The matrix describes the state before this repair.

## Implemented combat contract

`CombatLoadoutPolicy` projects the five owned Equipment slots into a stable
combat profile. The Weapon supplies the default profile; armor and accessories
add bounded bonuses. Existing weapon families, signatures, and explicit roles
remain fallbacks for records without a profile.

| Profile | Ordinary action | Basic damage | Reach | Signature |
| --- | --- | ---: | ---: | --- |
| Frontline | Melee strike | 100% Attack | 1.45 tiles (spear: 1.8) | Existing weapon/combatant skill when present |
| Ranged | Ranged strike | 80% Attack | 3.2 tiles | Existing weapon/combatant skill when present |
| Healer | Heal a hurt ally or self; otherwise strike | 70% Attack on strike | 3.2 tiles | Mending Chorus |
| Mana support | Strike and build Mana for party support | 90% Attack | 3.2 tiles | Threadsong |

Healer basic support is an ordinary action and targets allies below the 82% HP
need threshold. Healing Power adds to healing. Attack Speed bonus is limited to
0.5, Movement Speed bonus to 2 tiles/second, attack rate to 3 actions/second,
and movement to 4 tiles/second. Character Speed still controls both clocks
through separate mappings: attack rate starts at Speed ÷ 10, capped by the
slowest living unit's rate ×2; movement starts at 0.9 + Speed ×0.075 tiles per
second. Equipment cannot lift either clock beyond its stated cap.

The authoritative Arena remains an 8×8, 50 ms tick simulation with one to four
players, one to three enemies, and a 60 s encounter cap. Frontline units close
to melee reach; ranged units attack from distance and only reposition on a
separate movement clock; healers follow support targets. Movement keeps source
and destination reservations, uses pathfinding, and can be interrupted or
retargeted. Seeded combat resolution and tie-breaking stay in the domain.

Starting player placements use the bottom three rows. `ArenaFormationService`
only accepts the signed-in character's placement, checks tile ownership and a
version compare-and-swap, and saves inside a repository transaction. Repeated
requests use the existing command idempotency middleware. A changed placement
resets forming-party readiness; the leader starts a co-op Dungeon after all
members are ready. Hunt and other routine encounters use saved/default
placements without a setup step. Each encounter stores its formation snapshot.
Dungeon placement may change between rooms; placement changes invalidate
readiness, and neither placement nor an ordinary Heal restores HP or Mana.

## Replay and item compatibility

Arena replay version 1 stores the battle seed, initial combatants, ordered
movement/action events, and committed final combatants. The browser advances
that event stream at the selected simulation-time rate. The 1× setting follows
the server's `durationMs`; 2× and 4× are user choices remembered in
`localStorage`. Pause, Replay, and Skip control presentation only. Movement,
attacks, skills, healing, status effects, defeat, HP, and Mana use event time;
the roster follows the replay state instead of leaking final values. Reduced
motion removes decorative movement while retaining the readable combat
timeline. A replay without the new Arena payload continues through the legacy
turn reader, so stored Hunt/Duel/Dungeon records remain readable.

Item profile and bonus fields are additive. Missing profile or bonus data reads
as a legacy family/skill mapping or zero, respectively. Owned item IDs,
ownership, slot, upgrades, and saved Dungeon participant state are not rewritten
to adopt the new presentation. Domain records reference profile/stat data only;
visuals still resolve from the semantic asset catalogs. Existing Arc templates
are validated against the same item profile policy; this work does not generate
or publish new Arc content.

## Deterministic balance evidence

`test/simple-dungeon-balance.test.js` buys real early-Shop Weapons and Armor,
then runs the authored Area 1 four-stage progression challenge under 24 fixed
seeds per lineup. Every run begins with two fresh Level 1 characters and one
minor potion each; eligible intermission potions are claimed once per window.
The table reports clears/survivors out of 24, median combined party HP lost by
completion, median combat healing, and median duration of an individual
encounter.

| Loadout | Clears | Survivors | Median party HP lost | Median combat HP healed | Median encounter duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Frontline + coat / Frontline + coat | 24/24 | 24/24 | 27 | 0 | 5.70 s |
| Frontline / Ranged | 24/24 | 21/24 | 41.5 | 0 | 7.65 s |
| Frontline / Healer | 24/24 | 24/24 | 11 | 54.5 | 8.30 s |
| Ranged / Ranged | 24/24 | 23/24 | 45.5 | 0 | 6.35 s |
| Healer / Healer | 24/24 | 24/24 | 5 | 136 | 14.50 s |

The recorded trade-off is clear: healer parties preserve HP through ordinary
healing at substantially lower damage rates, while ranged parties preserve
reach and action opportunities at a higher HP cost. The unit and integration
tests also cover solo healer victory under the 60 s cap, healing only when
needed, ranged attack opportunities, formation sensitivity, legal paths,
bounded stats, equipment migration, activity-specific outcomes, and stale or
replayed formation commands. The authored challenge exposes its Boar skill in
at least 16/24 first rooms, the mid-run support skill in 17/24, the boss line
attack in 18/24, and the boss add skill in 13/24 runs.

These 24-seed runs are a regression and balance-shape check, not proof of fun,
optimality, or broad player skill coverage. They use a small set of early-game
gear and one authored challenge; they do not replace human acceptance across
later Areas, varied player choices, or longer sessions. The seeded unit tests
cover combat rules separately from this progression sample.

## Visual evidence and verification

Captures from the running mobile and desktop UI:

- [Mobile healer loadout status](../ux-review/react-equipment-healer-loadout-mobile.png)
- [Desktop healer loadout status](../ux-review/react-equipment-healer-loadout-desktop.png)
- [Mobile true-time replay controls](../ux-review/react-arena-replay-speed-mobile.png)
- [Desktop true-time replay controls](../ux-review/react-arena-replay-speed-desktop.png)
- [Mobile Dungeon formation and readiness](../ux-review/react-arena-formation-mobile.png)
- [Mobile Dungeon replay and room state](../ux-review/react-dungeon-replay-mobile.png)
- [Desktop Dungeon replay and room state](../ux-review/react-dungeon-replay-desktop.png)

The 390×844 and 1440×960 captures were inspected against the Lab's movement,
attack, support, and replay behavior. The live board now interpolates committed
movement and renders event-timed actions, projectiles, healing/status feedback,
impact, and defeat; the Lab roster remains comparison-only. Browser controls do
not request a new simulation or change an outcome. The server remains the only
authority for encounters, formation, resources, and rewards.

Local verification on 2026-10-05 passed all required gates:

- `npm run check` — passed; production React bundle built successfully.
- `npm test` — 531 passed, 0 failed.
- `npm run test:e2e` — 81 passed across threaded (24), simple-local (21),
  React-local (29), and workshop (7).
- Focused replay motion, two-player progression, and owner/spectator Dungeon
  replay checks also passed before the full matrix.

Representative mobile and desktop journeys and inspected captures are included
above. The PR-head CI run [37316096087](https://github.com/PandesalPanpan/threadbound/actions/runs/37316096087)
and post-merge `main` run [37317322994](https://github.com/PandesalPanpan/threadbound/actions/runs/37317322994)
both passed `unit-and-contract` and `browser-e2e`.

## Remaining acceptance and handoff

Phase N is complete: its nine implementation and delivery items were implemented,
tested, documented, merged in PR #116, and verified by the green post-merge `main`
run above. Phase K human acceptance remains open. Automation cannot decide
whether the first hour is understandable, Hunts remain satisfying over a long
session, or the chat cards outperform separate pages. Phase L lifecycle gates
also remain open.

The current master plan's next unchecked task is **PV2-K01 HUMAN**: confirm two
humans understand the first hour without developer documentation. See
[`THREADBOUND_MASTER_PLAN.md`](THREADBOUND_MASTER_PLAN.md) for the ordered
checklist. No new Arc generation is authorized by this repair.
