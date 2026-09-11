# Bank rich card

Status: **M2-05 implementation candidate; mark complete only after merge and green post-merge `main` CI.**

## Player contract

`bank` and `/bank` open an app-like Bank card inside the Adventure Stream. The card shows exactly two Gold balances:

- **Carried Gold** — the normal spendable Gold balance currently persisted migration-safely in `players.thread_dust`.
- **Banked Gold** — a separately persisted protected balance in `player_bank_balances`.

Players enter a positive whole Gold amount and choose **Deposit** or **Withdraw**. Successful explicit transfers are reflected in the shared Adventure Stream. No new headline currency is introduced; Honey remains Threaded-owned.

## Authority and architecture

- `SQLiteBankRepository` owns Bank persistence and the atomic carried-to-banked / banked-to-carried transactions.
- `BankService` coordinates browse, deposit, withdraw, and publishes `GoldDeposited` / `GoldWithdrawn` facts.
- Existing Gold storage remains compatible: this milestone does not rename or rewrite `players.thread_dust`.
- `public/bank-rich-card.js` is a Presentation Model. It never computes authoritative balances or mutates local balance state.
- The existing Shop HTTP endpoint is temporarily reused as a transport adapter for the Bank commands. `ShopService` immediately delegates those commands to `BankService`; Bank rules do not belong to the Shop catalog or browser. A later route cleanup can replace this transport without migrating Bank data.
- The existing Profile card consumes the authoritative Bank projection so its Banked Gold value is no longer a hard-coded migration baseline.

M2-05 intentionally does **not** implement death penalties. M4-06 will consume banked-vs-carried Gold when ordinary death rules are introduced.

## Verification

`test/bank-service.test.js` proves:

- fresh players begin with zero banked Gold without rewriting existing carried Gold;
- deposits and withdrawals persist and conserve total Gold;
- a new service instance observes the persisted Bank balance;
- insufficient carried/banked funds roll back both sides;
- invalid non-positive transfer amounts are rejected;
- Bank domain facts are published after successful transactions.

`test/e2e/bank-rich-card.spec.js` is part of the active Threaded Playwright gate. At 390px mobile width it covers:

- opening Bank through the Adventure Stream;
- authoritative carried/banked balance projection;
- Deposit and Withdraw journeys;
- persistence through fresh server reads;
- visible stream history for successful explicit actions;
- canonical Gold-only terminology;
- no horizontal overflow and 44px action sizing;
- `ux-review/bank-rich-card-mobile.png` for visual review.

## Handoff

After this milestone is merged and post-merge `main` CI is green, mark **M2-05** complete in `docs/THREADBOUND_MASTER_PLAN.md`. The next ordered task is **M2-06 — collapse superseded historical rich cards to compact immutable snapshots**. Do not move into automatic combat or new Arc content first.
