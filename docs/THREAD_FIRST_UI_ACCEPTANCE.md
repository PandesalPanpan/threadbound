# Thread-first UI acceptance

## Goal

Threadbound is played through one shared Adventure Stream. Durable receipts and player chat are shared; current controls and private command replies are viewer-specific Presentation Models rendered inside that same scrollable thread.

## Fowler-oriented boundaries

- **Domain Model:** `AdventureRun`, `DungeonRun`, combat policies, skills, powers, inventory rules, party rules. Presentation code never decides legality, damage, healing, crits, rewards, or progression.
- **Application Service / read model:** `/api/dashboard` and `CombatPreviewService` provide the authoritative viewer-specific state and previews used to decide which controls can be shown.
- **Presentation Model:** `adventure-stream.js`, `ux-coherence.js`, `buildcraft-presentation.js`, `combat-skills.js`, and `thread-first-ui.js` translate that read model into one thread-local control card. The card is not persisted and is not broadcast to other players.
- **Event projection:** `ActivityStreamService` remains the durable shared activity projection. Receipts are append-only; presentation-only condensation/history paging does not rewrite them.
- **Infrastructure:** WebSocket/SSE only announces committed state changes and stream entries. It never executes combat or inventory rules.

## Acceptance gates

- **TF-01:** On desktop and mobile, the Adventure Stream is the only user-facing gameplay surface; legacy state mirrors do not compete for layout space.
- **TF-02:** Attack, Guard, Interrupt, Mend, Revive, skills, run events, and run power choices are descendants of the scrollable Adventure Stream.
- **TF-03:** The current viewer's HP, Focus, enemy state, intent, build, and legal controls are presented in one private chat card at the bottom of the thread.
- **TF-04:** The private control card is viewer-specific. A non-leader never receives leader-only upgrade/event controls; downed players do not receive illegal combat controls.
- **TF-05:** Shared players still receive the same durable combat/event/item receipts in the activity stream.
- **TF-06:** `/gear` and other private command replies render inside the thread. Gear uses a responsive grid and keeps Equip/Salvage touch targets usable on a 390 px viewport.
- **TF-07:** Mobile keeps a single scrolling conversation plus the chat composer; no separate bottom navigation is required to play.
- **TF-08:** Hidden command-source buttons never duplicate visible `data-testid` values.
- **TF-09:** No client-side combat formula is introduced. Forecasts still come from `CombatPreviewService` simulating authoritative aggregate commands.
- **TF-10:** Existing reconnect, co-op, generated-content, buildcraft, relic, idempotency, and stream-history regression suites remain green.
