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
- Blackjack
- Slots
- Coinflip

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

The Adventure Stream is the primary application surface. Every command, button press, interaction, NPC conversation, reward, purchase, duel, quest update, party event, gambling action, and game action should create a coherent stream entry.

**There are no player-facing “private screens” for Inventory, Shop, Bank, Profile, Quests, gambling, or similar routine systems.** Those systems render as rich inline chat entries/cards inside the same stream. They must not navigate away, replace the stream, open a separate app shell, or otherwise break conversational continuity.

Rich commands such as `inventory`, `shop`, `bank`, `profile`, `leaderboard`, `quest`, `town`, `blackjack`, `slots`, and `coinflip` should open **interactive chat cards** that can become visually rich on mobile while remaining visibly part of the conversation. They should be concise by default, expand only when needed, and must not consume most of the viewport merely because they contain many items.

Only the newest relevant card should remain fully interactive. Old large interactive cards should collapse into concise historical snapshots to prevent chat-history clutter.

Example historical collapse:

`🎒 Inventory viewed · 18 items · Attack 74 · Defense 52`

A command submitted by typing is itself a visible player chat entry before/alongside its resulting system receipt. If the player types `hunt`, the conversation must still visibly show that the player said `hunt`; the game result does not silently replace the user's message.

Tapping a button is equivalent to entering its command: it must still produce the same public player-action entry and game receipt.

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

Full automatic turn history should not flood the main stream. Provide a `Battle details` / `View turns` control that opens an inline expansion or lightweight detail surface without replacing the chat shell.

### 2.4 Server-authoritative rules

Browser/chat presentation never decides authoritative outcomes.

Use Fowler-style patterns where they solve a real boundary:

- **Domain Model / Policy** owns combat, stats, effects, progression, death penalties, loot, Area unlock rules, bot simulation constraints, and quest completion rules.
- **Service Layer** coordinates use cases such as Hunt, Adventure, Shop, Bank, Duel, Quest, Area travel, NPC interaction, gambling, and bot progression ticks.
- **Repositories** own persistence and transaction boundaries.
- **Read Models / Projection** provide chat-card data and leaderboards.
- **Gateway** remains the boundary to external Threaded/Honey ownership.
- **Presentation Model** renders rich chat cards and receipts without reimplementing game rules.

Do not introduce microservices, CQRS infrastructure, or event sourcing merely for ceremony. Threadbound remains a modular monolith until measured constraints justify otherwise.

### 2.5 Do not make the player think about interface bookkeeping

Player-facing controls must use plain-language labels and immediately understandable state. Apply the spirit of Steve Krug's “Don't Make Me Think”: a player should not need developer knowledge, mental arithmetic, or memory of hidden rules to understand a button.

- Never surface unexplained ratios/counters such as `Dungeon 14/9`.
- If a number matters, label what it represents (`Dungeon · Room 3/9`, `HP 14/30`, `Ready in 14s`).
- Quick-action buttons are contextual shortcuts, not a second navigation system.
- The default composer should normally keep **Hunt** available and show at most one additional most-relevant contextual shortcut.
- Do not pin `Dungeon` merely because a dungeon exists; surface it when it is genuinely the next useful action.
- Commands remain discoverable by typing/help even when they are not one of the two shortcuts.

### 2.6 Sprites support the world, not UI chrome

Remove the player's decorative display sprite/portrait from the persistent application shell. It costs space without improving command clarity.

Reserve character sprites primarily for NPCs, enemies, bosses, simulated adventurers, and meaningful world/content moments. Item/equipment sprites remain useful inside rewards and rich cards.

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

Gold must be visually prominent wherever spending/equipment decisions occur. In Inventory, Shop, Bank, gambling cards, and reward receipts, the player's relevant Gold balance should be immediately scannable rather than buried in secondary copy.

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

### 6.4 Dungeon / multi-encounter endurance

When a dungeon or Adventure contains multiple sequential enemies, **player HP persists between encounters by default**. Do not silently restore the player to full HP after each mob.

Healing, consumables, defense, and attrition must therefore matter during a multi-encounter run. Any healing between encounters must come from an explicit, understandable rule (item, reward, camp/rest choice, NPC effect, perk, etc.) and be shown in the stream.

