# Rich-card visual hierarchy

## Scope

M2-07 completes the Phase 2 presentation foundation by integrating Threadbound's project-owned generated sprites and semantic icons throughout the existing Inventory, Shop, Profile, and Bank cards. The Adventure Stream remains the application shell; this work does not create a parallel dashboard or another gameplay state boundary.

## Presentation contract

- Rich-card art comes from `public/visual-asset-catalog.js` through `public/sprite-catalog.js`.
- Inventory continues to render generated equipment sprites and now uses semantic icons for derived stats, equipment slots, and Health Potions.
- Shop continues to render generated item/potion sprites and gains a semantic Shop header identity.
- Profile keeps the generated adventurer/equipment art and adds semantic resource/stat/header icons.
- Bank adds semantic carried-Gold/banked-Gold/header icons while all balance mutations remain server-authoritative.
- Empty equipment slots use semantic slot icons rather than introducing direct legacy sprite URLs.
- Semantic icons supplement visible labels; meaning is not communicated by art or color alone.
- Mobile layout keeps the rich card within the Adventure Stream and preserves the existing 44px action-target contract.

## Architecture

`public/rich-card-visual-polish.js` is a Presentation Model adapter. It decorates the current rich-card DOM idempotently and contains no pricing, item, progression, bank, or combat rules. Visual asset IDs remain presentation data and are not moved into domain objects merely for UI decoration.

## Verification

The active Playwright suite includes `test/e2e/rich-card-visual-hierarchy.spec.js` at a 390x844 mobile viewport. It verifies semantic project-owned assets across Profile, Inventory, Shop, and Bank, generated Shop item art, viewport containment, minimum visible icon sizing, and writes `ux-review/m2-07-rich-card-visual-hierarchy-mobile.png` for visual inspection.

M2-07 may be checked complete only after `npm run check`, `npm test`, the full active E2E gate, representative mobile artifact review, merge, and green post-merge `main` CI.

## Handoff

After M2-07 is objectively complete, the next earliest unchecked milestone is **M3-01 — create one authoritative automatic combat simulator usable by Hunt, Adventure, Duel, and suitable boss phases**. That simulator belongs in the domain/service boundary, not the browser presentation layer.
