# Durable HTTP Session Architecture

PX-49 removes Express's process-local `MemoryStore` from Threadbound's authenticated browser path.

## Reliability contract

A valid Threadbound session cookie must continue to resolve when the Node process is restarted, provided the replacement instance uses the same `SESSION_SECRET` and authoritative Threadbound SQLite database. Multiple Node instances that open the same database file see the same session records instead of requiring sticky routing to one process's memory.

Expired sessions are rejected and deleted. Signing still belongs to `express-session`; the cookie contains the opaque signed session id while server-side identity, OAuth state/token context and wallet snapshot remain in the durable store.

## Fowler-style boundaries

- **HTTP/session adapter:** `express-session` still owns cookie/session semantics.
- **Infrastructure:** `SQLiteSessionStore` implements the session Store contract and persistence only. It does not know gameplay, parties, dungeons or Honey rules.
- **Application/domain:** `GameService`, `PartyService`, `AdventureRun` and `DungeonRun` are unchanged. A process restart must not become a game-domain event.
- **Database:** the current modular-monolith deployment already uses one authoritative SQLite database. Session rows live beside the other server-owned persistence while remaining a separate table and abstraction.

The store enables SQLite WAL and a bounded busy timeout so independent Node processes using the same database file can coordinate ordinary session reads/writes. If Threadbound later moves its authoritative persistence from SQLite to a network database, this Store is an infrastructure adapter that can be replaced without rewriting the domain model.

## Security and lifecycle

`SESSION_SECRET` remains required and changing it intentionally invalidates existing signed cookies. The store respects the session cookie expiry and prunes expired rows during normal traffic. `/disconnect` destroys the durable row through the standard `express-session` Store API.

## Acceptance

`test/durable-session.test.js` covers both store expiry and an application-level restart journey: log in using local auth, retain the returned `threadbound.sid` cookie, shut down the app and database connection, recreate both against the same SQLite file, and verify `/connected` resolves the same player without logging in again.
