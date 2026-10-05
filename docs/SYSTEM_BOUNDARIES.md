# Threadbound system-boundary practice

Owner approved on 2026-10-05. This document refines the master plan's modular-monolith architecture. The master plan remains authoritative for product direction and execution order. This guidance does not authorize a general rewrite or claim the current code already enforces every boundary.

## Two ways to describe the application

Functional modules describe **what** the game does: Items, Characters, Combat, Quests, Economy, Parties, Chat, and so on. Technical layers describe **which responsibility** code performs inside those features:

| Layer | Responsibility | Example: buy a potion |
| --- | --- | --- |
| Presentation | Display information and collect intent | Show the Shop and send Buy |
| Application service | Coordinate one operation | Load the offer/player, arrange purchase, return a receipt |
| Domain model/policy | Decide what is allowed and calculate effects | Validate offer eligibility and purchase rules |
| Repository/infrastructure | Read/save state and implement atomic storage | Deduct Gold and grant the potion together |

Layers are responsibilities, not necessarily servers, packages, or one function per step. A straightforward operation need not gain extra abstractions merely to fill this table.

## Ownership and communication

- Keep Threadbound a modular monolith. Use in-process function/service calls and explicit data contracts; separate deployments require measured justification.
- Each feature owns its rules and operations. Do not make Combat, Chat, or a general GameService the owner of unrelated feature behavior.
- A caller uses the owning module's documented operations/projections rather than importing its storage details or reimplementing its rules. Contracts may be ordinary JavaScript functions/data; interfaces or mediator frameworks are not mandatory.
- Domain rules do not query SQLite or depend on browser markup, image URLs, transport, or sessions. Application services coordinate operations; repositories implement storage and atomic transitions.
- Gameplay persistence stays authoritative. Publish committed facts to receipts/history/realtime; those projections never determine outcomes or become alternate mutable gameplay state.
- Preserve atomicity across related effects. A purchase commits payment and the item together; a wager commits payment/settlement with the round; a fight commits its authoritative result/replay with relevant state transitions. Do not split these into independent calls or eventual events just to appear decoupled.
- Prefer explicit dependencies supplied at application composition. When modifying services that construct SQLite repositories internally, inject dependencies where useful for isolation/testing. Avoid broad unrelated rewrites.

## Feature boundaries

| Feature | Owns | Cross-feature contract |
| --- | --- | --- |
| Items / Inventory / Equipment | Item identity, ownership, slots, equip/upgrade/sell rules, item capabilities | Expose owned/equipped projections and a combat-loadout projection; coordinate economic changes atomically |
| Characters / progression | Base stats, growth, XP/level and derived character state | Expose canonical derived stats and apply progression through authoritative operations |
| Combat | Spatial timing, AI, attacks/heals/skills/status rules, deterministic outcome and replay | Consume immutable combatant/formation snapshots; return outcomes, never mutate inventory, Gold, quests, or stream storage |
| Encounter activities | Hunt/Adventure/Duel/Dungeon eligibility, roster/resource snapshots, lifecycle and activity-specific rewards | Coordinate Combat, persistence, progression and reward effects; retain Duel isolation and Dungeon attrition |
| Quests | Offers, acceptance, objectives, progress, claims | Consume authoritative gameplay facts through an explicit integration path; award claims atomically and retry-safely |
| Parties | Membership, leadership, readiness and participating-player ownership | Expose participant/readiness snapshots and formation/start ownership checks |
| Guild Hall / rankings | Population/profile/ranking projections | Read authoritative character/adventurer/Duel facts; do not assume a full player-created guild module exists |
| Economy / Bank | Consistent Gold balance, debit/credit/transfer invariants | Share transaction-aware balance operations with purchase/reward/wager paths; retain a single authoritative wallet state |
| Gambling | Game-specific wager eligibility, rounds, outcomes and payouts | Use Economy operations within atomic wager/settlement transitions; emit committed result facts |
| World / content | Area/Town/NPC definitions, unlock rules, validated Arc publication | Supply constrained encounter/item/quest definitions; published content stays data-only |
| Chat / Adventure Stream | Player messages, ordering/history, receipt presentation and transport | Share stream storage between chat and receipt projections; gameplay commands invoke the owning application services |
| Codex / achievements / history | Read projections and derived records | Consume committed facts; do not become another gameplay authority |

These are ownership guidelines, not a requirement to create a service for every table. Shops and cooking keep their feature rules while using Items/Economy contracts. Honey remains owned externally by Threaded through the existing gateway.

## Items to Combat: the first concrete seam

Owned items -> equipped loadout -> derived combat capabilities -> immutable encounter combatants -> simulation -> committed result/replay.

Combat needs role, basic action, range, stats, skills and bounded effects. It does not need purchasing/selling operations, mutable inventory ownership records, or repository access. The loadout projection must be consistent across encounter adapters and player previews. Asset IDs may be carried as presentation metadata, never used to decide mechanics.

Playback can be improved independently through a versioned replay contract. Prefer separating clock/viewing controls, replay state reconstruction, and arena visuals where this makes real work easier. Viewing controls never change saved outcomes.

## Baseline gaps and incremental adoption

The inspection in [CURRENT_COMBAT_SYSTEM_MAP.md](CURRENT_COMBAT_SYSTEM_MAP.md) found dedicated feature services/policies but also broad GameService/SQLiteGameRepository responsibilities, shared-table writes across features, service constructors tied to SQLite, Equipment-shaped combat inputs, skill-derived role inference, and combined chat/receipt and playback/rendering responsibilities.

Improve the boundary touched by an authorized feature change. Do not move all folders, replace the repository layer, add microservices, or create a universal coordinator as an unsolicited cleanup. Record a current-versus-target distinction; separate files do not prove encapsulation.

For a cross-feature change, document the owner, input/output contract, transaction boundary and affected consumers. Add meaningful tests at the rule/contract/storage boundary, plus relevant player-journey tests. Keep legacy compatibility until consumers are migrated and green. Follow master-plan completion gates; documentation alone does not complete implementation milestones.

## Learning the responsibilities through one action

For Buy Potion, imagine four questions: **What does the player see?** (presentation); **What steps must happen?** (application); **Is it allowed and what should it do?** (domain); **How do we save it safely?** (repository). A module is the feature those questions belong to, such as Shop or Inventory.

Further resources:

- [Advanced Web Application Architecture — Matthias Noback](https://matthiasnoback.nl/talk/advanced-web-application-architecture/): a talk on Domain, Application and Infrastructure layers, with video links.
- [Avoiding a Big Ball of Mud — CodeOpinion](https://www.youtube.com/watch?v=MLjjWkN44q4): module boundaries and communication within a monolith.
- [Organize Code by Feature — CodeOpinion](https://www.youtube.com/watch?v=PRns0rqPonA): how feature organization relates to technical layers.
- [Service Layer — Fowler catalog](https://martinfowler.com/eaaCatalog/serviceLayer.html): a short definition of coordinating application operations.
