# Quest foundation and renewable Area loop

Status: **Area-linked Quest offers, durable progress, contextual NPC hooks, Arc-authored Quest composition, and atomic XP/Gold rewards are implemented and branch-verified on `feat/rpg-progression-loop`. This branch-local work remains unmerged and has no green `main` CI result.**

The Quest system uses a constrained objective vocabulary and server-owned
progress. `QuestService` coordinates reads and commands, `QuestObjective`
owns event matching, and `SQLiteQuestRepository` owns persistence and claim
transactions. The browser renders the resulting Quest cards and receipts; it
does not advance progress or compute rewards.

## Area offers and durable instances

`src/content/QuestCatalog.js` supplies 16 authored fallback templates, four
for each supported Area. `QuestService` composes these with
`ArcManifestService.runtimeQuests()`, which reads published Arc manifests:
Manifest v1 `storyQuests` and Manifest v2 `quests` both become constrained
Quest definitions for supported Areas. When an Arc Quest uses the same ID as a
foundation template, the published Arc definition takes priority; additional
Arc Quest IDs join the Area's eligible template pool alongside the fallbacks.
Bundled published content
is included through the normal Arc publication path.

The board normally presents three available opportunities for the player's
current Area. Offers rotate as templates are claimed, so more work becomes
available after claims. A previously claimed template can be accepted again
under a distinct stable instance ID; an active or completed-but-unclaimed
template does not appear as a duplicate offer.

Foundation templates are grounded in Area data: local enemy IDs, resident
NPCs, Towns, and progression challenge IDs. Arc Quests use manifest-owned
Area, Town, NPC, enemy, boss, item, and lore references. Manifest validation
keeps objectives inside the constrained vocabulary and rejects executable
content; runtime projection omits Arc kill Quests whose target is not in that
Area's Hunt or Adventure pool. Arc-authored descriptions and rewards are
preserved. When omitted, a description can be composed from the matching
Area lore summary and objective, and Gold/XP are derived from Area and
objective difficulty. Foundation rewards are authored for their Area and
objective difficulty.

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

## Arc Quest composition and scope

Arc Manifest v1 `storyQuests` and v2 Area-bound `quests` are projected into
the live Quest board only from published manifests. The Service Layer maps
manifest Area IDs to supported Area numbers, projects objective labels from
manifest references, and derives missing narrative/reward fields from the
published Arc and matching Area lore. Published definitions win over
same-ID foundation fallbacks. The accepted Quest stores its definition
snapshot, so a later publication or catalog rotation does not rewrite active
progress or claim rewards.

This composes Arc-authored Quest data with the existing Area/Town/player
systems; it does not publish a new Area or allow arbitrary executable Quest
logic. The supported world currently has Areas 1–4. Arc quests that reference
unsupported Area content or a kill target unavailable in their Area are not
offered.

## Chat presentation

`quest` / `/quest` opens a rich card in the Adventure Stream. Available,
active, claimable, and recently completed/claimed states are server-projected.
Accept and Claim are explicit actions and each creates one concise receipt.
Historical cards collapse through the shared rich-card snapshot boundary.

## Verification

Focused tests cover Quest identity/objective validation, lifecycle and durable
snapshots, published Arc offer priority, rotation and repeat instance IDs,
event-driven progress, exact Area/NPC references, reward transaction
rollback/idempotency, receipt facts, and mobile rich-card behavior. The
continuous progression journey also checks a lore-derived published Arc Quest,
claim replacement offers, and Area 2 Quest/Town/NPC context. Current suites include
`test/quest-foundation.test.js`, `test/quest-objectives.test.js`,
`test/quest-rewards.test.js`, `test/quest-rich-card.test.js`,
`test/town-foundation.test.js`, and the Quest/Town Playwright journeys.

Do not mark master-plan work complete until combined verification, these docs,
merge, and green `main` CI are all done.
