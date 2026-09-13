# Duel shared automatic battle (M8-06)

M8-06 turns the existing Guild Hall rivals into an authoritative stat-check activity without restoring the legacy tactical dashboard.

## Boundary

`src/domain/DuelBattle.js` is the Duel domain policy. It projects the two adventurers into the same canonical automatic-battle combatant shape used by Hunt and delegates lifecycle, Speed initiative, Crit, equipment effects, effect resistance, HP mutation inside the encounter, and turn history to `AutomaticBattleSimulator`.

`src/application/DuelService.js` is the Service Layer coordinator. It loads the human's authoritative five-slot equipment and derived stats, resolves the persistent simulated Guild Hall opponent, invokes the shared Duel battle policy, projects the existing `AutomaticBattleReadModel`, persists the immutable result, and publishes one `DuelResolved` event.

`src/infrastructure/SQLiteDuelRepository.js` owns durable Duel results and derives win/loss/draw records for either participant. A Duel id is immutable: an exact repeat is recognized as a replay, while a mismatched reuse fails closed. The HTTP route also uses the existing command-idempotency boundary when the browser supplies an `Idempotency-Key`, so a retried request does not run a second Duel.

The browser does not calculate combat, ranking, records, or rewards. `public/leaderboard-rich-card.js` only starts the server command, refreshes the authoritative Leaderboard projection, shows the returned concise result, and passes the already-projected turns to the existing Battle Details presentation.

## Product contract

- Duel is initiated from a simulated Adventurer row inside the existing `/leaderboard` Adventure Stream card.
- The entire fight auto-resolves server-side. There are no Attack/Guard/skill controls and no tactical dashboard.
- One explicit Duel produces one durable `DuelResolved` Adventure Stream receipt.
- Battle Details remain optional/on-demand and consume the shared automatic-battle read model.
- Duels start from full projected encounter HP and do **not** mutate the player's persistent Hunt/Adventure Health.
- Duels award/spend no Gold, Honey, XP, items, crafting ingredients, or other economy state.
- Authoritative Duel records appear on both human and simulated Leaderboard rows after a result.
- Simulated adventurers remain constrained by the M8-03 safety boundary; Duel cannot become a Honey or human-economy mutation path.

## Verification

`test/duel-service.test.js` proves shared-engine resolution, strong-rival defeat behavior, no persistent HP/economy mutation, immutable/retry-safe result persistence, authoritative Leaderboard records, and invalid opponent rejection.

`test/e2e/duel.spec.js` covers the 390x844 player journey from Leaderboard -> Duel -> stream receipt -> Battle Details, and writes `ux-review/duel-mobile.png`. The existing Leaderboard mobile coverage also checks that only simulated rows expose Duel actions, touch targets remain at least 44px, and the card stays inside the viewport.

Required merge gates remain `npm run check`, the complete unit/contract suite, and full Chromium Playwright.

## Next ordered task

After M8-06 is merged, objectively verified green on `main`, and reconciled in the canonical checklist, the next earliest unchecked milestone is **M8-07 — Add Profile cards for bots with visible equipment, Hunts, Level, Area, achievements, and Duel record**.
