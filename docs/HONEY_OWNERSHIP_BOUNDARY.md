# Honey ownership boundary

Status: **M1-07 complete once this change is merged and `main` CI is green.**

Honey is Threadbound's premium currency, but Threadbound does **not** own a writable Honey wallet. Threaded remains authoritative for balance and spending.

## Authoritative boundary

- `ThreadedGateway` is the external wallet gateway.
- `HoneyPurchaseService` asks that gateway to spend Honey before granting any Threadbound item.
- Threadbound persists only the idempotent purchase grant / external transaction reference needed to avoid duplicate rewards.
- The session may cache the balance returned by Threaded for presentation after a successful purchase; that cache is not an independent wallet or mutation authority.

## Local-mode hard stop

Standalone local authentication cannot mutate Honey.

`src/app.js` rejects `/api/honey/purchases/training-cache` with `409 threaded_wallet_unavailable` when the session source is local or no Threaded purchase service exists. The rejection happens before `HoneyPurchaseService` can invoke any wallet mutation.

The local browser presentation also shows Honey as unavailable and does not render the Training Cache purchase action. Presentation is defense-in-depth only; the server rejection is authoritative.

## Objective evidence

- `test/e2e/local-auth.spec.js` signs in through standalone local auth, verifies the Honey-disabled presentation, confirms the purchase button is absent, then directly POSTs the Honey purchase endpoint and requires `409 threaded_wallet_unavailable`.
- `test/e2e/threadbound.spec.js` covers the real Threaded-mode purchase path and idempotent retry behavior.
- `test/honey-ownership.test.js` proves the application service delegates the Honey mutation to `ThreadedGateway` and persists only the resulting item/grant transaction record rather than maintaining a Threadbound Honey balance.
- README already states that Threaded owns the authoritative Honey wallet and local mode disables Honey purchases.

## Compatibility and architecture

This closes the Phase 1 premium-currency boundary without introducing a new headline currency or changing Gold. Existing purchase-grant persistence remains migration-safe and retry-safe. No tactical gameplay, Arc content, or local fake Honey wallet is introduced.

## Handoff

After merge and green post-merge CI, **M1-07 is objectively complete and Phase 1 is complete**. The next dependency-satisfied task is **M2-01 — define a reusable rich chat-card/panel presentation primitive for app-like cards inside the Adventure Stream**. Existing command cards should be inspected first so the new primitive consolidates them rather than creating a parallel UI system.
