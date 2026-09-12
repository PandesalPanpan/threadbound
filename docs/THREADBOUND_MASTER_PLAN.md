# Threadbound Master Plan

> Status: canonical product and execution plan for the next major Threadbound rebuild.
>
> Product goal: **EPIC-RPG-level gameplay clarity in a standalone two-player RPG**, then expand that foundation with Threadbound's generated world, visuals, lore, NPCs, quests, towns, simulated adventurers, and richer RPG systems.

## 1. Product north star

Threadbound is primarily for two human players. Optimize for the actual fun of playing together rather than scale-oriented social features that only matter for a large public audience.

The player fantasy is straightforward:

> Be an adventurer. Hunt monsters, level up, earn Gold, find and buy stronger gear, take quests, revisit old Areas, travel through towns, challenge Adventures, defeat progression bosses together, unlock the next Area, and build a shared history.

The world tone is approximately:

- 70% lighthearted, colorful guild-anime adventure;
- 20% exciting danger;
- 10% serious/emotional moments.

Avoid making the default world feel relentlessly bleak. Lore may become dramatic, but ordinary play should feel adventurous, friendly, colorful, curious, and occasionally funny.

## 2. Non-negotiable product principles

### 2.1 Copy EPIC RPG's clarity, not its platform limitations

Threadbound should be approximately a 9/10 match for the clarity and immediacy of EPIC RPG's loop while keeping its own world, art, lore, realtime co-op, and standalone UI.

Common player-facing concepts should use obvious words:

- Hunt
- Adventure
- Quest
- Inventory
- Shop
- Buy
- Sell
- Equip
- Upgrade
- Heal
- Bank
- Deposit
- Withdraw
- Area
- Town
- Party
- Duel
- Profile
- Achievements
- Leaderboard

Lore-heavy names belong in content, NPCs, places, item names, enemies, bosses, stories, and Arc identity—not in basic controls.

Examples of terms to retire from the primary UX:

- `Thread Dust` -> `Gold`
- `Temper` -> `Upgrade`
- `Relic Pouch` -> `Inventory`
- `Mend` -> `Heal`
- `Weaver` -> `Adventurer` or player name in routine UI

Internal migration names may remain temporarily in persistence/code when changing them immediately would create unnecessary risk, but no new player-facing work should deepen the old terminology.

### 2.2 Chat is the application shell

Do not turn Threadbound into a conventional dashboard with separate pages for every system.

The Adventure Stream is the primary application surface. Every command, button press, interaction, NPC conversation, reward, purchase, duel, quest update, party event, and game action should create a coherent stream entry.

Rich commands such as `inventory`, `shop`, `bank`, `profile`, `leaderboard`, `quest`, and `town` should open **large interactive chat cards** that can look almost like modal screens on mobile while remaining part of the stream.

Only the newest relevant card should remain fully interactive. Old large interactive cards should collapse into concise historical snapshots to prevent chat-history clutter.

Example historical collapse:

`🎒 Inventory viewed · 18 items · Attack 74 · Defense 52`

Tapping a Hunt button is equivalent to entering `hunt`: it must still produce the same public game receipt.

### 2.3 Result first, detail on demand

Routine grinding should stay fast.

A Hunt receipt should immediately communicate:

- opponent / encounter;
- result;
- HP change;
- XP gained;
- Gold gained/lost;
- important item drop;
- level-up or quest progress;
- next useful actions.

Full automatic turn history should not flood the main stream. Provide a `Battle details` / `View turns` control that opens a modal or expanded detail view containing the turn-by-turn simulation.

### 2.4 Server-authoritative rules

Browser/chat presentation never decides authoritative outcomes.

Use Fowler-style patterns where they solve a real boundary:

- **Domain Model / Policy** owns combat, stats, effects, progression, death penalties, loot, Area unlock rules, bot simulation constraints, and quest completion rules.
- **Service Layer** coordinates use cases such as Hunt, Adventure, Shop, Bank, Duel, Quest, Area travel, NPC interaction, and bot progression ticks.
- **Repositories** own persistence and transaction boundaries.
- **Read Models / Projection** provide chat-card data and leaderboards.
- **Gateway** remains the boundary to external Threaded/Honey ownership.
- **Presentation Model** renders rich chat cards and receipts without reimplementing game rules.

