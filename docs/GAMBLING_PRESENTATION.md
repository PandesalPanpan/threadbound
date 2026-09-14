# Gambling Adventure Stream presentation (M9-04 / M9-05 / M10F-01)

M9-04 exposes the Gold-only Blackjack, Coinflip, and Slots foundations from M9-01 through M9-03 without moving economy rules into browser code. M9-05 adds one shared server-authoritative wager cap so side activities cannot turn a large carried-Gold balance into unbounded all-in compounding. M10F-01 corrects the first-impression presentation so these games behave like compact chat commands rather than a separate mini-dashboard.

## Boundaries

- `BlackjackService`, `CoinflipService`, and `SlotsService` remain the authoritative game/economy use-case boundaries.
- `GamblingBalancePolicy` owns the shared legal wager range: **1-100 carried Gold per play**. Each game-specific policy delegates wager normalization to that shared rule while preserving its existing error code.
- Their SQLite repositories continue to own wager debit, payout credit, resolved-game persistence, and idempotent replay protection in the same transaction.
- `src/gambling-routes.js` is presentation orchestration: it authenticates the current player, invokes those existing services, projects one concise public Adventure Stream receipt for each non-replayed explicit play/action, and broadcasts the committed projection.
- `public/gambling-rich-card.js` is a Presentation Model only. It sends wagers/choices/actions, displays authoritative responses, and never computes outcomes, payouts, or wager legality.
- The shared `stream-command-card` remains inside the **Adventure Stream shell**, immediately after durable chat history and before the composer. It is not a route/private screen and does not replace or hide the conversation. Durable player commands and authoritative receipts remain in the history itself.

## Balance contract

- Minimum wager: **1 Gold**.
- Maximum wager: **100 Gold** for Blackjack, Coinflip, and Slots.
- Only carried Gold can be wagered. Banked Gold remains protected and Honey is never accepted.
- The cap is enforced before any repository mutation, so rejected wagers cannot debit or credit Gold.
- Existing payout tables and odds are unchanged. The cap limits per-play economic exposure without adding a new currency, timer, or browser-owned balance rule.
- Idempotency and transaction guarantees remain unchanged: a retry cannot duplicate either the wager debit or payout.

## Player contract

The gambling UX follows the same minimal command rhythm as the rest of the Adventure Stream:

- typing `blackjack` opens **only Blackjack**, with carried Gold, the current hand, and the one or two actions that matter now;
- typing `coinflip` opens only Coinflip;
- typing `slots` opens only Slots;
- typing `gambling` or `casino` opens a compact three-choice launcher rather than rendering all three games at once;
- command text is first recorded as a normal player stream message, then Threadbound responds inline in the Adventure Stream shell;
- button actions such as `Blackjack 10`, `Hit`, `Stand`, Coinflip choices, and Slots spins also create visible player actions before the authoritative Threadbound result receipt;
- no gambling command may introduce a route-level/private-screen transition or hide/replace the conversation shell.

Blackjack intentionally avoids a card-table/dashboard treatment. While a round is active, it shows only the player's hand/score, the visible dealer information, Gold, and `Hit` / `Stand`. When no round is active, it shows a wager field and `Deal`. This keeps the side activity closer to EPIC-RPG-style command simplicity while retaining Threadbound's standalone interactive affordances.

Every successful explicit play still creates the concise public server receipt from the gambling route. Service-level idempotency prevents a retried command from creating another payout or another receipt. An over-cap wager is rejected authoritatively with the same game-specific invalid-wager error family and does not create a successful-play receipt.

## Verification

Domain/service coverage continues to prove all three games reject 101 Gold without changing the player's balance while the 1-100 shared range remains valid. The mobile Playwright journey now also proves that:

- the response remains in the Adventure Stream shell between visible history and the composer rather than navigating to or replacing another screen;
- typing `blackjack` leaves a visible player `blackjack` message in the conversation;
- the Blackjack view does not simultaneously render Coinflip or Slots;
- the generic `gambling` command renders only the compact launcher;
- controls retain mobile-sized touch targets and the active gambling response remains bounded rather than consuming most of the viewport.
