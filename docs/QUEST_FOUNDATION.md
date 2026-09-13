# Quest foundation

M6-04 introduced the authoritative Quest lifecycle boundary. M6-05 added constrained readable objectives and durable server-owned progress. M6-06 now projects that state into the Adventure Stream without moving Quest rules into browser code.

## Boundaries

- `src/domain/Quest.js` owns immutable Quest identity/world placement and the durable per-player lifecycle states `active`, `completed`, and `claimed`.
- `src/domain/QuestObjective.js` owns the allowlisted objective vocabulary, validation, readable labels, event matching, capped counters, and all-objectives-complete decision.
- Supported objective types are `kill`, `hunt`, `adventure`, `collect`, `boss`, `visit`, and `speak`. They are data only; generated content cannot inject executable objective behavior.
- `src/infrastructure/SQLiteQuestRepository.js` owns durable player/Quest lifecycle and objective-counter persistence in the shared SQLite database.
- `src/application/QuestService.js` coordinates authoritative Quest browsing, acceptance, event-driven progress, and claiming. The browser never increments Quest progress or promotes lifecycle state.
- `src/content/QuestCatalog.js` supplies a minimal neutral foundation Quest so the card can exercise the lifecycle without publishing a new Arc.

## Rich-card presentation

`quest` / `/quest` opens one rich card inside the existing Adventure Stream command-card surface. It does not create a Quest page or alternate application shell.

The API projects domain state into four player-facing states:

- no persisted progress -> `available`;
- domain `active` -> `active`;
- domain `completed` -> `claimable`;
- domain `claimed` -> `completed`.

Accept and Claim are authoritative POST actions. They each create one concise Adventure Stream receipt. Automatic objective progress and the automatic completion transition do not create extra standalone stream messages, avoiding message multiplication when a Hunt or Adventure already owns the command receipt.

M6-06 deliberately does not invent Quest rewards. Claim currently closes the durable lifecycle only; reward transactions belong with a later explicitly specified reward policy rather than browser presentation.

## Authoritative event mapping

- `kill` advances only on victorious `HuntResolved` or `AdventureResolved` events whose `enemyId` matches the objective target.
- `hunt` advances on each authoritative `HuntResolved` event.
- `adventure` advances on each authoritative `AdventureResolved` event.
- `collect` advances on `ItemGenerated` when its stable item/content identifier matches the objective target.
- `boss` advances on the per-player `DungeonCompleted` event for the targeted progression/dungeon id; aggregate completion events without a player id are ignored.
- `visit` and `speak` advance on authoritative `NpcInteracted` events for the targeted NPC.
- Once every objective is complete, the Quest lifecycle transitions to `completed`. Already-completed Quests are not advanced again.

## Deliberate deferrals

- **M6-07** owns validation/composition rules for Arc-generated story quests using only the allowlisted objective vocabulary.
- Quest reward/economy policy remains separate from the presentation milestone.
- No new Arc content, tactical dashboard, or headline currency is introduced by the Quest card.

This preserves the modular-monolith split: Domain Model/Policy owns objective semantics and lifecycle invariants, the Service Layer coordinates use cases and event-driven progress, repositories own persistence, and the chat card is a Presentation Model over server-owned facts.

## Verification

- `test/quest-foundation.test.js` covers immutable definition validation, lifecycle transitions, durable SQLite persistence/idempotent acceptance, current-Area availability, and exactly-one acceptance publication.
- `test/quest-objectives.test.js` covers the entire objective allowlist, readable labels, authoritative event matching, counter caps, durable reconstruction, completion, and exactly-once completion behavior.
- `test/quest-rich-card.test.js` covers available -> active -> claimable -> completed projection, authoritative claiming, invalid claims, and concise stream receipt policy.
- `test/e2e/quest-rich-card.spec.js` covers the real chat command, authoritative Accept/Hunt/Claim journey, duplicate-claim rejection, 390×844 layout width, and 44px mobile actions.

## Handoff

After M6-06 is merged and green on `main`, continue **M6-07** by allowing Arc-generated story quests to compose only these validated objective types. Do not let generated content supply executable Quest behavior.
