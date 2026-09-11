# Shop rich card

Status: **M2-03 implementation complete on this branch; mark the master checklist only after merge and green `main` CI.**

## Product contract

Shop remains an app-like card inside the Adventure Stream. Opening or using it does not introduce a separate dashboard/page and does not revive the legacy tactical UI. Gold is the only normal shop currency; Honey remains outside this flow and Threaded-owned.

The card presents Mara, semantic generated item sprites, server-projected prices and affordability, Buy actions, and a Sell-equipment entry point. Sell intentionally hands the player to the canonical Inventory card so equipped/protected-item rules remain owned by the existing authoritative inventory flow. The broader standalone Sell transaction milestone remains M7-03.

## Authoritative boundaries

- `ShopCatalog` owns allowlisted stock, prices, copy, visual asset IDs, and private equipment templates.
- `ShopService` coordinates browsing and purchases; private item construction data is not projected to the browser.
- `SQLiteShopRepository` owns the atomic equipment purchase transaction: validate carried Gold, insert the owned item, and debit Gold in one transaction. Existing Gold remains migration-safe in the legacy `thread_dust` column.
- Existing potion purchasing remains atomic through `SQLiteGameRepository.buyHealthPotion`.
- `public/shop-rich-card.js` is presentation only. It reads the projected shop and decorates the Adventure Stream card; it never decides price, ownership, or affordability.

## Current stock

The foundation shelf deliberately stays small: a Common Bronze Sword plus the existing Health Potion and Potion Satchel. Broader generated/Arc/Town stock remains ordered work in Phase 7 rather than being pulled forward into this milestone.

## Verification

`test/shop-service.test.js` covers Gold affordability, equipment and potion stock projection, atomic equipment persistence/debit, rollback on insufficient Gold, and purchase events.

`test/e2e/shop-rich-card.spec.js` is part of the active Playwright suite and exercises the 390px chat-first card: sprites, prices, affordability, equipment purchase persistence, visible stream activity, Sell-to-Inventory handoff, horizontal fit, and 44px actions. It writes `ux-review/shop-rich-card-mobile.png` for visual review.

## Handoff

After M2-03 is merged, visually reviewed, and green on `main`, mark **M2-03** complete in `docs/THREADBOUND_MASTER_PLAN.md`. The next earliest dependency-satisfied milestone is **M2-04 — Profile rich card**.