Do not introduce microservices, CQRS infrastructure, or event sourcing merely for ceremony. Threadbound remains a modular monolith until measured constraints justify otherwise.

## 3. Core world model

### 3.1 Arc

An Arc is a durable content package that expands the permanent world. Publishing a new Arc must never replace older Arcs.

Each Arc should normally contain approximately:

- 3-6 Areas;
- 1-2 Towns;
- 10-20 normal enemies;
- 3-6 elite enemies;
- 2-4 bosses;
- 20-40 equipment/items;
- 5-15 NPCs;
- 10-20 quests;
- one or more Shops;
- crafting recipes when appropriate;
- food recipes / fight-count buffs when appropriate;
- achievements;
- story/lore;
- visual asset mappings;
- recommended level bands;
- one or more progression Adventures/bosses.

### 3.2 Area

Areas are permanent selectable world locations.

Rules:

- defeating the current progression challenge unlocks the next Area;
- all previously unlocked Areas remain selectable forever;
- players can return to older Areas to Hunt, Adventure, complete quests, visit towns, farm specific enemies, and target older drops;
- enemy level/stats and loot identity belong to their Area/content snapshot rather than automatically scaling everything to the player;
- progression challenges may only be attempted when their prerequisite Area/progression conditions are satisfied.

This allows a high-level player to intentionally revisit weaker content.

### 3.3 Town

A Town is an Area hub containing named NPCs and services. Example roles:

- Shopkeeper
- Blacksmith / equipment upgrader
- Banker
- Innkeeper / Healer
- Quest giver / Quest board
- Cook
- Crafter
- Guild Hall
- special Arc NPCs

NPC interactions should happen through rich entries in the Adventure Stream rather than requiring a separate app shell.

### 3.4 Guild halls and simulated adventurers

Towns may contain guild halls populated by persistent simulated adventurers.

These adventurers should use the same meaningful character model as human players where practical:

- name and identity;
- level and XP;
- Area reached;
- Hunt / Adventure counts;
- equipment and derived stats;
- achievements;
- duel record;
- leaderboard placement;
- personality/activity profile.

They do **not** grind continuously. Offline progression should occur at believable bounded rates derived from their activity profile. A casual adventurer may act only a few times per day; a dedicated one may progress more often.

Strong town/Arc adventurers may intentionally begin far above the humans as long-term stat-check rivals.

Bots must:

- never spend or mint Honey;
- never create items outside the same validated loot/content system;
- never secretly alter human-owned resources;
- obey bounded progression rules;
- be deterministic/retry-safe enough that repeated simulation jobs cannot duplicate progression.

## 4. Core player progression

### 4.1 Level and XP

Players gain XP primarily from Hunt, Adventure, quests, bosses, and selected activities.
Level should be one of the clearest long-term progression signals and should gate/recommend content without preventing players from revisiting old Areas.

### 4.2 Currency

Use exactly two headline currencies:

- **Gold** — normal earned/spent game currency.
- **Honey** — premium currency owned authoritatively by Threaded.

Remove Thread Dust/material currencies from the default economy. Crafting ingredients may exist as ordinary items, but they are not additional headline wallets.

### 4.3 Bank

The Bank is intentionally simple at first:

- deposit Gold;
- withdraw Gold;
- banked Gold is protected from ordinary death loss;
- carried Gold is visible separately from banked Gold.

Future bank upgrades are out of scope until basic play proves they add value.

### 4.4 Equipment

Use familiar equipment slots rather than an abstract Relic-only model.

Initial target slots:

- Weapon
- Helmet
- Armor
- Boots
- Accessory

Base stats should remain legible:

- Attack
- Defense
- Max HP
- Speed
- Crit Chance

Rarities:

- Common
- Uncommon
- Rare
- Epic
- Legendary
- Mythic

Use strong consistent rarity styling in rich cards and receipts.

Equipment may also provide small special effects such as:

- increased Gold from Hunts;
- healing after battle;
- Hunt/Adventure cooldown reduction;
- elemental/status application;
- resistance;
- limited fight-count buffs.

The same persisted item should retain stable generated art through `visualAssetId`.

