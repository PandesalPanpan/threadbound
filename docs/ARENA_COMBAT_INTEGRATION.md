# Authoritative arena combat integration

Status: owner-approved implementation track opened 2026-10-05. This work may
proceed alongside Phase K human reviews. It is not accepted until each scoped
gate below is implemented, verified, documented, merged, and green on `main`.

## Intended result

Every live encounter resolves through one server-side overhead arena engine.
The engine receives the actual encounter participants and authored enemies,
equipment, stats, abilities, starting resources, and explicit encounter rules.
Services coordinate commands and persistence; repositories commit the result
and replay together; browser surfaces render that committed data. The Arena Lab
and active-timing lab remain isolated comparison experiments.

## Current combat-path audit

| Path | Current authoritative path | Current replay/presentation | Integration decision |
| --- | --- | --- | --- |
| Hunt | `POST /api/hunt` → `HuntService` → `HuntEncounter.resolveAutomaticHunt` → `AutomaticBattleSimulator`; Area enemy choice, Hunt cooldown, health, rewards, equipment drops, Quest progress, and death loss are coordinated by existing policies/services. | `HuntResolved` projection plus `AutomaticBattleReadModel`; React Adventure Stream uses `SharedBattleSurface` and Battle Details. | Replace the live simulator with the arena engine. Preserve the Area roster, current Hunt HP, equipment, skill/effect rules, cooldown, rewards, loot, Quest facts, normal carried-Gold loss, and one concise receipt. |
| Ordinary Adventure | `POST /api/adventure` → `AdventureService` → `AdventureEncounter.resolveOrdinaryAdventure` → `AutomaticBattleSimulator`; Area and authored opponent are snapshotted before reward/death resolution. | `AdventureResolved` projection and the shared automatic-battle receipt/details contract. | Replace live resolution with the arena engine. Preserve current HP, Area encounter choice, cooldown, equipment, skill/effect rules, XP/Gold/loot, and death behavior. |
| Duel | `POST /api/duels/:opponentId` → `DuelService` → `DuelBattle.resolveDuelBattle` → `AutomaticBattleSimulator`; actual challenger loadout and persistent simulated Guild Hall opponent are projected for the match. `SQLiteDuelRepository` stores the immutable result. | `DuelResolved` and the same shared battle card/details. | Replace live resolution with the arena engine. Preserve full projected encounter HP, real equipment/skills, draw/win/loss records, no normal HP/economy mutation, and request/result idempotency. |
| Canonical Dungeon rooms | `/api/dungeons/:dungeonId/start-simple` or the shared start path → `SimpleDungeonService` → persisted `AdventureRun`; room resolution calls `SimpleEncounterBattle.resolveSimpleEncounter`, which repeatedly invokes `AutomaticBattleSimulator` for one action at a time. | `GameService.simpleBattleReplay` stores the shared participant/enemy snapshot and action replay in `CombatActionResolved`; `SharedBattleSurface` replays it. HP/Mana carry between rooms; Potion Heal is an explicit versioned intermission command. | Replace room resolution with the arena engine for singleton, multi-enemy, boss, boss-add, and progression rooms. Preserve room HP/Mana attrition, party gates, intermission healing, rewards/unlocks, Enrage accounting, and atomic run-version commits. |
| Published Arc Dungeon encounters | `ArcManifestService.runtimeDungeons/resolveDungeon` materializes allowlisted Arc enemies, skills, resistances, targeting profiles, and encounter variants; `SimpleDungeonService` snapshots the resulting definition into an `AdventureRun`. | Same persisted Dungeon action replay and shared battle card. | Use the same engine/configuration path as built-in Dungeons. Arc data stays validated content and cannot supply formulas, scripts, URLs, or executable behavior. |
| Legacy active and saved Dungeon runs | `/api/dungeons/:dungeonId/start` and legacy run commands (`attack`, `guard`, `interrupt`, `mend`, `revive`, `skills`, upgrades/events) hydrate `AdventureRun`/`DungeonRun`. `DungeonRun` applies `CombatIntentPolicy`, Focus/cooldowns/combos, legacy ability profiles, relic/run-power rules, and persisted run versioning. `/api/dashboard?previews=1` also calls `CombatPreviewService` over this model. | Legacy action events and compatibility surfaces; some records have singleton enemies and no arena replay. | Migrate active runs safely to the new engine at a durable command boundary, retaining explicit sparse boss decisions and owned progression state. Historical completed records remain readable in their original format. Replace or remove stale preview calculations once their displayed contract is understood. |
| Battle Simulation preview | `GET/POST /api/battle-simulation` → `BattleSimulationService` → `AutomaticBattleSimulator` with a fixed Figma 3v3 roster; it does not persist player results or grant rewards. | `/react-battle` simulation presentation and Battle Details. | Keep as an isolated, clearly labeled comparison lab. Its sample roster and results must never feed live combat or stand in for actual players. |
| Arena Lab | Public `/arena-combat` imports the browser-local `frontend/src/battle/arenaCombatPrototype.js` 3v3 simulator; no player save, rewards, or game commands. | React overhead prototype, semantic sprite catalog, local pause/speed/replay controls. | Preserve as an isolated comparison lab while moving reusable simulation rules into `src/domain`. Lab controls remain experiment-only. |
| Active-timing Lab | Public `/active-timing` imports a separate browser-local manual timing experiment; no rewards or saved progression. | React comparison prototype. | Preserve as a separate experiment. It is not a live combat authority. |
| Simulated Adventurer activity | `SimulatedAdventurerSimulationService` plans bounded schedule actions and commits them through its repository; the inspected service does not run combat. A simulated Adventurer challenged from the Guild Hall is a Duel opponent and follows the Duel path above. | Profile/history and Duel projections. | Keep the schedule/economy simulator separate because it does not create combat encounters. Route every bot Duel through the shared arena engine while preserving the simulated-adventurer ownership and economy policy. |

