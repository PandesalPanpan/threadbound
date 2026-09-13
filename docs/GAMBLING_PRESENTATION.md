# Gambling Adventure Stream presentation (M9-04)

M9-04 exposes the Gold-only Blackjack, Coinflip, and Slots foundations from M9-01 through M9-03 without moving economy rules into browser code.

## Boundaries

- `BlackjackService`, `CoinflipService`, and `SlotsService` remain the authoritative game/economy use-case boundaries.
- Their SQLite repositories continue to own wager debit, payout credit, resolved-game persistence, and idempotent replay protection in the same transaction.
- `src/gambling-routes.js` is presentation orchestration: it authenticates the current player, invokes those existing services, projects one concise public Adventure Stream receipt for each non-replayed explicit play/action, and broadcasts the committed projection.
- `public/gambling-rich-card.js` is a Presentation Model only. It sends wagers/choices/actions, displays authoritative responses, and never computes outcomes or payouts.

## Player contract

Typing `gambling`, `casino`, `blackjack`, `coinflip`, or `slots` opens one rich **Guild Hall Games** card inside the Adventure Stream.

The card contains:

- carried Gold at the top;
- Blackjack Deal / Hit / Stand controls;
- Coinflip Heads / Tails controls;
- a three-reel Slots control;
- explicit copy that banked Gold and Honey are never wagered.

Every successful explicit play creates a concise public receipt. Service-level idempotency prevents a retried command from creating another payout or another receipt.

M9-04 does not add new economy caps or balancing rules. Those remain M9-05 so balance constraints can be chosen after the complete activity set is visible end-to-end.
