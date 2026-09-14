# Gambling Adventure Stream presentation (M9-04 / M9-05 / PV2-F01)

M9-04 exposed the Gold-only Blackjack, Coinflip, and Slots foundations from M9-01 through M9-03 without moving economy rules into browser code. M9-05 added one shared server-authoritative wager cap. PV2-F01 adds the Figma-aligned Blackjack table as the newest interactive surface inside the Adventure Stream while keeping Coinflip and Slots message-first.

## Boundaries

- `BlackjackService`, `CoinflipService`, and `SlotsService` remain the authoritative game/economy use-case boundaries.
- `GamblingBalancePolicy` owns the shared legal wager range: **1-100 carried Gold per play**.
- SQLite repositories continue to own wager debit, payout credit, resolved-game persistence, and idempotent replay protection in the same transaction.
- `src/gambling-routes.js` authenticates the player, invokes those services, and persists one concise Threadbound Adventure Stream receipt for each explicit command/result.
- `public/gambling-rich-card.js` is a Presentation Model. It records the player's visible command, invokes the server boundary, waits for the authoritative stream receipt, and renders only the server-returned Blackjack projection. It does not compute cards, scores, payouts, or wager legality.
- `public/ui-v2/gambling.css` translates Figma active Blackjack node `44:507` and resolved result node `44:619` into the existing vanilla HTML/CSS stream shell.
- Coinflip and Slots remain message-first receipts; Blackjack is the one secondary system with a rich interactive surface in this increment.

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

Blackjack receipts and its current rich surface carry the information that matters now: wager, player cards/score, visible dealer cards/score, outcome/Gold delta when resolved, carried Gold, and `hit` / `stand` guidance while active. The Figma action dock's `Double` slot is visibly disabled because the authoritative projection exposes only `hit` and `stand`; the browser does not invent a new rule. There is no launcher dashboard, unrelated game grid, or route-level/private gambling screen.

## Verification

Domain/service coverage proves all three games reject 101 Gold without changing balance and that help/state receipts do not mutate Gold. Browser coverage proves:

- `blackjack` appears as a visible player entry followed by a compact Threadbound help/state receipt;
- `blackjack <wager>` appears after that receipt and is followed by the authoritative hand/result receipt plus the Figma-aligned current Blackjack surface;
- `hit` / `stand` update the surface from their authoritative response and leave the command/result chronology in the shared stream;
- resolved hands expose the Figma result surface with stake return/profit, bankroll, and Play/Change bet/Leave conveniences;
- `gambling` returns a concise command guide rather than a launcher card;
- Coinflip and Slots also produce visible player action -> Threadbound result pairs;
- recent gambling entries remain bounded and mobile-readable.

Figma references: mobile active Blackjack `44:507`, mobile result `44:619`, and
collapsed-card history `44:747`. Screenshots are written by the threaded
Playwright journey to `ux-review/gambling-blackjack-active-mobile.png`,
`ux-review/gambling-blackjack-result-mobile.png`, and
`ux-review/gambling-mobile.png`.

The resolved surface is transient on a fresh reload because the current
`/api/gambling` read model returns only an active round. The authoritative
result remains durable in the Activity Stream; adding a terminal-round read
projection is intentionally outside this presentation increment.
