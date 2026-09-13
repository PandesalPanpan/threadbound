# Quest foundation

M6-04 introduced the authoritative Quest lifecycle boundary. M6-05 added constrained readable objectives and durable server-owned progress. M6-06 projected that state into the Adventure Stream. M6-07 now lets Arc authors compose generated Story Quest definitions from the same constrained objective vocabulary without giving generated content executable gameplay authority.

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

Quest claim still does not invent rewards. Reward transactions belong with a later explicitly specified reward policy rather than browser presentation or generated manifest data.

## Arc-generated Story Quest composition

Arc Manifest v1 may now optionally include `storyQuests`. This field is optional so existing manifests and bundled content remain migration-compatible.

Each Story Quest definition contains only:

- stable Quest id;
- title and optional description;
- an Area number placeholder;
- one or more constrained objective objects.

Objective mechanics are not duplicated in the Arc Manifest validator. `ArcManifestValidator` imports the domain-owned Quest objective vocabulary and normalizer, so generated definitions can only use `kill`, `hunt`, `adventure`, `collect`, `boss`, `visit`, or `speak` with the same target/count rules as normal Quest definitions.

Generated objective objects may only contain `id`, `type`, `targetId`, `targetLabel`, and `count`. Fields such as `script`, formulas, callbacks, or arbitrary mechanics are rejected rather than ignored. The world-context export exposes the same objective allowlist to AI/human authors, and the JSON Schema mirrors the data-only contract.

M6-07 deliberately stops at authoring/validation composition. Publishing a v1 Arc preserves validated `storyQuests` in the manifest record, but does not dynamically replace the live Quest catalog or invent new Area/Town/NPC bindings. Full generated-world Quest placement belongs to the Arc Manifest vNext work in M10-01, where Areas, Towns, NPCs, Shops, and Quests can be validated as one referential package.

## Authoritative event mapping

- `kill` advances only on victorious `HuntResolved` or `AdventureResolved` events whose `enemyId` matches the objective target.
- `hunt` advances on each authoritative `HuntResolved` event.
- `adventure` advances on each authoritative `AdventureResolved` event.
- `collect` advances on `ItemGenerated` when its stable item/content identifier matches the objective target.
- `boss` advances on the per-player `DungeonCompleted` event for the targeted progression/dungeon id; aggregate completion events without a player id are ignored.
- `visit` and `speak` advance on authoritative `NpcInteracted` events for the targeted NPC.
- Once every objective is complete, the Quest lifecycle transitions to `completed`. Already-completed Quests are not advanced again.

## Deliberate deferrals

- M10-01 owns full Arc Manifest vNext world binding for generated Areas, Towns, NPCs, Quests, Shops, equipment, and progression challenges.
- Quest reward/economy policy remains separate from generated Story Quest composition.
- Generated Story Quest definitions do not gain executable behavior or browser-owned progress rules.
- No new Arc content, tactical dashboard, or headline currency is introduced by this foundation.

This preserves the modular-monolith split: Domain Model/Policy owns objective semantics and lifecycle invariants, the Service Layer coordinates use cases and event-driven progress, repositories own persistence, Arc Manifest validation constrains untrusted generated data, and the chat card remains a Presentation Model over server-owned facts.

## Verification

- `test/quest-foundation.test.js` covers immutable definition validation, lifecycle transitions, durable SQLite persistence/idempotent acceptance, current-Area availability, and exactly-one acceptance publication.
- `test/quest-objectives.test.js` covers the entire objective allowlist, readable labels, authoritative event matching, counter caps, durable reconstruction, completion, and exactly-once completion behavior.
- `test/quest-rich-card.test.js` covers available -> active -> claimable -> completed projection, authoritative claiming, invalid claims, and concise stream receipt policy.
- `test/e2e/quest-rich-card.spec.js` covers the real chat command, authoritative Accept/Hunt/Claim journey, duplicate-claim rejection, 390×844 layout width, and 44px mobile actions.
- `test/arc-manifest.test.js` covers Story Quest persistence, all seven allowlisted objective types, world-context export, legacy manifests without Story Quests, duplicate objective ids, unsupported objective types, and executable-looking field rejection.

## Handoff

After M6-07 is merged and green on `main`, Phase 6 is complete. Continue **M7-01** by extending Arc Manifest equipment templates with familiar slot, rarity, stats, constrained effects, level/Area budget, and `visualAssetId` while preserving the existing Story Quest validation boundary.
