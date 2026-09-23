# Quest foundation and renewable Area loop

Status: **Area-linked Quest offers, durable progress, contextual NPC hooks, and atomic XP/Gold rewards are implemented and branch-verified. Delivery remains pending merge and green `main` CI.**

The Quest system uses a constrained objective vocabulary and server-owned
progress. `QuestService` coordinates reads and commands, `QuestObjective`
owns event matching, and `SQLiteQuestRepository` owns persistence and claim
transactions. The browser renders the resulting Quest cards and receipts; it
does not advance progress or compute rewards.

## Area offers and durable instances

`src/content/QuestCatalog.js` contains 16 authored templates, four for each
supported Area. The three currently offered opportunities rotate as templates
are claimed, so the player sees several useful choices per Area and additional
work after finishing claims. A previously claimed template can be accepted
again under a distinct stable instance id; an active or completed-but-unclaimed
template does not appear as a duplicate offer.

Templates are grounded in Area data: real local enemy IDs, resident NPCs,
Towns, and progression challenge IDs. Rewards use authored Gold and XP amounts
appropriate to Area and objective difficulty. Objectives remain data, not
arbitrary executable content.

Accepting a Quest persists an immutable definition snapshot alongside its
instance ID and objective progress. Catalog rotation or later template edits
do not rewrite an accepted Quest. Reload and reconnect reconstruct the same
accepted definition and counters.

## Domain objective vocabulary

`src/domain/QuestObjective.js` owns the supported objective types:

- `kill`
- `hunt`
- `adventure`
- `collect`
- `boss`
- `visit`
- `speak`

Validation rejects executable-looking fields, unknown types, invalid counts,
and malformed targets. Progress advances only from matching authoritative
gameplay events, caps at the requested count, and promotes the Quest to its
completed state only after every objective is done.

## Claim rewards and receipts

Claiming is an authoritative transaction that changes Quest state and awards
the snapshotted Gold and XP. Quest progression XP uses the shared
`SQLitePlayerProgressionRepository`; level-derived Max HP is committed in the
same database transaction. Duplicate or incomplete claims fail without paying
out a second reward. The claim receipt shows the reward and any Level/Max HP
gain in one concise result.

Automatic objective progress does not create a second stream message. The
Hunt, Adventure, NPC interaction, or Dungeon command owns its public result;
Quest cards refresh from the projected persisted Quest state.

## Town and lore context

The four Area Town cards include service NPCs and authored background
characters. `TownService` chooses from constrained authored dialogue using
stable server-side context such as Area, unlocked frontier, and Quest history.
NPC interaction posts one shared receipt and advances `speak`/`visit`
objectives from the same authoritative event. An NPC reference in a Quest is
validated against the Town/Area catalog.

Service NPC conversation can point to relevant work but does not silently
mutate Heal, Bank, Shop, Upgrade, or Quest state. The existing service APIs
remain authoritative for those actions.

## Arc Story Quest composition

Arc Manifest v1 may optionally include `storyQuests`. This authoring field is
validated against the same objective vocabulary and rejects arbitrary script,
formula, callback, or mechanic fields. Publishing an Arc preserves validated
Story Quest data, but does not dynamically replace the live authored Area
catalog. Full generated-world Quest placement remains part of a future
manifest-boundary decision.

## Chat presentation

`quest` / `/quest` opens a rich card in the Adventure Stream. Available,
active, claimable, and recently completed/claimed states are server-projected.
Accept and Claim are explicit actions and each creates one concise receipt.
Historical cards collapse through the shared rich-card snapshot boundary.

## Verification

Focused tests cover Quest identity/objective validation, lifecycle and durable
snapshots, rotation and repeat instance IDs, event-driven progress, exact
Area/NPC references, reward transaction rollback/idempotency, receipt facts,
and mobile rich-card behavior. Current suites include
`test/quest-foundation.test.js`, `test/quest-objectives.test.js`,
`test/quest-rewards.test.js`, `test/quest-rich-card.test.js`,
`test/town-foundation.test.js`, and the Quest/Town Playwright journeys.

Do not mark master-plan work complete until combined verification, these docs,
merge, and green `main` CI are all done.
