# Gold-only Blackjack foundation (M9-01)

M9-01 introduces the authoritative Blackjack game/economy boundary without pulling Phase 9 presentation work forward. Rich cards and public Adventure Stream receipts remain M9-04.

## Rules in this increment

- Blackjack uses **carried Gold only**. Banked Gold and Honey are never read as wager funds and are never mutated.
- A wager is a positive whole number of Gold.
- One player may have at most one active Blackjack round at a time.
- The player receives two cards and the dealer receives two cards.
- Dealer information hides the hole card while a round is active.
- Player actions are `hit` and `stand` only. Split, double-down, insurance, surrender, and other variants are intentionally deferred.
- The dealer hits below 17 and stands on 17 or higher.
- A win credits twice the wager after the wager was debited (net +1× wager); a push returns the wager; a loss returns nothing.
- A natural 21 is resolved immediately using the same even-money settlement in this foundation. Payout tuning/caps belong to M9-05.

## Boundaries

- `BlackjackPolicy` owns deck construction/shuffling, hand scoring, dealing, Hit/Stand resolution, dealer behavior, and Gold settlement semantics. RNG is injectable for deterministic tests.
- `BlackjackService` coordinates start/Hit/Stand use cases and projects only player-safe round state. It does not mutate Gold directly.
- `SQLiteBlackjackRepository` owns round persistence plus the **same SQLite transaction** that debits/credits carried Gold and records the idempotency result.

Idempotency is not a best-effort HTTP cache. Each Blackjack mutation requires an 8-128 character idempotency key. The repository stores the request fingerprint and completed response inside the same `BEGIN IMMEDIATE` transaction as the wager/card/outcome mutation. A replay returns the stored response without drawing another card or paying again; reusing the key for a different command fails with `blackjack_replay_mismatch`.

## Migration/economy safety

Carried Gold is still persisted migration-safely in `players.thread_dust`. Blackjack treats that column only as canonical **Gold** at the application/domain boundary. It never introduces another wallet or headline currency.

M9-01 does not add browser UI or public receipts. M9-02 and M9-03 add Coinflip and Slots backend foundations; M9-04 then presents the side activities through rich chat cards/receipts; M9-05 adds economy/balance caps after the complete activity set exists.
