# Active Fight Buff Projection

M7-06 makes the existing server-owned fight-count buff lifecycle visible without creating another product screen or moving buff rules into the browser.

## Ownership

- `FightBuffPolicy` owns the allowlisted buff vocabulary and mechanical definitions.
- `SQLiteFightBuffRepository` owns durable activation and remaining-fight counts.
- Hunt/Adventure services consume one remaining fight only after an authoritative fight resolves.
- `GameService.dashboard()` now exposes a read-only `activeFightBuffs` projection from persisted repository state. It does not calculate duration in the browser.
- `HuntReceiptReadModel` only formats the already-committed `HuntResolved.fightBuffsConsumed` facts, including remaining counts and expiry.

## Chat-first presentation

`/profile` remains an app-like card inside the Adventure Stream. Its **Active buffs** section shows the canonical buff name, description, and `N fights left`; when none are active it says so explicitly. This milestone does not add a standalone Buff screen or restore the legacy tactical dashboard.

The Hunt receipt can append concise state changes such as `Attack Up — 2 fights left.` or `Hunt Haste expired.`. Those values come from the authoritative event and are not inferred client-side.

## Verification

`test/active-fight-buff-projection.test.js` verifies persisted dashboard projection, remaining-fight decrement, and receipt formatting from committed event facts. `test/e2e/profile-rich-card.spec.js` verifies the existing 390px mobile Profile card can present active buff copy/counts without overflowing the viewport, while retaining the established chat-first Profile hierarchy.
