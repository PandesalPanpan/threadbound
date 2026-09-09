# Run command idempotency — PX-48

## Problem

A mutating combat command can be committed by Threadbound even when the client never receives the HTTP response. Retrying that POST blindly must not apply a second Strike, Guard, Mend, Revive, skill, event choice, upgrade, or completion transition.

## Fowler-style boundary

Threadbound keeps idempotency outside the combat Domain Model.

- `DungeonRun` / `AdventureRun` still own combat and run invariants.
- `GameService` remains the application Service Layer coordinating domain commands and persistence.
- `RunCommandIdempotencyService` is an application reliability service. It fingerprints an HTTP command and decides whether it is a new claim, a completed replay, a mismatched key reuse, or an unresolved prior attempt.
- `SQLiteRunCommandRepository` persists claims and completed responses. This is infrastructure; it does not interpret combat rules.
- Express middleware adapts HTTP requests/responses to the application reliability service. The browser never becomes authoritative.

This is deliberately not Event Sourcing and does not introduce another combat transaction model.

## Contract

The first-party browser attaches an `Idempotency-Key` to every `POST /api/runs/:runId/...` request. It retries one network-level fetch failure with the same key.

For a keyed request, the server records a durable `(player_id, idempotency_key)` claim before invoking the run command.

- **New key + fingerprint:** claim as `pending`, then execute normally.
- **Completed same key + same fingerprint:** do not execute the domain command; return the stored status/body with `Idempotency-Replayed: true`.
- **Same key + different endpoint/body:** reject with `409 run_command_replay_mismatch`.
- **Same key still pending:** reject with `409 run_command_in_progress`. This is intentionally conservative: if a process died after committing domain state but before persisting the response, Threadbound blocks blind re-execution rather than guessing.
- **No key:** legacy/direct callers still follow the existing command path. The first-party game client always supplies a key; this keeps existing internal tooling compatible while the external API contract is hardened incrementally.

The middleware stores successful and ordinary game-rule responses before Express sends the response bytes. Unexpected 5xx failures leave the claim pending so a retry cannot accidentally duplicate an ambiguous mutation.

## Persistence

`run_command_idempotency` is stored in the same SQLite database as players and runs. A completed replay therefore survives process/repository restart. The table records:

- player and key
- request fingerprint
- command/path identity and run id
- pending/completed state
- original HTTP status and response JSON
- created/completed timestamps

The primary key is `(player_id, idempotency_key)`, so different players may independently use the same opaque key without sharing results.

## Acceptance

PX-48 is green when all of the following are automated:

1. Browser run commands carry an idempotency key.
2. Repeating the exact keyed command returns the stored response.
3. The retry does not advance the authoritative run version.
4. Reusing the key for another command/payload is rejected.
5. A pending claim blocks a duplicate execution.
6. Completed records survive reopening the SQLite repository.
7. The complete existing Node and Chromium regression suites remain green.

PX-49 durable distributed sessions and PX-50 explicit run expiry/abandon semantics remain separate production gates.
