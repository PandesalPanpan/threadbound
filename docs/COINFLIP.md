# Gold-only Coinflip foundation (M9-02)

M9-02 introduces the authoritative Coinflip game/economy boundary without pulling Phase 9 presentation work forward. Rich cards and public Adventure Stream receipts remain M9-04.

## Rules in this increment

- Coinflip uses **carried Gold only**. Banked Gold and Honey are never wager funds and are never mutated.
- A wager is a positive whole number of Gold.
- The player selects `heads` or `tails`.
- The authoritative random sample resolves to heads for values in `[0, 0.5)` and tails for values in `[0.5, 1)`.
- A win credits twice the wager after the wager was debited (net +1× wager); a loss returns nothing.
- Odds/payout tuning and activity caps belong to M9-05.

## Boundaries

- `CoinflipPolicy` owns wager/choice validation, the fair 50/50 outcome mapping, and Gold settlement semantics. RNG is injectable for deterministic tests.
- `CoinflipService` coordinates one flip command and returns a player-safe projection. It does not mutate Gold directly.
- `SQLiteCoinflipRepository` owns persisted resolved flips plus the **same SQLite transaction** that debits/credits carried Gold and records the idempotency result.

Each Coinflip mutation requires an 8-128 character idempotency key. The repository stores the request fingerprint and completed response inside the same `BEGIN IMMEDIATE` transaction as the wager/outcome mutation. A replay returns the stored response without flipping or paying again; reusing the key for a different wager or side fails with `coinflip_replay_mismatch`.

## Migration/economy safety

Carried Gold is still persisted migration-safely in `players.thread_dust`. Coinflip treats that column only as canonical **Gold** at the application/domain boundary. It introduces no additional wallet or headline currency.

M9-02 does not add browser UI or public receipts, so no player-facing Playwright journey changes in this increment. M9-03 adds the Slots backend foundation; M9-04 then presents all three activities through rich chat cards/receipts.
