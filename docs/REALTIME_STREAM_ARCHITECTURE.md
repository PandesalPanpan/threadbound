# Realtime adventure stream architecture

Threadbound's shared adventure stream is intentionally modeled as application/domain behavior first and realtime transport second. The architecture follows the parts of Martin Fowler's *Patterns of Enterprise Application Architecture* that fit this problem without forcing patterns where they add no value.

## Pattern mapping

| Concern | Threadbound boundary | Fowler-style pattern / principle |
| --- | --- | --- |
| Combat and party rules | `DungeonRun`, `Party`, application services | Domain Model |
| Chat / activity persistence | `SQLiteActivityStreamRepository` | Repository |
| Translating domain outcomes to feed entries | `ActivityStreamService` | Application Service + domain-event projection |
| Realtime delivery | `RealtimeHub` | Gateway-like infrastructure boundary |
| Browser feed | `adventure-stream.js` | Presentation layer |
| Concurrent combat writes | versioned `DungeonRun` persistence | Optimistic Offline Lock |

## Rules

1. **WebSocket/SSE never decides game outcomes.** A socket cannot apply damage, healing, loot, readiness, or dungeon transitions directly. HTTP commands call application services; domain objects enforce rules; committed outcomes are then broadcast.
2. **The database is the durable truth for the stream.** Realtime delivery is an optimization for immediacy. Refresh/reconnect rebuilds the timeline from SQLite, so a dropped socket does not erase chat or system history.
3. **Domain events are transport independent.** `EnemyDamaged`, `PlayerHealed`, `DungeonStarted`, and similar events are projected into human-readable system entries by `ActivityStreamService`. The domain does not know how a feed entry looks or whether it is delivered by WebSocket, SSE, polling, or another transport.
4. **Chat is a command, not a socket-side mutation.** Player messages are validated and persisted through the application layer before they are broadcast. A failed persistence write must never appear as a successful durable message.
5. **Realtime transport is replaceable.** `RealtimeHub` owns connection lifecycle and fan-out. The rest of the application publishes payloads without depending on browser socket APIs.
6. **Optimistic concurrency remains authoritative for co-op combat.** Two clients acting at nearly the same time cannot silently overwrite one another; stale run versions are rejected and the client refreshes authoritative state.
7. **Rendering is safe by construction.** User chat is rendered with DOM `textContent`, never interpolated into HTML.
8. **Reconnect is expected behavior.** The client loads recent persisted entries first, then joins realtime delivery. Reconnects can therefore recover without manual page refresh.

## Stream semantics

The default stream is global/shared, matching the social feeling that inspired Threadbound. Players may be in separate dungeon instances while still seeing one another's meaningful actions and freely chatting. A shared party dungeon uses the same feed; the only difference is that both players' commands affect the same authoritative `DungeonRun` aggregate.

System/combat entries are deliberately more visually prominent than normal player chat. This distinction belongs to the presentation layer, while the stored entry retains a stable `kind` (`chat` or `system`) and optional domain `eventType`.

## Realtime protocol

WebSocket is the preferred low-latency transport for the shared feed, with authenticated short-lived connection tokens. SSE remains a valid fallback during rollout and for environments where WebSocket upgrades are unavailable. Both transports consume the same broadcast payloads and neither owns domain state.
