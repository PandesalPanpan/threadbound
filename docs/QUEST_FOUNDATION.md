# Quest foundation

M6-04 introduces the authoritative Quest lifecycle boundary without pre-implementing M6-05 objective mechanics or M6-06 presentation.

## Boundaries

- `src/domain/Quest.js` owns immutable Quest identity/world placement and the per-player lifecycle states `active`, `completed`, and `claimed`.
- `src/infrastructure/SQLiteQuestRepository.js` owns durable player/Quest lifecycle persistence in the shared SQLite database. A player can have at most one lifecycle row for a Quest.
- `src/application/QuestService.js` coordinates authoritative Quest browsing and acceptance. Availability is derived from the player's persisted current Area; the browser is not a source of Quest legality.
- Quest definitions are supplied as validated catalog data to the service. M6-04 does not publish new Arc content simply to exercise the model.
- A successful explicit acceptance may publish one concise `QuestAccepted` domain event. Duplicate acceptance is rejected and does not publish another event.

## Deliberate deferrals

- **M6-05** owns objective types, progress evaluation, completion triggers, and objective-specific event integration.
- **M6-06** owns the rich Adventure Stream Quest card and available/active/completed/claimable presentation/actions.
- **M6-07** owns validation rules for Arc-generated story quests.
- Reward granting/claim transactions must be attached to authoritative completion/claim behavior rather than invented in the browser.

This preserves the modular-monolith split: Domain Model owns lifecycle invariants, the Service Layer coordinates use cases, repositories own persistence, and later chat UI remains a projection.

## Verification

`test/quest-foundation.test.js` proves immutable definition validation, lifecycle transition invariants, durable SQLite persistence/idempotent acceptance, current-Area availability, and exactly-one acceptance publication.

## Handoff

After M6-04 is merged and green on `main`, continue **M6-05** by introducing the constrained readable objective vocabulary (`kill`, Hunt count, Adventure count, collect, boss, visit/speak) and wiring objective progress to authoritative committed game events. Do not move objective completion rules into Town/NPC presentation or browser code.
