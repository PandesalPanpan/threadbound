# Gambling Adventure Stream presentation (M9-04 / M9-05)

M9-04 exposes the Gold-only Blackjack, Coinflip, and Slots foundations from M9-01 through M9-03 without moving economy rules into browser code. M9-05 adds one shared server-authoritative wager cap so side activities cannot turn a large carried-Gold balance into unbounded all-in compounding.

## Boundaries

- `BlackjackService`, `CoinflipService`, and `SlotsService` remain the authoritative game/economy use-case boundaries.
- `GamblingBalancePolicy` owns the shared legal wager range: **1-100 carried Gold per play**. Each game-specific policy delegates wager normalization to that shared rule while preserving its existing error code.
- Their SQLite repositories continue to own wager debit, payout credit, resolved-game persistence, and idempotent replay protection in the same transaction.
- `src/gambling-routes.js` is presentation orchestration: it authenticates the current player, invokes those existing services, projects one concise public Adventure Stream receipt for each non-replayed explicit play/action, and broadcasts the committed projection.
- `public/gambling-rich-card.js` is a Presentation Model only. It sends wagers/choices/actions, displays authoritative responses, and never computes outcomes, payouts, or wager legality.

## Balance contract

- Minimum wager: **1 Gold**.
- Maximum wager: **100 Gold** for Blackjack, Coinflip, and Slots.
- Only carried Gold can be wagered. Banked Gold remains protected and Honey is never accepted.
- The cap is enforced before any repository mutation, so rejected wagers cannot debit or credit Gold.
- Existing payout tables and odds are unchanged. The cap limits per-play economic exposure without adding a new currency, timer, or browser-owned balance rule.
- Idempotency and transaction guarantees remain unchanged: a retry cannot duplicate either the wager debit or payout.

## Player contract

Typing `gambling`, `casino`, `blackjack`, `coinflip`, or `slots` opens one rich **Guild Hall Games** card inside the Adventure Stream.

The card contains:

- carried Gold at the top;
- Blackjack Deal / Hit / Stand controls;
- Coinflip Heads / Tails controls;
- a three-reel Slots control;
- explicit copy that banked Gold and Honey are never wagered.

Every successful explicit play creates a concise public receipt. Service-level idempotency prevents a retried command from creating another payout or another receipt. An over-cap wager is rejected authoritatively with the same game-specific invalid-wager error family and does not create a successful-play receipt.

## Verification

M9-05 adds domain/service coverage proving all three games reject 101 Gold without changing the player's balance, while the 1-100 shared range remains valid. The mobile Playwright journey also exercises an over-cap request through the HTTP boundary and continues to cover the existing 390x844 Adventure Stream card.
