# Gold-only Slots

M9-03 adds the authoritative backend foundation for Threadbound Slots. It is a bounded game-economy activity using **carried Gold only**. It never reads, spends, or mints Honey and cannot spend banked Gold.

## Rules

A spin uses three server-resolved reels drawn from the constrained symbol set:

- `coin`
- `sword`
- `shield`
- `crown`

Settlement is intentionally simple and inspectable:

- any pair returns the wager (`1x` payout);
- three Coins pay `2x`;
- three Swords pay `3x`;
- three Shields pay `4x`;
- three Crowns pay `6x` and are reported as the jackpot;
- all other combinations lose the wager.

The wager is debited before any payout is credited. Payout multipliers are total returned Gold, not profit added on top of an unspent wager.

## Boundaries

- `SlotsPolicy` owns wager validation, constrained reel symbols, RNG sampling, outcome classification, and payout semantics. RNG is injectable for deterministic tests.
- `SlotsService` coordinates one spin command and returns a player-safe projection. It does not mutate Gold directly.
- `SQLiteSlotsRepository` owns persisted resolved spins plus the **same SQLite transaction** that debits/credits carried Gold and records the idempotency result.
- Idempotency keys replay the original response without debiting or paying again, and the same key cannot be reused with a different wager.
- Banked Gold remains isolated because settlement reads/writes only the carried-Gold field used by the existing economy boundary.

M9-03 does not add browser UI or public receipts, so no player-facing Playwright journey changes are required in this increment. M9-04 presents Blackjack, Coinflip, and Slots through rich Adventure Stream cards/receipts. M9-05 adds any economy/balance caps needed once all three activities are exposed together.