The run should show enough persistent state to answer “how healthy are we, what room/encounter are we on, and what is the next decision?” without a separate tactical dashboard.

### 6.5 Quest

Support simple readable quest objectives plus occasional richer generated story quests.

Examples:

- Hunt 8 Forest Slimes
- Adventure 3 times in Area 2
- Defeat the Bandit Captain
- Bring 2 Wolf Pelts
- Speak to an NPC after completing an objective

Quest tracking and claim/progress should be available directly through a rich `quest` card.

### 6.6 Gambling

Desired side activities:

- Blackjack
- Slots
- Coinflip

They use Gold only—never Honey.

They must be bounded game-economy activities, not real-money gambling, and should reuse the same authoritative transaction/idempotency practices as other Gold mutations.

These activities must be discoverable from chat/help/town context and not exist only as hidden backend commands.

### 6.7 Crafting and cooking

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

Examples that must create player-action entries plus receipts/events:

- Hunt
- Adventure / Dungeon
- Heal
- Inventory
- Shop
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

Typed commands must remain visible as the player's own chat message. Do not consume a command invisibly and show only the Threadbound response.

### 8.2 Rich cards stay inline and concise

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

Inventory, Shop, and other utility cards must **not** become route-level pages or full-screen private surfaces. Keep the chat above and below them visible/continuous. Prefer compact summaries, progressive disclosure, tabs/filters inside the card when necessary, and bounded internal height rather than an enormous card that consumes the whole screen.

Inventory specifically should make these visible without searching:

- carried Gold;
- equipped items/slots;
- key stats;
- concise item list with rarity and useful actions.

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

### 8.4 Battle details

Opening battle details shows the automatic turn-by-turn log without adding dozens of messages to the main stream or navigating away from the Adventure Stream.

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

### 8.5 Composer and quick actions

The composer remains the center of control. The two shortcut buttons are suggestions, not the command list.

- Keep shortcuts to at most two.
- `Hunt` should normally be the stable default quick action when available.
- The second action should be the most contextually relevant next step (Inventory, Heal, Adventure/Dungeon, Town, Blackjack, etc.).
- Do not show opaque counters or raw internal state in button labels.
- When a state number is genuinely helpful, label it semantically (`Room 3/9`, `HP 14/30`, `Ready in 14s`).
- The help/command summary must reflect the actual implemented command set; it must not remain stuck on an obsolete “Simple loop” that omits completed systems such as Areas, Towns, Quests, Bank, Blackjack, Slots, Coinflip, Duels, Profile, Leaderboard, and Achievements.
- Help should still be concise: group commands by purpose instead of dumping every implementation detail.

### 8.6 Layout must fit the viewport

The Adventure Stream should not create a giant empty scroll region below the actual content. Fix flex/min-height/overflow behavior so the composer and chat occupy the available viewport naturally on desktop and mobile.

Acceptance is visual as well as technical: representative screenshots must not show a long mostly-empty page beneath the conversation, horizontal overflow, or rich cards that unnecessarily dominate the viewport.

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

But the current product is **not** the target game yet. The September 14, 2026 first-impression playtest also proved that checked implementation boxes do not guarantee the intended experience. Notable gaps/regressions include:

- private/route-like Inventory/Shop presentation still breaking the chat flow;
- Inventory occupying too much of the viewport and failing to emphasize Gold strongly enough;
- typed commands being consumed without remaining visible as player chat entries;
- stale `Simple loop` help text that omits already-implemented systems;
- contextual shortcut buttons selecting poor actions and exposing unclear state such as `Dungeon 14/9`;
- Blackjack and other side activities not discoverable enough despite backend implementation;
- dungeon encounters restoring health so aggressively that Heal/attrition have little value;
- persistent player display sprite consuming shell space without adding gameplay clarity;
- viewport/layout behavior creating a large mostly-empty scroll region;
- several rich systems technically implemented but not integrated into the natural chat-first first impression.