### 4.5 Upgrade

`Upgrade` replaces player-facing `Temper`.

Keep the first upgrade model simple enough that players can compare the before/after result directly in chat. Do not require an extra crafting currency merely to justify upgrading.

## 5. Battle model

### 5.1 Routine battle = automatic simulation

Hunt, ordinary Adventure fights, and Duel should normally auto-resolve on the server.

The player starts the activity; the battle engine resolves turns according to authoritative stats/effects; the main receipt shows only the important result; detailed turns are available on demand.

This preserves EPIC-RPG-like command simplicity while allowing a deeper RPG under the hood.

### 5.2 Progression bosses = slightly interactive

Major progression bosses, especially party-required ones, may pause at a small number of meaningful decision points.

Do **not** rebuild the old permanent tactical dashboard. Interaction should be sparse and obvious—for example, an occasional Heal / Use Item / coordinated response—while most turns remain automatic.

### 5.3 Shared stat model

Humans, simulated adventurers, mobs, elites, and bosses should use compatible concepts where appropriate:

- Attack
- Defense
- Max HP
- Speed
- Crit Chance
- resistances / immunities
- status/element effects

### 5.4 Speed

Speed determines initiative and action frequency, not merely who attacks first.

A sufficiently large Speed advantage may grant additional actions before the slower combatant acts again. The exact formula is a balance decision and must be centralized in domain policy, covered by tests, and inspectable through battle details.

### 5.5 Effects and resistances

Initial effect vocabulary:

- **Fire** — additional damage across subsequent attacks/turns.
- **Poison** — stacking damage pressure.
- **Ice** — reduces Speed.
- **Psychic** — reduces offensive and/or defensive effectiveness.

Enemies may have:

- resistance;
- high resistance;
- immunity;
- vulnerability where useful.

Effects must come from a constrained validated vocabulary. Arc generation may select/configure allowlisted mechanics; generated content must never inject arbitrary executable combat code.

## 6. Activities

### 6.1 Hunt

Quick repeatable grind activity.

Primary rewards:

- XP;
- Gold;
- common/rare drops;
- quest progress.

Hunt has a short cooldown so one afternoon cannot become hundreds of progression actions. Cooldowns should be materially shorter/friendlier than large-public-bot pacing, because Threadbound only needs to serve the two humans well.

Equipment attributes or selected buffs may reduce Hunt cooldown within capped limits.

### 6.2 Adventure

Adventure is riskier and more rewarding than Hunt and may include:

- stronger enemies;
- elites;
- story encounters;
- NPC events;
- quest events;
- uncommon/rare rewards;
- party encounters;
- progression challenges.

Adventure also uses a bounded cooldown and may have party requirements.

### 6.3 Progression Adventure / boss

Major progression challenges require both human players unless a specific content rule intentionally says otherwise.

Defeating the challenge unlocks the next Area.

### 6.4 Quest

Support simple readable quest objectives plus occasional richer generated story quests.

Examples:

- Hunt 8 Forest Slimes
- Adventure 3 times in Area 2
- Defeat the Bandit Captain
- Bring 2 Wolf Pelts
- Speak to an NPC after completing an objective

Quest tracking and claim/progress should be available directly through a rich `quest` card.

### 6.5 Gambling

Desired side activities:

- Blackjack
- Slots
- Coinflip

They use Gold only—never Honey.

They must be bounded game-economy activities, not real-money gambling, and should reuse the same authoritative transaction/idempotency practices as other Gold mutations.

### 6.6 Crafting and cooking

Crafting is optional early but part of the target architecture.

Cooking is desirable when it creates simple useful consumables.

Prefer **fight-count buffs** over real-time durations.

Example:

`Spicy Wyvern Stew · +10% Attack for next 8 fights`

Players should not lose buff value merely because they go AFK.
## 7. Death and failure
### 7.1 Normal death

Default consequence:

- lose 20% of **carried** Gold;
- banked Gold is safe.

If carried Gold is below a configured minimum, a dangerous activity may instead risk one eligible non-bound equipped item—but only when the player received a clear risk warning before entering that content.

Do not casually destroy best-in-slot gear through an invisible random penalty.

### 7.2 Progression boss deaths

