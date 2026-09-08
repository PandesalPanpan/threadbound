# Content Breadth + Replayability

## Goal

A player should be able to repeat Threadbound runs without every dungeon collapsing into the same fixed enemy order and reaction rhythm. Content breadth must remain data-driven so adding an arc does not add a parallel combat engine.

## Fowler-style boundaries

### Domain Model and policies

`AdventureRun` remains the aggregate facade for the whole persisted dungeon lifecycle. `DungeonRun` still owns combat state and invariants. `CombatIntentPolicy` owns the meaning of enemy ability profiles, including the new `ally_hunter` profile. `RunVariationPolicy` owns deterministic selection among authored encounter sequences. `RunEventCatalog` remains the canonical event catalog but can also snapshot validated manifest-owned event schedules into a run.

No controller, browser component, or Arc Manifest executes combat rules.

### Service Layer

`ArcManifestService` validates and hydrates content into runtime dungeon definitions. It selects one encounter sequence when a generated dungeon is resolved for a new run. That resolved definition is then snapshotted into the existing run aggregate, so refresh/reconnect never rerolls an active dungeon.

Bundled content is deliberately published through the same `SQLiteArcManifestRepository` path as uploaded content. The Glasswake therefore exercises the same validator, publication, Codex projection, achievement projection, reward generation, and runtime hydration used by externally authored arcs.

### Repository and consistency boundaries

The existing repositories and optimistic run-version checks are unchanged. Encounter variation does not require another store. Completion rewards remain one `completeRunWithRewards` transaction. Realtime remains notification/projection transport rather than game truth.

## Arc Manifest replayability extensions

Manifest version 1 remains backwards-compatible. New optional fields are:

- `enemy.intentCadence` / `boss.intentCadence`: 1–6 explicit actions between telegraphs.
- `dungeon.encounterVariants`: alternate ordered encounter sequences using enemies from the same manifest.
- `runEvents`: two-to-four-choice authored discovery events using constrained numeric effects only.
- `dungeon.runEventSchedule`: places a set of manifest run events between normal encounters.

The downloadable JSON Schema exposes the same fields. `ArcManifestReplayabilityValidator` rejects bad cadence, broken enemy references, unsafe event effects, invalid positions, and unknown event references before publication.

## The Glasswake

The first bundled data-driven expansion is `The Glasswake` / `Mirrorfen Descent`.

Its distinctive pressure is `ally_hunter`: the enemy marks the most vulnerable living Weaver, creating a protect-the-party decision because another living Weaver can Guard to intercept and blunt the hit. Other enemies mix self-mending and heavy pressure so the dungeon alternates between protection, interruption, and guard timing instead of only changing names and art.

Mirrorfen Descent has three encounter sequences and two possible manifest-owned discovery events. The selected encounter sequence is server-authoritative and snapshotted at run start.

## Acceptance contract

The slice is not complete until:

1. The bundled manifest publishes through the normal manifest repository and validates with zero errors.
2. Seeded resolver rolls exercise every authored encounter sequence.
3. `ally_hunter` deterministically marks the most vulnerable living participant.
4. Manifest-owned discovery events pause and resume `AdventureRun` without losing the selected encounter.
5. Invalid replayability fields are rejected before save/publish.
6. Chromium discovers and completes Mirrorfen Descent through the normal adventure thread.
7. Completion reconstructs durable loot, +15 Thread Dust, and the Glasswake dungeon-clear achievement.
8. The complete existing Node/contract and Chromium regression suites stay green.

Subjective replay desire still requires human playtesting; automation only proves variation, decision opportunities, survival/completion, persistence, and absence of obvious scripted regressions.
