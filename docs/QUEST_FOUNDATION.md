# Quest foundation

M6-04 introduced the authoritative Quest lifecycle boundary. M6-05 extends that foundation with constrained readable objectives and durable server-owned progress without introducing the M6-06 Quest card or M6-07 Arc-generated quest composition.

## Boundaries

- `src/domain/Quest.js` owns immutable Quest identity/world placement and the per-player lifecycle states `active`, `completed`, and `claimed`.
- `src/domain/QuestObjective.js` owns the allowlisted objective vocabulary, validation, readable labels, event matching, capped counters, and all-objectives-complete decision.
- Supported objective types are `kill`, `hunt`, `adventure`, `collect`, `boss`, `visit`, and `speak`. They are data only; generated content cannot inject executable objective behavior.
- `src/infrastructure/SQLiteQuestRepository.js` owns durable player/Quest lifecycle and objective-counter persistence in the shared SQLite database. Existing databases are migrated with an additive `objective_progress_json` column.
- `src/application/QuestService.js` coordinates authoritative Quest browsing/acceptance and subscribes to committed domain events when an EventBus is supplied. The browser never increments Quest progress.
- Quest definitions are supplied as validated catalog data to the service. These foundation milestones do not publish new Arc content merely to exercise the model.

## Authoritative event mapping

- `kill` advances only on victorious `HuntResolved` or `AdventureResolved` events whose `enemyId` matches the objective target.
- `hunt` advances on each authoritative `HuntResolved` event.
- `adventure` advances on each authoritative `AdventureResolved` event.
- `collect` advances on `ItemGenerated` when its stable item/content identifier matches the objective target.
- `boss` advances on the per-player `DungeonCompleted` event for the targeted progression/dungeon id; aggregate completion events without a player id are ignored.
- `visit` and `speak` advance on authoritative `NpcInteracted` events for the targeted NPC.
- Once every objective is complete, the Quest lifecycle transitions to `completed` and emits one `QuestCompleted` event. Already-completed Quests are not advanced again.

## Deliberate deferrals

- **M6-06** owns the rich Adventure Stream Quest card and available/active/completed/claimable presentation/actions.
- **M6-07** owns validation/composition rules for Arc-generated story quests using only the allowlisted objective vocabulary.
- Reward granting/claim transactions must be attached to authoritative completion/claim behavior rather than invented in the browser.
- No new Arc content, tactical dashboard, or headline currency is introduced by the objective foundation.

This preserves the modular-monolith split: Domain Model/Policy owns objective semantics and lifecycle invariants, the Service Layer coordinates event-driven progress, repositories own persistence, and later chat UI remains a projection.

## Verification

- `test/quest-foundation.test.js` covers immutable definition validation, lifecycle transitions, durable SQLite persistence/idempotent acceptance, current-Area availability, and exactly-one acceptance publication.
- `test/quest-objectives.test.js` covers the entire objective allowlist, readable labels, authoritative event matching for kill/Hunt/Adventure/collect/boss/visit/speak, counter caps, durable reconstruction, completion, and exactly-once completion behavior after lifecycle closure.

## Handoff

After M6-05 is merged and green on `main`, continue **M6-06** by projecting available/active/completed/claimable Quest state into a rich Adventure Stream card. Reuse these server-owned labels/counters and do not implement alternate progress rules in browser code.