A progression boss gains an `Enraged`/death stack after failed attempts.

- each stack increases difficulty modestly;
- the stack count is capped (target range 3-5; exact tuning later);
- defeating the boss resets its failure stacks;
- the receipt must clearly communicate the current stack and consequence.

The purpose is memorable consequence, not an unwinnable spiral.

## 8. Rich chat UI contract

### 8.1 Every explicit action enters the stream

Buttons are command conveniences, not silent UI mutations.

Examples that must create receipts/events:

- Hunt
- Adventure
- Heal
- Buy
- Sell
- Equip
- Upgrade
- Deposit / Withdraw
- Quest accept/claim
- Travel Area
- Duel
- Blackjack / Slots / Coinflip
- NPC interaction
- Party readiness / progression start

### 8.2 Rich cards

Required rich command-card families:

- Inventory
- Shop
- Bank
- Profile
- Area / Map
- Town / NPC list
- Quest
- Party
- Leaderboard
- Achievements
- Duel target/profile
- Gambling activities

Cards should use project-owned sprites/icons wherever appropriate and follow the approved mobile Figma hierarchy/style rather than reverting to generic browser forms.

### 8.3 Battle receipt

Main battle receipt should be extremely scannable.

Illustrative structure:

- enemy sprite/name and victory/defeat;
- player HP before -> after;
- `+XP`;
- `+Gold` or death loss;
- important loot with rarity sprite;
- level-up / quest / achievement progress;
- `Battle details` control;
- one or two useful next actions.

Confirmed damage should be visually distinguishable from healing, rewards, status effects, and projected information. Do not use color alone; retain icons/text semantics.

### 8.4 Battle details modal

Opening battle details shows the automatic turn-by-turn log without adding dozens of messages to the main stream.

Example events:

- player attacks first;
- damage;
- critical hit multiplier;
- Burn/Poison tick;
- Ice Speed reduction;
- resistance/immunity;
- extra action caused by Speed;
- healing/item use;
- defeat.

## 9. Arc Manifest evolution

Keep the existing validated Arc Manifest pipeline, but evolve its contract toward the new world model.

The schema should eventually cover or reference:

- Arc metadata/tone;
- Areas and unlock graph/order;
- Towns;
- NPCs;
- Shops / stock generation rules;
- enemies/elites/bosses;
- equipment templates and rarity/stat budgets;
- quests;
- story events;
- crafting recipes;
- cooking recipes/buffs;
- achievements;
- recommended level bands;
- progression Adventures;
- visualAssetIds;
- constrained combat effects/resistances;
- bot adventurer templates when content-specific rivals are desired.

Generated Arc content remains data, not executable code.

## 10. Migration strategy

Use a strangler-style migration. The current game is working and green; do not destabilize everything in one rewrite.

New architecture should replace old player-facing behavior incrementally behind tests.

Legacy tactical systems may remain temporarily for persisted-run compatibility, but they must not dictate new default UX.

Old terminology/storage can be migrated in controlled steps:

- first change projections/player-facing copy;
- then introduce new canonical domain names where safe;
- add schema/data migration only when necessary;
- preserve old persisted data until the new path is proven.

## 11. Current repo gap assessment

As of the plan's creation, `main` already provides useful foundations:

- server-authoritative modular-monolith boundaries;
- durable SQLite persistence/sessions;
- realtime Adventure Stream;
- chat command routing;
- Hunt service and automatic short battle behavior;
- simple dungeon/co-op foundations;
- Inventory/equipment persistence;
- server-owned Shop service/catalog;
- recovery/potions;
- achievements/Codex/history projections;
- validated Arc Manifest pipeline;
- semantic generated visual asset catalog and runtime sprites;
- Playwright/mobile/regression gates;
- Threaded-owned Honey boundary.

But the current product is **not** the target game yet. Notable gaps include:

