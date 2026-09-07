# Realtime adventure stream architecture

Threadbound's shared adventure stream is intentionally modeled as application/domain behavior first and realtime transport second. The architecture follows the parts of Martin Fowler's *Patterns of Enterprise Application Architecture* that fit this problem without forcing patterns where they add no value.

## Pattern mapping

| Concern | Threadbound boundary | Fowler-style pattern / principle |
| --- | --- | --- |
| Combat and party rules | `DungeonRun`, `Party`, application services | Domain Model |
| Chat / activity persistence | `SQLiteActivityStreamRepository` | Repository |
| Gear salvage transaction | `InventoryService`, `SQLiteInventoryRepository` | Service Layer + Repository + transaction boundary |
| Command-to-result orchestration | `GameService` | Service Layer |
| Translating committed outcomes to feed entries | `ActivityStreamService` | Application Service + domain-event projection |
| Realtime delivery | `RealtimeHub` | Gateway-like infrastructure boundary |
| Browser feed and private command replies | `adventure-stream.js`, `adventure-meta-commands.js` | Presentation Model / presentation layer |
| Concurrent combat writes | versioned `DungeonRun` persistence | Optimistic Offline Lock |

## Rules

1. **WebSocket/SSE never decides game outcomes.** A socket cannot apply damage, healing, loot, readiness, inventory disposal, or dungeon transitions directly. HTTP commands call application services; domain objects enforce rules; committed outcomes are then broadcast.
2. **The database is the durable truth for the shared stream.** Realtime delivery is an optimization for immediacy. Refresh/reconnect rebuilds the public timeline from SQLite, so a dropped socket does not erase chat or system history.
3. **Domain events are transport independent.** Fine-grained events such as `EnemyDamaged`, `PlayerDamaged`, `EnemyDefeated`, and `PlayerHealed` remain available to achievements, history, concurrency and other application concerns. The domain does not know how a feed entry looks.
4. **One explicit player command becomes one public result message.** After the command commits, `GameService` publishes `CombatActionResolved` with the post-action snapshot required by the social presentation: action, HP, enemy state, retaliation, telegraph, target and phase. `ActivityStreamService` projects that into one readable Threadbound response and suppresses the lower-level combat events from the public feed. This avoids message explosions while preserving the richer domain event model underneath.
5. **`CombatActionResolved` is a projection event, not Event Sourcing.** `DungeonRun` plus the persisted run state remain authoritative. The activity stream is a read model / social transcript and is not replayed to reconstruct combat state.
6. **Chat and slash actions are commands, not socket-side mutations.** Player chat is validated and persisted before broadcast. Slash commands such as `/attack`, `/gear`, and `/party` either invoke an HTTP application command or request a read model. A failed application command must never be presented as a successful game action.
7. **Public timeline and private thread replies have different lifetimes.** Social chat and meaningful game results are durable shared entries. Status, gear, party controls, Codex, World and Honey are private replaceable presentation projections rendered near the composer and do not pollute shared history.
8. **Realtime transport is replaceable.** `RealtimeHub` owns connection lifecycle and fan-out. The rest of the application publishes payloads without depending on browser socket APIs.
9. **Optimistic concurrency remains authoritative for co-op combat.** Two clients acting at nearly the same time cannot silently overwrite one another; stale run versions are rejected and the client refreshes authoritative state.
10. **Rendering is safe by construction.** User chat is rendered with DOM `textContent`, never interpolated into HTML.
11. **Reconnect is expected behavior.** The client establishes realtime delivery first, buffers incoming stream entries, then loads the durable recent snapshot and deduplicates by entry ID. This removes the blind window between snapshot loading and subscribing.
12. **Global social visibility does not imply global UI invalidation.** Stream entries are intentionally broadcast to everyone, but `state_changed` invalidations are targeted only to players affected by the domain event. Unrelated combat must never replace another player's in-progress form input or force an unnecessary dashboard rerender.
13. **Audience is application context, not transport logic.** Domain/application events carry stable identifiers such as `playerId`, `participantIds`, `partyId`, and `runId`; the composition layer resolves the affected player audience and asks `RealtimeHub` to fan out only to those authenticated connections.
14. **Currency ownership follows the bounded context.** Threaded remains authoritative for Honey; Threadbound does not mint Honey when inventory is destroyed. Salvage grants Threadbound-owned `Thread Dust` atomically through `InventoryService`/`SQLiteInventoryRepository`.
15. **Destructive inventory commands protect current state.** Equipped gear cannot be salvaged, and the presentation requires an explicit second confirmation before an unequipped item is destroyed.

## Stream semantics

The default stream is global/shared, matching the social feeling that inspired Threadbound. Players may be in separate dungeon instances while still seeing one another's meaningful actions and freely chatting. A shared party dungeon uses the same feed; the only difference is that both players' commands affect the same authoritative `DungeonRun` aggregate.

The thread itself is the game surface. Normal combat does **not** run on a browser auto-attack timer. A player taps Attack, Guard, Interrupt, Mend, Revive, an upgrade, or another contextual action; the server commits that command; Threadbound then appends one result message containing the newly relevant state. The contextual action row under the timeline represents "your next action." Slash commands remain optional keyboard shortcuts rather than a mobile requirement.

The old expedition panel is deliberately a secondary state mirror, not a second combat controller. It can expose the authoritative run state, enemy sprite, HP and telegraph for debugging/accessibility, but gameplay actions live in the Adventure Stream so the product does not split into "game UI plus chat UI."

System/combat entries are deliberately more visually prominent than normal player chat. This distinction belongs to the presentation layer, while the stored entry retains a stable `kind` (`chat` or `system`) and optional domain `eventType`.

## Realtime protocol

WebSocket is the preferred low-latency transport for the shared feed, with authenticated short-lived connection tokens. SSE remains a valid fallback during rollout and for environments where WebSocket upgrades are unavailable. Both transports consume the same broadcast payloads, honor the same optional player audience, and neither owns domain state.
