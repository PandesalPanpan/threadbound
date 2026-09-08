# Combat V2 skills architecture

## Goal

Focus, cooldowns, statuses, and party combos must deepen combat without creating a second rules engine in the browser or coupling realtime delivery to correctness.

## Fowler-style boundaries

### Domain Model / aggregate consistency boundary

`DungeonRun` owns every invariant that changes a run:

- Focus gain/spend and cap
- per-player skill cooldowns
- enemy statuses such as `Exposed`
- cross-player combo consumption
- skill damage/healing
- skill-based interruption
- encounter/run transitions

A skill command either produces one valid next run state or fails without a committed write. HTTP handlers and UI code never calculate combat results.

### Catalog as stable combat vocabulary

`CombatSkillCatalog` is the canonical vocabulary for currently built-in skills. It contains immutable definitions (cost, cooldown, kind and effect parameters), while `DungeonRun` interprets those definitions inside the aggregate. This keeps IDs and presentation metadata centralized without turning the catalog into a mutable source of run state.

If future generated Arc content needs custom skills, extend this seam through validated definitions rather than branching Express/frontend code per skill.

### Service Layer

`GameService.useSkill(playerId, runId, skillId)` coordinates the use case:

1. load the authoritative persisted run and character,
2. invoke `DungeonRun.useSkill`,
3. save through the repository,
4. publish fine-grained domain events,
5. publish one `CombatActionResolved` projection for the shared thread.

It does not reimplement Focus, cooldown or combo rules.

### Repository + Optimistic Offline Lock

`SQLiteGameRepository.saveRun` remains the write gate. Run `version` prevents two actors using stale copies of the same shared run from both committing. Skill spending therefore inherits the same concurrency guarantee as Attack, Guard, Mend and Revive.

A contract test intentionally spends Focus from two copies of the same run version and proves only the first save succeeds.

### Adventure Stream as projection

The Adventure Stream is still a read/presentation projection, not the source of combat truth and not Event Sourcing. `CombatActionResolved` carries enough committed metadata to make a skill result understandable after live delivery, reconnect, or history reconstruction.

The browser skill panel reads `/api/dashboard` and submits commands; it never predicts damage or mutates run state locally. Disabled cooldown/Focus states are presentation hints over authoritative persisted values.

### Realtime remains replaceable transport

WebSocket/SSE notifications only tell clients that committed state changed. A lost realtime message cannot lose Focus, a cooldown, Exposed, or a combo because those live in the persisted run aggregate and reconstruct from `/api/dashboard`.

## Scaling direction

Keep this a modular monolith while the boundaries remain cohesive. The next combat slices should extend the same domain seams:

- boss phase policy and phase transitions inside the combat domain,
- validated generated skill/status definitions through content policy/catalog seams,
- gear effects translated into domain inputs rather than frontend conditionals,
- telemetry/read models derived from committed events, not used as combat authority.

Do not split combat, realtime, or progression into services merely for theoretical scale. Extract a process boundary only when deployment/load/team ownership creates an actual independent scaling need.