- Thread Dust instead of Gold;
- Relic/Temper terminology instead of normal equipment/Upgrade;
- no complete level+XP progression loop surfaced as the primary game;
- no familiar five-slot equipment foundation;
- no Bank;
- no Areas and persistent revisit/travel progression;
- no Town model / rich NPC interaction loop;
- no full Quest loop;
- no general Adventure activity matching this plan;
- no generated per-Arc shop/equipment breadth;
- no simulated guild adventurers;
- no Duel loop against those adventurers;
- no Leaderboard built around meaningful persistent adventurer stats;
- no Blackjack / Slots / Coinflip;
- no fight-count cooking buffs;
- no target automatic combat engine with Speed action frequency + effect resistance/immunity;
- no polished battle-details modal contract;
- first Arc/tone does not match the desired colorful guild-anime direction;
- rich generated sprite coverage exists but is not yet integrated broadly enough throughout the chat experience.

## 12. Ordered implementation checklist

Agents must work **in this order unless a previous task proves a dependency requires a small prerequisite**. Do not jump ahead to new Arc content while foundation phases are unfinished.

### Phase 0 — lock the execution contract

- [x] **M0-01** Make this document the canonical next-work source from `AGENTS.md` and README.
- [x] **M0-02** Add/update tests or docs that explicitly reject reintroducing the old tactical default as the product target.
- [x] **M0-03** Record current migration-safe legacy terminology/state that must temporarily remain compatible.

### Phase 1 — simple language + core character/economy model

- [x] **M1-01** Introduce canonical Gold projection/model and migrate player-facing Thread Dust to Gold without breaking persisted users.
- [x] **M1-02** Replace player-facing Temper/Relic terminology with Upgrade/Inventory/Equipment.
- [x] **M1-03** Establish canonical XP + Level progression and expose it in Profile and routine receipts.
- [x] **M1-04** Establish familiar equipment slots: Weapon, Helmet, Armor, Boots, Accessory.
- [x] **M1-05** Establish readable derived stats: Attack, Defense, Max HP, Speed, Crit Chance.
- [x] **M1-06** Establish rarity contract: Common -> Mythic and consistent rich-card styling.
- [x] **M1-07** Preserve Honey as external Threaded-owned premium currency; prove local mode cannot mutate it.
### Phase 2 — chat shell and rich cards
- [x] **M2-01** Define a reusable rich chat-card/panel presentation primitive for app-like cards inside the stream.
- [x] **M2-02** Inventory rich card: all items, equipment slots, stats, rarity, sprites, Equip/Sell/Upgrade actions.
- [x] **M2-03** Shop rich card: generated/catalog stock, sprites, prices, Buy/Sell, affordability, normal equipment/potions.
- [x] **M2-04** Profile rich card: level, XP, Gold, banked Gold, primary stats, equipment, Area, achievements summary.
- [x] **M2-05** Bank rich card: deposit/withdraw with carried-vs-banked Gold.
- [x] **M2-06** Historical rich cards collapse to compact immutable snapshots after a newer card supersedes them.
- [x] **M2-07** Integrate generated sprites/icons throughout these cards and align mobile hierarchy with approved Figma direction.

### Phase 3 — automatic battle engine

- [x] **M3-01** Create one authoritative automatic combat simulator usable by Hunt, Adventure, Duel, and suitable boss phases.
- [x] **M3-02** Implement Attack/Defense/HP/Crit semantics with deterministic/testable RNG injection where needed.
- [x] **M3-03** Implement Speed initiative/action-frequency policy including bounded extra actions.
- [x] **M3-04** Implement constrained Fire, Poison, Ice, Psychic effect vocabulary.
- [x] **M3-05** Implement resistance/high-resistance/immunity handling.
- [x] **M3-06** Implement generated/special equipment effects through constrained validated effect data.
- [x] **M3-07** Add concise main receipt + detailed battle-turn read model.
- [x] **M3-08** Add Battle Details modal/expansion without flooding the stream.
- [x] **M3-09** Keep major progression bosses capable of sparse player/party decision points without a permanent tactical dashboard.

### Phase 4 — Hunt, cooldowns, death, healing

- [x] **M4-01** Rebuild Hunt on the shared automatic battle engine.
- [x] **M4-02** Add XP/Gold/loot/quest result projection to Hunt receipts.
- [ ] **M4-03** Add server-owned short Hunt cooldown and clear next-ready projection.
- [ ] **M4-04** Support capped equipment/buff modifiers that reduce activity cooldowns.
- [ ] **M4-05** Normalize `heal` command/action and recovery rules with simple terminology.
- [ ] **M4-06** Implement normal death: 20% carried-Gold loss, banked Gold safe.
- [ ] **M4-07** Add explicit warned dangerous-content item-loss fallback when configured and carried Gold is below minimum; never silently destroy protected/bound gear.

