# Player fun / balance pass

This slice reduces objective combat repetition without claiming that automation can prove Threadbound is fun.

## Problem observed

Frayed Hollow's three normal enemies had different names and sprites but shared the same effective combat rhythm. With 12 HP and the original three-attack normal telegraph cadence, a normal enemy could often be defeated before its distinctive reaction decision appeared. That made repeated Strike actions disproportionately attractive and weakened enemy identity.

## Player-facing change

Newly started Frayed Hollow runs snapshot a distinct pressure profile for each normal enemy:

- **Frayed Wisp — Self Mend.** Its first telegraph is recovery. Interrupt prevents the Wisp from undoing damage.
- **Hollow Stalker — Heavy Pressure.** Its first telegraph is a stronger Fraying Blow. Guard meaningfully reduces the hit; Interrupt cancels it.
- **Silkbound Guard — Mixed Pressure.** It alternates stronger attacks with recovery, so both Guard and Interrupt remain relevant.

Canonical normal enemies now telegraph after the first committed offensive action instead of commonly dying before a telegraph can matter. The First Needle keeps its existing Phase I and Phase II cadence, including Threadmark behavior.

## Fowler-style boundaries

### Domain Model remains authoritative

`DungeonRun` still owns the run aggregate: HP, threat, Focus, intents, reactions, encounter transitions, boss phases and optimistic version all remain one authoritative state transition. The browser receives state and submits commands; it does not calculate encounter legality or balance outcomes.

### Policy owns varying combat rules

`CombatIntentPolicy` owns the constrained enemy-pressure vocabulary and converts an enemy's snapshotted ability IDs into deterministic intent patterns and tuning. Enemy-specific variation therefore does not become controller conditionals or duplicated browser logic.

The stable ability vocabulary is:

- `basic_retaliation`
- `heavy_pressure`
- `self_mend`

### Service Layer and repositories stay unchanged

No new application service, repository, database table, or microservice was introduced. `GameService` continues to coordinate commands around the existing aggregate and persistence boundary. SQLite remains responsible for persistence and optimistic concurrency, not combat decisions.

### Arc Manifest validation depends on the domain vocabulary

`ArcManifestValidator` derives its allowed enemy ability IDs from `CombatIntentPolicy`'s exported catalog. This prevents a second hand-maintained allow-list from drifting away from executable domain behavior. Generated arcs can opt enemies into the same constrained pressure profiles, while unsupported mechanics remain rejected.

### Snapshot compatibility

The selected abilities and intent cadence are copied into each newly created enemy snapshot. Active-run state continues to be authoritative; old snapshots hydrate safe defaults rather than being silently rewritten from current content definitions.

## Acceptance contract

This pass is not complete unless automated tests prove:

- a Hollow Stalker telegraphs heavy pressure before a second ordinary attack;
- Guard reduces the heavy hit and Interrupt cancels it;
- a Frayed Wisp opens with recovery pressure that rewards Interrupt;
- a mixed enemy alternates damage and recovery intents deterministically;
- generated enemies can use the same constrained ability vocabulary;
- Arc Manifest validation derives its allow-list from the domain catalog and still rejects unknown mechanics;
- existing boss phases, skills, relic attunements, run events, reconnect, realtime/co-op, Codex, Arc Workshop, local auth and Threaded-auth acceptance suites remain green.

## What this does not prove

PX-15, PX-26, PX-27 and PX-37 remain human-playtest questions. The automated result is narrower: normal encounters now force visible, mechanically different decisions before they can routinely collapse into two Strike presses, and the implementation preserves the current scalable architecture boundaries.
