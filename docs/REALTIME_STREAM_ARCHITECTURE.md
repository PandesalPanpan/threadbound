# Realtime adventure stream architecture

Threadbound's shared adventure stream is intentionally modeled as application/domain behavior first and realtime transport second. The architecture follows the parts of Martin Fowler's *Patterns of Enterprise Application Architecture* that fit this problem without forcing patterns where they add no value.

## Pattern mapping

| Concern | Threadbound boundary | Fowler-style pattern / principle |
| --- | --- | --- |
| Combat and party rules | `DungeonRun`, `Party`, application services | Domain Model |
| Chat / activity persistence | `SQLiteActivityStreamRepository` | Repository |
| Gear salvage transaction | `InventoryService`, `SQLiteInventoryRepository` | Service Layer + Repository + transaction boundary |
| Translating domain outcomes to feed entries | `ActivityStreamService` | Application Service + domain-event projection |
| Realtime delivery | `RealtimeHub` | Gateway-like infrastructure boundary |
| Browser feed and private command replies | `adventure-stream.js` | Presentation Model / presentation layer |
| Concurrent combat writes | versioned `DungeonRun` persistence | Optimistic Offline Lock |

## Rules

1. **WebSocket/SSE never decides game outcomes.** A socket cannot apply damage, healing, loot, readiness, inventory disposal, or dungeon transitions directly. HTTP commands call application services; domain objects enforce rules; committed outcomes are then broadcast.
2. **The database is the durable truth for the shared stream.** Realtime delivery is an optimization for immediacy. Refresh/reconnect rebuilds the public timeline from SQLite, so a dropped socket does not erase chat or system history.
3. **Domain events are transport independent.** `EnemyDamaged`, `PlayerHealed`, `DungeonStarted`, `ItemSalvaged`, and similar events are projected into human-readable system entries by `ActivityStreamService`. The domain does not know how a feed entry looks or whether it is delivered by WebSocket, SSE, polling, or another transport.
4. **Chat and slash actions are commands, not socket-side mutations.** Player chat is validated and persisted before broadcast. Slash commands such as `/attack`, `/gear`, and `/party` either invoke an HTTP application command or request a read model. A failed application command must never be presented as a successful game action.
5. **Public timeline and private thread replies have different lifetimes.** Social chat and meaningful game events are durable shared entries. Status, gear, party controls, and Codex search results are private replaceable presentation projections rendered near the composer and do not pollute shared history.
6. **Realtime transport is replaceable.** `RealtimeHub` owns connection lifecycle and fan-out. The rest of the application publishes payloads without depending on browser socket APIs.
7. **Optimistic concurrency remains authoritative for co-op combat.** Two clients acting at nearly the same time cannot silently overwrite one another; stale run versions are rejected and the client refreshes authoritative state.
8. **Rendering is safe by construction.** User chat is rendered with DOM `textContent`, never interpolated into HTML.
9. **Reconnect is expected behavior.** The client establishes realtime delivery first, buffers incoming stream entries, then loads the durable recent snapshot and deduplicates by entry ID. This removes the blind window between snapshot loading and subscribing.
10. **Global social visibility does not imply global UI invalidation.** Stream entries are intentionally broadcast to everyone, but `state_changed` invalidations are targeted only to players affected by the domain event (for example, the run participants or party members). Unrelated combat must never replace another player's in-progress form input or force an unnecessary dashboard rerender.
11. **Audience is application context, not transport logic.** Domain/application events carry stable identifiers such as `playerId`, `participantIds`, `partyId`, and `runId`; the composition layer resolves the affected player audience and asks `RealtimeHub` to fan out only to those authenticated connections.
12. **Currency ownership follows the bounded context.** Threaded remains authoritative for Honey; Threadbound does not mint Honey when inventory is destroyed. Salvage grants Threadbound-owned `Thread Dust` atomically through `InventoryService`/`SQLiteInventoryRepository`, leaving future crafting/Forge mechanics inside the game boundary.
13. **Destructive inventory commands protect current state.** Equipped gear cannot be salvaged, and the presentation requires an explicit second confirmation before an unequipped item is destroyed.

## Stream semantics

The default stream is global/shared, matching the social feeling that inspired Threadbound. Players may be in separate dungeon instances while still seeing one another's meaningful actions and freely chatting. A shared party dungeon uses the same feed; the only difference is that both players' commands affect the same authoritative `DungeonRun` aggregate.

The adventure thread is also the primary interaction surface. Contextual suggestions expose the most likely next actions, while slash commands preserve discoverability and keyboard use. During combat, one live encounter dock shows player HP, enemy HP, enemy sprite, telegraphed intent, and reactive actions. Non-combat commands such as Status, Gear, Party, and Codex open one replaceable private reply rather than stacking permanent cards into the timeline.

System/combat entries are deliberately more visually prominent than normal player chat. This distinction belongs to the presentation layer, while the stored entry retains a stable `kind` (`chat` or `system`) and optional domain `eventType`.

## Realtime protocol

WebSocket is the preferred low-latency transport for the shared feed, with authenticated short-lived connection tokens. SSE remains a valid fallback during rollout and for environments where WebSocket upgrades are unavailable. Both transports consume the same broadcast payloads, honor the same optional player audience, and neither owns domain state.