Current published Arc combat content is dungeon-based: Arc enemy and boss definitions are materialized by `ArcManifestService` and enter through Dungeon stages. Arc Hunt/ordinary Adventure pools are not currently authored as independent manifest encounter paths; Quest kill references are validated against the Area Hunt/Adventure pools. Include any future Arc encounter kind by configuring the same arena engine rather than adding a simulator.

The existing readers must also be covered: `AutomaticBattleReadModel`,
`ActivityStreamService`, `GameService.simpleBattleReplay`, React
`AdventureStream`/`SharedBattleSurface`, Battle Details, and legacy stream
snapshots. Current stored formats include automatic turn histories, simple
Dungeon action/beat histories, and older legacy events. New arena replays need
an explicit version and must not be mistaken for old turn-based data.

## Mechanics and migration decisions to finish

- Keep current Attack, Defense, Critical Strike, equipment effect, resistance,
  Mana, signature skill, status, target-tendency, boss phase/ability, reward,
  cooldown, death, and progression policies at the domain/service boundary.
  Translate their timing and spatial effects explicitly instead of leaving any
  live caller on an alternate simulator.
- Define one validated mapping from authoritative `Speed` and allowlisted
  encounter role/weapon data to independent attacks-per-second and tiles-per-
  second values. Keep the mapping bounded in domain policy and document the
  constants alongside the tests.
- Use deterministic 50 ms simulation quanta, stable combatant ordering for
  simultaneous eligibility, and a battle-local seed derived from the committed
  encounter identity/state. The server alone resolves the selected target,
  movement path, skill, damage, effects, and terminal outcome.
- Start routine encounters in server-owned formations without a setup step.
  The default formation must cover solo and party play and up to three authored
  enemies, including boss adds. Preserve a path to explicit boss commands at
  sparse meaningful pauses.
- Define movement interruption, collision reservation release, status tick
  timing, same-quantum defeat, simultaneous defeat, and timeout behavior. The
  accepted prototype timeout is a 60-second simulated draw; activity services
  must decide how a draw commits for Hunt, Adventure, Duel, and a Dungeon room.
- Persist an immutable, versioned event/frame projection sufficient to replay
  positions, combat changes, and terminal results without rerunning rules.
  Save the replay with the corresponding health/run/reward result inside the
  existing repository transaction. Preserve retries, stale-version conflicts,
  participant snapshots, party ownership, reconnect state, and old replay
  readers.
- Keep one result-first stream receipt per command. Place overhead playback in
  the existing battle card/details, use semantic `visualAssetId` resolution,
  and retain pause, playback speed, reduced motion, accessible combat status,
  and finish/skip controls.

## Delivery checklist

The checkboxes below are release gates and stay open until the work has passed
its own tests, review, merge, and green `main` CI.

- [ ] **M01** Complete and reconcile the combat-path, simulator, replay,
  renderer, persistence, and compatibility audit above.
- [ ] **M02** Extract a reusable server-side arena domain engine, define the
  stat/role mapping and deterministic spatial rules, and validate/bound inputs.
- [ ] **M03** Migrate Hunt, ordinary Adventure, and Duel with real encounter
  data and preserved activity-specific rules.
- [ ] **M04** Migrate canonical single/multi-enemy Dungeon rooms, boss/add
  encounters, progression challenges, and published Arc encounters.
- [ ] **M05** Migrate or safely hydrate active legacy runs; remove alternate
  live resolution only after compatibility coverage passes.
- [ ] **M06** Commit the versioned replay atomically and render it in existing
  battle cards/details with historical replay compatibility.
- [ ] **M07** Add domain, service, repository, migration, replay, and Playwright
  coverage for all combat families, co-op, retry/stale requests, reload, and
  reconnect; inspect mobile and desktop playback.
- [ ] **M08** Run `npm run check`, `npm test`, relevant Playwright suites, and
  full `npm run test:e2e`; integrate only green work, verify `main` CI, and
  leave a concrete handoff listing any remaining human acceptance gates.

## Acceptance and handoff

Use [THREADBOUND_MASTER_PLAN.md](THREADBOUND_MASTER_PLAN.md)'s Phase M as the
canonical ordered checklist. Do not close Phase K from this implementation.
Human reviewers still need to judge comprehension, pacing, clarity, and whether
spatial positioning feels meaningful. The completion handoff must name the
merged commit, `main` CI evidence, tested combat families, inspected viewport
artifacts, replay migration behavior, and any open human experience decision.