Earlier foundational gaps have been implemented through Phases 1-10 below, but the above regressions are reopened as a required correction phase before further human validation.

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
- [x] **M4-03** Add server-owned short Hunt cooldown and clear next-ready projection.
- [x] **M4-04** Support capped equipment/buff modifiers that reduce activity cooldowns.
- [x] **M4-05** Normalize `heal` command/action and recovery rules with simple terminology.
- [x] **M4-06** Implement normal death: 20% carried-Gold loss, banked Gold safe.
- [x] **M4-07** Add explicit warned dangerous-content item-loss fallback when configured and carried Gold is below minimum; never silently destroy protected/bound gear.

### Phase 5 — Areas, travel, Adventure, progression

- [x] **M5-01** Introduce persistent Area model and player highest-unlocked/current Area.
- [x] **M5-02** Add Area rich card / travel selection entirely through the Adventure Stream.
- [x] **M5-03** Allow free revisit of all previously unlocked Areas.
- [x] **M5-04** Implement ordinary Adventure activity using shared battle/world policies.
- [x] **M5-05** Add Adventure cooldown/rewards/loot/story-event projection.
- [x] **M5-06** Implement progression Adventure/boss requiring both human players by default.
- [x] **M5-07** Unlock next Area transactionally on first valid progression clear.
- [x] **M5-08** Add capped progression-boss death/enrage stacks and reset-on-victory.

### Phase 6 — Towns, NPCs, Quests

- [x] **M6-01** Introduce Town model as an Area hub.
- [x] **M6-02** Build Town/NPC rich chat card using generated sprites.
- [x] **M6-03** Implement NPC dialogue/interaction receipts in the shared stream.
- [x] **M6-04** Implement Quest domain/service/repository model.
- [x] **M6-05** Implement readable objectives: kill, Hunt count, Adventure count, collect, boss, visit/speak.
- [x] **M6-06** Implement Quest rich card with available/active/completed/claimable state.
- [x] **M6-07** Allow Arc-generated story quests to compose only validated objective types.

### Phase 7 — shop/equipment generation and supporting professions

- [x] **M7-01** Extend Arc Manifest equipment templates with slot, rarity, stats, effects, level/Area budget, visualAssetId.
- [x] **M7-02** Extend server-owned Shop catalog to consume validated Arc/Town stock definitions.
- [x] **M7-03** Add Sell flow and transaction tests.
- [x] **M7-04** Add simple crafting recipe model when item ingredients justify it.
- [x] **M7-05** Add cooking recipes with fight-count buffs rather than wall-clock expiration.
- [x] **M7-06** Show active remaining-fight buffs in Profile / relevant receipts.

### Phase 8 — simulated adventurers, duels, rankings

- [x] **M8-01** Define simulated Adventurer profile/activity model using the same meaningful progression/stat concepts.
- [x] **M8-02** Implement bounded offline/progression simulation with retry-safe/idempotent scheduling semantics.
- [x] **M8-03** Prevent bots from Honey use, invalid item creation, or direct human-economy mutations.
- [x] **M8-04** Populate Town/Guild Hall adventurers, including intentionally strong rivals.
- [x] **M8-05** Build Leaderboard rich card for level, Hunt count, Area reached, gear/power, achievements, duel record as appropriate.
- [x] **M8-06** Implement Duel through the shared automatic battle engine.
- [x] **M8-07** Build inspectable bot Profile cards with equipment/stats/history summaries.

### Phase 9 — side activities

- [x] **M9-01** Implement Gold-only Blackjack with authoritative transactions/idempotency.
- [x] **M9-02** Implement Gold-only Coinflip.
- [x] **M9-03** Implement Gold-only Slots.
- [x] **M9-04** Present activities as rich chat cards and public receipts; never use Honey.
- [x] **M9-05** Add economy/balance caps needed to avoid trivial infinite progression.

### Phase 10 — Arc Manifest vNext + new world content

Do not begin this phase until the new foundation is usable end-to-end.