### Phase 5 — Areas, travel, Adventure, progression

- [ ] **M5-01** Introduce persistent Area model and player highest-unlocked/current Area.
- [ ] **M5-02** Add Area rich card / travel selection entirely through the Adventure Stream.
- [ ] **M5-03** Allow free revisit of all previously unlocked Areas.
- [ ] **M5-04** Implement ordinary Adventure activity using shared battle/world policies.
- [ ] **M5-05** Add Adventure cooldown/rewards/loot/story-event projection.
- [ ] **M5-06** Implement progression Adventure/boss requiring both human players by default.
- [ ] **M5-07** Unlock next Area transactionally on first valid progression clear.
- [ ] **M5-08** Add capped progression-boss death/enrage stacks and reset-on-victory.

### Phase 6 — Towns, NPCs, Quests

- [ ] **M6-01** Introduce Town model as an Area hub.
- [ ] **M6-02** Build Town/NPC rich chat card using generated sprites.
- [ ] **M6-03** Implement NPC dialogue/interaction receipts in the shared stream.
- [ ] **M6-04** Implement Quest domain/service/repository model.
- [ ] **M6-05** Implement readable objectives: kill, Hunt count, Adventure count, collect, boss, visit/speak.
- [ ] **M6-06** Implement Quest rich card with available/active/completed/claimable state.
- [ ] **M6-07** Allow Arc-generated story quests to compose only validated objective types.

### Phase 7 — shop/equipment generation and supporting professions

- [ ] **M7-01** Extend Arc Manifest equipment templates with slot, rarity, stats, effects, level/Area budget, visualAssetId.
- [ ] **M7-02** Extend server-owned Shop catalog to consume validated Arc/Town stock definitions.
- [ ] **M7-03** Add Sell flow and transaction tests.
- [ ] **M7-04** Add simple crafting recipe model when item ingredients justify it.
- [ ] **M7-05** Add cooking recipes with fight-count buffs rather than wall-clock expiration.
- [ ] **M7-06** Show active remaining-fight buffs in Profile / relevant receipts.

### Phase 8 — simulated adventurers, duels, rankings

- [ ] **M8-01** Define simulated Adventurer profile/activity model using the same meaningful progression/stat concepts.
- [ ] **M8-02** Implement bounded offline/progression simulation with retry-safe/idempotent scheduling semantics.
- [ ] **M8-03** Prevent bots from Honey use, invalid item creation, or direct human-economy mutations.
- [ ] **M8-04** Populate Town/Guild Hall adventurers, including intentionally strong rivals.
- [ ] **M8-05** Build Leaderboard rich card for level, Hunt count, Area reached, gear/power, achievements, duel record as appropriate.
- [ ] **M8-06** Implement Duel through the shared automatic battle engine.
- [ ] **M8-07** Build inspectable bot Profile cards with equipment/stats/history summaries.

### Phase 9 — side activities

- [ ] **M9-01** Implement Gold-only Blackjack with authoritative transactions/idempotency.
- [ ] **M9-02** Implement Gold-only Coinflip.
- [ ] **M9-03** Implement Gold-only Slots.
- [ ] **M9-04** Present activities as rich chat cards and public receipts; never use Honey.
- [ ] **M9-05** Add economy/balance caps needed to avoid trivial infinite progression.

### Phase 10 — Arc Manifest vNext + new world content

Do not begin this phase until the new foundation is usable end-to-end.

- [ ] **M10-01** Extend Arc Manifest schema/validator for Areas, Towns, NPCs, Quests, Shops, equipment slots/stats/effects, recipes, level bands, progression challenges, and new effect vocabulary.
- [ ] **M10-02** Extend Arc Workshop to preview/validate the vNext package clearly.
- [ ] **M10-03** Define generation guidance for the 70/20/10 colorful guild-anime tone without copying existing copyrighted characters/storylines.
- [ ] **M10-04** Retire Frayed Hollow as the default first impression or relegate it to legacy/test content.
- [ ] **M10-05** Author/generate the first new Arc under the new contract: 3-6 Areas, towns, NPCs, quests, enemies, bosses, items, shops, visuals, achievements, lore.
- [ ] **M10-06** Verify all old Arcs/Areas remain revisit-able after publishing a new Arc.

