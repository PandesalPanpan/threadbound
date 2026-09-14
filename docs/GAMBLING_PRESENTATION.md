# Gambling Adventure Stream presentation (M9-04 / M9-05 / M10F-01)

M9-04 exposed the Gold-only Blackjack, Coinflip, and Slots foundations from M9-01 through M9-03 without moving economy rules into browser code. M9-05 added one shared server-authoritative wager cap. M10F-01 corrects the first-impression presentation so simple side games behave like EPIC-RPG-style chat commands rather than mini-app dashboards.

## Boundaries

- `BlackjackService`, `CoinflipService`, and `SlotsService` remain the authoritative game/economy use-case boundaries.
- `GamblingBalancePolicy` owns the shared legal wager range: **1-100 carried Gold per play**.
- SQLite repositories continue to own wager debit, payout credit, resolved-game persistence, and idempotent replay protection in the same transaction.
- `src/gambling-routes.js` authenticates the player, invokes those services, and persists one concise Threadbound Adventure Stream receipt for each explicit command/result.
- `public/gambling-rich-card.js` is now only a lightweight chat-command adapter despite its legacy filename. It records the player's visible command, invokes the server boundary, and waits for the authoritative stream receipt. It does not render a gambling card or compute outcomes, payouts, or wager legality.
- Information-dense systems such as Inventory/Shop/Quest may still use the shared inline `stream-command-card`; simple gambling does not.

## Balance contract

- Minimum wager: **1 Gold**.
- Maximum wager: **100 Gold** for Blackjack, Coinflip, and Slots.
- Only carried Gold can be wagered. Banked Gold remains protected and Honey is never accepted.
- The cap is enforced before any repository mutation, so rejected wagers cannot debit or credit Gold.
- Existing payout tables, odds, idempotency, and transaction guarantees are unchanged.

## Player contract

Gambling follows one visible player command -> one concise Threadbound receipt:

- `gambling` or `casino` -> a short command guide for Blackjack, Coinflip, and Slots;
- `blackjack` -> current Blackjack state/help without starting a wager;
- `blackjack <wager>` -> deal a hand;
- `hit` / `stand` -> act on the active Blackjack hand;
- `coinflip` -> Coinflip syntax/help;
- `coinflip <wager> heads|tails` -> resolve one flip;
- `slots` -> Slots syntax/help;
- `slots <wager>` -> resolve one spin.

Every command is first persisted as the player's ordinary chat entry. Threadbound then persists the authoritative system receipt, so both players see chronological command/result flow and reload/reconnect does not erase the interaction.

Blackjack receipts carry the information that matters now: wager, player cards/score, visible dealer cards/score, outcome/Gold delta when resolved, carried Gold, and `hit` / `stand` guidance while active. There is no persistent card table, launcher dashboard, unrelated game grid, or route-level/private gambling screen.

## Verification

Domain/service coverage proves all three games reject 101 Gold without changing balance and that help/state receipts do not mutate Gold. Browser coverage proves:

- `blackjack` appears as a visible player entry followed by a compact Threadbound help/state receipt;
- `blackjack 10` appears after that receipt and is followed by the authoritative hand/result receipt;
- `gambling` returns a concise command guide rather than a launcher card;
- Coinflip and Slots also produce visible player action -> Threadbound result pairs;
- no visible gambling rich card exists;
- recent gambling entries remain bounded and mobile-readable.