- [x] **M10-01** Extend Arc Manifest schema/validator for Areas, Towns, NPCs, Quests, Shops, equipment slots/stats/effects, recipes, level bands, progression challenges, and new effect vocabulary.
- [x] **M10-02** Extend Arc Workshop to preview/validate the vNext package clearly.
- [x] **M10-03** Define generation guidance for the 70/20/10 colorful guild-anime tone without copying existing copyrighted characters/storylines.
- [x] **M10-04** Retire Frayed Hollow as the default first impression or relegate it to legacy/test content.
- [x] **M10-05** Author/generate the first new Arc under the new contract: 3-6 Areas, towns, NPCs, quests, enemies, bosses, items, shops, visuals, achievements, lore.
- [x] **M10-06** Verify all old Arcs/Areas remain revisit-able after publishing a new Arc.

### Phase 10F — first-impression chat UX correction (reopened 2026-09-14)

This phase is mandatory before HUMAN playtest acceptance. It exists because the first live impression exposed UX regressions despite earlier implementation checkboxes being green.

- [ ] **M10F-01** Remove route/private-screen behavior for Inventory, Shop, Bank, gambling, and other routine systems. Render them as inline Adventure Stream cards without replacing/hiding the chat shell.
- [ ] **M10F-02** Redesign Inventory for compact inline use: carried Gold must stand out, equipped slots and key stats must be immediately visible, long item collections must use progressive disclosure/bounded height rather than consuming the whole viewport.
- [ ] **M10F-03** Make typed commands and button-triggered commands appear as visible player chat/action entries, followed by Threadbound receipts, preserving conversation continuity and realtime partner visibility.
- [ ] **M10F-04** Replace the stale `Simple loop` command/help copy with a concise grouped command guide that reflects the actually implemented systems, including Area/Town/Quest/Bank/Duel/Profile/Leaderboard/Achievements and Blackjack/Slots/Coinflip.
- [ ] **M10F-05** Rework the two composer quick actions: normally keep `Hunt` available, choose only one contextually relevant second action, and remove opaque labels/raw counters such as `Dungeon 14/9`. Add semantic labels when state is useful.
- [ ] **M10F-06** Make Blackjack/Slots/Coinflip discoverable through the chat-first flow (help plus appropriate Town/context cards) and verify each creates a visible public player action and result receipt.
- [ ] **M10F-07** Fix dungeon/multi-encounter attrition: player HP persists between mobs by default; remove automatic full-heal between encounters unless an explicit surfaced mechanic grants it; verify Heal/consumables have meaningful use during a run.
- [ ] **M10F-08** Remove the persistent player display sprite/portrait from the shell; reserve character sprites for NPCs, enemies, bosses, simulated adventurers, and meaningful content cards.
- [ ] **M10F-09** Fix desktop/mobile viewport sizing and overflow so the page does not have a huge mostly-empty scroll tail below the chat. Add screenshot/regression coverage for representative viewport sizes.
- [ ] **M10F-10** Perform a cohesive first-impression pass after M10F-01..09: start from a fresh/representative player state and verify the first several minutes feel like one continuous EPIC-RPG-inspired chat game rather than a collection of separate panels. Capture representative mobile and desktop screenshots and keep objective automated gates green.

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
4. Choose the **earliest unchecked non-HUMAN task whose dependencies are satisfied**. HUMAN gates must never be auto-checked or skipped as if an agent performed the human playtest.
5. If a previous task is partially implemented, finish/repair that task instead of skipping forward.
6. Work on one coherent milestone/task at a time. A small prerequisite may be included when necessary.
7. Preserve server-authoritative/Fowler-style boundaries and existing migration compatibility.
8. Add/adjust unit/domain/repository tests for rule changes and Playwright coverage for changed player journeys.
9. For substantial UI changes, inspect representative mobile **and desktop** screenshots/artifacts and explicitly check chat continuity, card height, viewport overflow, composer visibility, and label clarity.
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
- Do not consume typed commands invisibly; keep player action/command entries visible in the shared stream.
- Do not put unexplained ratios/raw counters into player-facing button labels.
- Do not silently restore full HP between sequential dungeon encounters.
- Do not let browser code own prices, loot, combat formulas, cooldown legality, XP, progression, or death penalties.
- Do not allow generated content to execute arbitrary mechanics/code.
- Do not make simulated adventurers grind continuously or use Honey.
