# Authoritative arena combat integration

Status: implementation complete on `main` as of 2026-10-05. The combat
integration landed in `edd1a82`; final test reliability fixes landed in
`512bbd4`. At this documentation checkpoint, `main` at `4effd0b` passed both
workflow jobs in [CI run 37273597455](https://github.com/PandesalPanpan/threadbound/actions/runs/37273597455).
Phase K human reviews remain open.

## Intended result

Every live encounter resolves through one server-side overhead arena engine.
The engine receives the actual encounter participants and authored enemies,
equipment, stats, abilities, starting resources, and explicit encounter rules.
Services coordinate commands and persistence; repositories commit the result
and replay together; browser surfaces render that committed data. The Arena Lab
and active-timing lab remain isolated comparison experiments.

## Combat-path audit and implemented outcome

| Path | Final authoritative path | Replay/presentation | Retained compatibility and boundary |
| --- | --- | --- | --- |
| Hunt | `POST /api/hunt` → `HuntService` → `HuntEncounter.resolveAutomaticHunt` → `simulateArenaCombat`. | `HuntResolved` includes the versioned arena replay; the Adventure Stream and Battle Details use the shared replay renderer. | Area enemy choice, current HP, equipment, skill/effect rules, cooldowns, rewards, loot, Quest facts, carried-Gold death loss, and the single receipt remain service/domain policies. |
| Ordinary Adventure | `POST /api/adventure` → `AdventureService` → `AdventureEncounter.resolveOrdinaryAdventure` → `simulateArenaCombat`. | `AdventureResolved` projects the same arena replay and result-first receipt. | Area encounter selection, current HP, cooldown, equipment, skill/effect rules, XP/Gold/loot, and death behavior remain authoritative application/domain rules. |
| Duel | `POST /api/duels/:opponentId` → `DuelService` → `DuelBattle.resolveDuelBattle` → `simulateArenaCombat`; `SQLiteDuelRepository` stores the immutable result. | `DuelResolved` uses the shared arena replay and Battle Details. | Uses the actual challenger loadout and Guild Hall opponent. Both enter at projected full HP; a Duel never mutates normal HP or economy. Draw/win/loss and idempotency behavior remain authoritative. |
| Built-in and published Arc Dungeons | `AdventureRun` delegates each room to `ArenaDungeonEncounter.resolveArenaDungeonEncounter` → `simulateArenaCombat`. Arc manifests materialize validated enemy, skill, resistance, targeting, and encounter snapshots before the run starts. | Versioned arena replay is committed with each run transition and projected in existing Dungeon cards/details. | Singleton, multi-enemy, boss/add, and progression rooms share the engine. HP/Mana attrition, party gates, intermission Heal, rewards/unlocks, Enrage, and run-version checks remain in the run/domain and repository boundaries. Arc content remains data-only. |
| Active and saved legacy Dungeon runs | `AdventureRun` hydrates the existing persisted run shape and routes the next combat boundary through `ArenaDungeonEncounter`; legacy commands and progression state remain at the existing command boundary. | New room results include a versioned arena replay and retain the legacy timeline projection for old readers. Completed historical records remain readable in their original format. | Preserve run identity, saved state, idempotency, optimistic concurrency, explicit boss decisions, Focus/cooldown/combo state, relic/run-power rules, and migration coverage. |
| Battle Simulation preview | `GET/POST /api/battle-simulation` → `BattleSimulationService` remains a fixed showcase roster. It does not persist player results or grant rewards. | `/react-battle` simulation presentation and Battle Details. | Isolated comparison lab; it never feeds live combat or substitutes showcase combatants for players. |
| Arena Lab and Active-timing Lab | Public `/arena-combat` and `/active-timing` remain browser-local experiments without player saves, rewards, or game commands. | React prototypes keep local controls and replay behavior. | Reusable live rules now reside in `src/domain`; lab simulation remains separate and cannot become gameplay authority. |
| Simulated Adventurers | `SimulatedAdventurerSimulationService` continues to plan bounded schedule/economy actions. Guild Hall Duels use the shared `DuelBattle` path above. | Profile/history projections and arena Duel replay. | Schedule ownership and economy stay separate from combat. |

Published Arc combat content is Dungeon-based. Arc enemies and bosses enter through validated Dungeon stages; there are no independent Arc Hunt or ordinary Adventure pools. Future encounter kinds must configure the shared engine rather than add a live simulator.

The existing readers must also be covered: `AutomaticBattleReadModel`,
`ActivityStreamService`, `GameService.simpleBattleReplay`, React
`AdventureStream`/`SharedBattleSurface`, Battle Details, and legacy stream
snapshots. Current stored formats include automatic turn histories, simple
Dungeon action/beat histories, and older legacy events. New arena replays need
an explicit version and must not be mistaken for old turn-based data.

## Implemented mechanics and migration decisions

- `ArenaCombatEngine` owns live target selection, movement/path reservations,
  attack timing, skill/status effects, HP/Mana changes, deterministic outcomes,
  and the replay event/frame projection. Existing equipment, resistance,
  character-growth, cooldown, rewards, death, and progression policies remain
  in their domain/service/repository boundaries.
- `ArenaCombatPolicy` validates an 8×8 board, 1–4 players, 1–3 enemies, Speed
  from 1–100, bounded stats, starting sides, unique tiles, roles, and attack
  ranges. It maps Speed independently to attack rate (0.4–3 actions/second)
  and movement rate (1–4 tiles/second); role can come from explicit encounter
  data, allowlisted skills, or weapon family.
- Simulation advances in deterministic 50 ms quanta with stable ordering and
  a battle-local seed derived from the committed encounter identity/state and
  roster. The 60-second simulated timeout produces a draw. Movement
  reservations are released when actors are interrupted or defeated; status
  ticks and same-quantum outcomes are resolved in the engine.
- Routine battles use a deterministic server-owned formation without a setup
  step. It supports solo/party play and up to three enemies, including boss
  adds. Existing Dungeon command pauses and sparse boss decisions remain
  explicit run transitions.
- Replays use `kind: arena-combat-replay`, version 1, and carry the immutable
  positions, action/effect/resource events, and terminal outcome needed by the
  renderer without rerunning combat rules. Result and replay are persisted at
  the same authoritative command boundary; idempotency and stale-run checks
  remain in the existing services/repositories.
- `AutomaticBattleReadModel` projects the typed replay while preserving
  legacy turn and stream history. `ArenaDungeonEncounter` also produces the
  established timeline summaries so older consumers can read migrated runs.
  `SharedBattleSurface` and Battle Details render semantic assets and retain
  pause, speed, reduced-motion, accessible status, reconnect, and finish/skip
  behavior. Commands still create one concise public result receipt.

## Delivery checklist

The checkboxes below are release gates and stay open until the work has passed
its own tests, review, merge, and green `main` CI.

- [x] **M01** Complete and reconcile the combat-path, simulator, replay,
  renderer, persistence, and compatibility audit above.
- [x] **M02** Extract a reusable server-side arena domain engine, define the
  stat/role mapping and deterministic spatial rules, and validate/bound inputs.
- [x] **M03** Migrate Hunt, ordinary Adventure, and Duel with real encounter
  data and preserved activity-specific rules.
- [x] **M04** Migrate canonical single/multi-enemy Dungeon rooms, boss/add
  encounters, progression challenges, and published Arc encounters.
- [x] **M05** Migrate or safely hydrate active legacy runs; remove alternate
  live resolution only after compatibility coverage passes.
- [x] **M06** Commit the versioned replay atomically and render it in existing
  battle cards/details with historical replay compatibility.
- [x] **M07** Add domain, service, repository, migration, replay, and Playwright
  coverage for all combat families, co-op, retry/stale requests, reload, and
  reconnect; inspect mobile and desktop playback.
- [x] **M08** Run `npm run check`, `npm test`, relevant Playwright suites, and
  full `npm run test:e2e`; integrate only green work, verify `main` CI, and
  leave a concrete handoff listing any remaining human acceptance gates.

## Verification and handoff

Use [THREADBOUND_MASTER_PLAN.md](THREADBOUND_MASTER_PLAN.md)'s Phase M as the
canonical ordered checklist. The implementation commit is `edd1a82`; the test
reliability follow-up is `512bbd4`. Green `main` CI at this handoff checkpoint
is recorded in [run 37273597455](https://github.com/PandesalPanpan/threadbound/actions/runs/37273597455)
for `4effd0b`. It passed `npm run check`, `npm test`, and the full browser E2E workflow.
The unit suite reports 522 passing tests; E2E groups passed 24 threaded, 21
simple-local, 29 React-local, and 7 Workshop tests. Coverage exercises Hunt,
ordinary Adventure, Duel, single/multi-enemy and legacy Dungeon runs,
progression gates, Arc encounters, co-op, replay reload/reconnect, and stale or
duplicate commands.

Mobile and desktop replay captures are committed at
[390×844](../ux-review/react-duel-replay-mobile.png) and
[1440×960](../ux-review/react-duel-replay-desktop.png). The mobile capture was
visually inspected for compact readable loadout labels and touch-safe controls;
both captures supplement DOM/replay assertions.

All Phase M implementation gates are complete. Phase K is deliberately still
open: two human reviewers must assess first-hour comprehension; long-session
Hunt receipts; rich-card usability; co-op, attrition and boss clarity; and
mobile/desktop coherence. The next master-plan task is **PV2-K01 HUMAN**.
