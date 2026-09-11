# Historical rich-card snapshots

## Purpose

M2-06 keeps the Adventure Stream readable while preserving command-card history. The newest rich command card remains the only interactive card. When a different rich card supersedes it, the previous card becomes a compact immutable snapshot inside the stream instead of remaining as another large interactive panel.

## Presentation contract

`public/rich-chat-card.js` owns this behavior as part of the browser Presentation Model.

- The current `[data-testid="stream-command-card"]` remains the single interactive command-card host.
- The primitive remembers a compact presentation snapshot of the current rich card after decoration.
- When the card identity changes (`kind + title`), the previous presentation snapshot is appended to the Adventure Stream log.
- Historical snapshots contain no buttons, inputs, selects, textareas, or other command controls.
- Dismissing the current card does not create a historical snapshot by itself.
- Re-rendering the same card identity updates the remembered projection instead of creating duplicate history entries.
- Snapshot content is derived only from already-rendered authoritative projections. It is not a gameplay source of truth and cannot mutate server state.

Representative compact summaries include Inventory item/stat context and Bank/Profile balances when those values are already present in the rendered card. Other card families fall back to the card title/subtitle rather than duplicating their full UI.

## Architecture

This remains a presentation concern. Domain rules, Gold/Honey ownership, persistence, transactions, progression, equipment, and combat continue to live in their existing domain/service/repository boundaries. Historical snapshots are deliberately immutable DOM projections; they never become alternate persisted game state.

## Verification

`test/e2e/rich-chat-card.local.spec.js` verifies at a 390px viewport that:

- opening Shop after Status collapses Status into one historical snapshot;
- opening Inventory after Shop collapses Shop into a second snapshot;
- historical snapshots contain no interactive controls;
- the newest Inventory card remains the active rich card;
- dismissing the active card does not create another snapshot;
- the page remains within the mobile viewport width;
- the representative mobile screenshot is still captured at `ux-review/rich-chat-card-mobile.png`.

The first browser gate exposed an initialization bug where the compatibility adapter captured the Adventure Stream log before it had been rendered. The repair resolves the log lazily during card reconciliation, and the complete browser suite passed afterward.

## Handoff

**M2-06 is complete.** PR #54 merged to `main` at `9ef7b9ee8e141d67e9c723f820b1652809512308`. PR CI #1200 passed `npm run check`, `npm test`, and the complete Chromium E2E suite. The 390px mobile artifact was inspected and shows compact immutable Status/Shop history while Inventory remains the single active interactive card. Post-merge main CI #1201 also passed.

The next ordered milestone is **M2-07 — integrate generated sprites/icons throughout these cards and align mobile hierarchy with the approved Figma direction**. HUMAN playtest gates remain untouched.
