# UX Coherence Acceptance

> Historical note: this document originally described the tactical combat surface with Focus, Guard, Interrupt, run upgrades, run discoveries, and persistent combat forecasts. Those mechanics remain relevant only to legacy/persisted tactical runs and migration regression coverage. They are **not** the current default player experience.

The current player-facing source of truth is:

- `docs/SIMPLE_GAMEPLAY_LOOP.md` for the default Hunt -> progression -> simple Dungeon loop.
- `docs/CHAT_META_LOOP_V2.md` for contextual Inventory, Recovery, Shop, and Dungeon navigation.
- `docs/PLAYER_EXPERIENCE_ACCEPTANCE.md` for cross-cutting reliability, mobile, accessibility, reconnect, co-op, and production gates.

## Current coherence contract

Threadbound is chat-first. The Adventure Stream is the primary play surface, and the browser presents server-owned state rather than reimplementing progression or economy rules.

### Architecture boundaries

- **Domain model / aggregate:** `AdventureRun`, `DungeonRun`, Hunt policies, and inventory/economy domain code remain authoritative for combat, run transitions, ownership, and progression.
- **Application services / read models:** dashboard, inventory, Hunt, Shop, and run services project server-owned state to the browser.
- **Presentation model:** the browser chooses how to render and navigate authoritative projections. It may submit commands, but it does not invent prices, loot, damage, affordability, legal actions, or inventory mutations.
- **Adventure Stream:** system receipts, player chat, private command cards, and contextual actions share the same primary surface. Durable server state remains the source of truth.

## Active acceptance gates

- [x] **UXC-01 CHAT-FIRST HIERARCHY:** The Adventure Stream dominates the primary play surface rather than a permanent tactical dashboard.
- [x] **UXC-02 CONTEXTUAL ACTION LIMIT:** Outside a simple dungeon, the composer exposes at most two useful contextual actions; the full command catalog stays behind typed commands/help.
- [x] **UXC-03 SIMPLE COMBAT:** New simple dungeons expose Attack as the only combat action and do not surface Focus, Guard, Interrupt, combat skills, temporary run powers, or random run-event buffs.
- [x] **UXC-04 INVENTORY COHERENCE:** Contextual Inventory navigation opens the same authoritative Relic pouch / gear projection used by typed `inventory` and `gear` commands.
- [x] **UXC-05 SHOP COHERENCE:** Mara's shop renders from the server-projected catalog and submits purchases to server-owned SKU rules; the browser does not own price or quantity logic.
- [x] **UXC-06 RECOVERY COHERENCE:** Zero Hunt HP produces an understandable recovery path rather than a dead end, with Recovery and Shop surfaced contextually.
- [x] **UXC-07 NO RULE DUPLICATION:** Browser code does not calculate authoritative combat, loot, equipment, affordability, or shop grant rules.
- [x] **UXC-08 MOBILE READABILITY:** The supported 390x844 mobile viewport remains free of horizontal overflow and contextual controls retain touch-friendly sizing.
- [x] **UXC-09 REGRESSION:** Unit/contract and Chromium browser suites are green on the current merged chat-first implementation.

## Legacy tactical regression boundary

Legacy tactical systems still exist because persisted old runs must hydrate safely during the strangler-style migration. Tactical tests should continue to protect migration compatibility, reconnect correctness, exactly-once rewards, and old aggregate behavior where necessary.

Do not use those legacy tests or this historical design as justification to add Focus, Guard, Interrupt, skill bars, run buffs, or tactical decision panels back into the default simple loop without an explicit product decision.

## Human review questions

Automation can prove structure and state truthfulness, but a human play pass should still answer these quickly on mobile:

1. What is the most useful thing I can do next?
2. Can I understand what just happened from the newest receipt without rereading the whole stream?
3. If I found gear, can I reach and manage it immediately?
4. If I am wounded or out of HP, is Recovery/Shop obvious?
5. If I am strong enough for a dungeon, is that progression path obvious without adding tactical clutter?