### Phase 11 — human playtest and balance gate

- [ ] **M11-01 HUMAN** Two humans can understand the first hour without reading developer docs.
- [ ] **M11-02 HUMAN** Hunt is satisfying to repeat without becoming mindless spam.
- [ ] **M11-03 HUMAN** Cooldowns pace play without feeling like arbitrary waiting.
- [ ] **M11-04 HUMAN** Inventory/Shop/Bank/Quest cards are easier to use than separate pages would be.
- [ ] **M11-05 HUMAN** Rare drops/level-ups/stronger gear create a real desire to continue.
- [ ] **M11-06 HUMAN** Both players enjoy progression bosses and cooperation feels necessary/useful.
- [ ] **M11-07 HUMAN** Returning to old Areas is useful for farming/quests rather than pointless.
- [ ] **M11-08 HUMAN** Simulated adventurers make the world feel alive without making progress feel fake.
- [ ] **M11-09 HUMAN** Death penalties create stakes without making either player want to stop playing.
- [ ] **M11-10 HUMAN** Main receipts remain readable after long sessions and details are available when desired.

### Phase 12 — production lifecycle gate

- [ ] **M12-01** Define explicit abandon/expiry semantics for unfinished party/progression activities.
- [ ] **M12-02** Define cleanup policy for indefinitely inactive simulated-adventurer jobs/state.
- [ ] **M12-03** Load/restart/multi-process durability verification for all newly added authoritative systems.

## 13. Agent execution protocol

This protocol exists so a scheduled coding agent can continue the project without improvising product direction.

Every agent run must:

1. Read `AGENTS.md`, `CONTEXT.md`, this document, and relevant architecture docs.
2. Inspect `main`, open PRs/branches, latest CI, and this checklist before coding.
3. Determine whether another agent already completed the next unchecked task.
4. Choose the **earliest unchecked task whose dependencies are satisfied**.
5. If a previous task is partially implemented, finish/repair that task instead of skipping forward.
6. Work on one coherent milestone/task at a time. A small prerequisite may be included when necessary.
7. Preserve server-authoritative/Fowler-style boundaries and existing migration compatibility.
8. Add/adjust unit/domain/repository tests for rule changes and Playwright coverage for changed player journeys.
9. For substantial UI changes, inspect a representative mobile screenshot/artifact.
10. Run the complete required gates (`npm run check`, `npm test`, relevant Playwright; full E2E before merge).
11. Update the checkbox/status in this document only when objective acceptance criteria are actually proven.
12. Update relevant docs when architecture/product behavior changed.
13. Merge only green work to `main`; do not leave the project dependent on an unmerged local branch.
14. After merge, verify `main` CI is green.
15. Leave a concise handoff note in the commit/PR/docs describing:
    - task completed;
    - tests run;
    - any migration/compatibility concerns;
    - the next earliest unchecked task.
16. If no checklist task can be safely executed because of a real blocker, document the blocker explicitly rather than inventing unrelated work.

### Agent definition of done

A task is not complete merely because code exists.

It is complete only when:

- authoritative behavior is implemented at the correct boundary;
- user-visible copy follows this plan;
- relevant persistence/migration behavior is safe;
- tests demonstrate objective acceptance;
- mobile/chat UX is reviewed where applicable;
- docs/checklist are current;
- merged `main` is green.

## 14. What agents must not do

- Do not add new currencies because a mechanic needs a resource sink; use Gold/items unless product direction explicitly changes.
- Do not reintroduce permanent tactical Attack/Guard/Interrupt/Focus dashboards into the default loop.
- Do not create separate screens merely because a rich chat card is harder to implement.
- Do not let browser code own prices, loot, combat formulas, cooldown legality, XP, progression, or death penalties.
- Do not allow generated content to execute arbitrary mechanics/code.
- Do not make simulated adventurers grind continuously or use Honey.