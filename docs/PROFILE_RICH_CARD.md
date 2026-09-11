# Profile rich card

Status: **M2-04 complete — merged in PR #52 at `e3a4e9bb`; post-merge main CI #1170 is green.**

The Profile command is an app-like card inside the Adventure Stream. It is a Presentation Model over the authoritative `/api/dashboard` read model and does not create a second source of character truth.

## Surface

Typing `profile` or `/profile` opens one rich card containing:

- adventurer identity and generated character sprite;
- Level and XP progress;
- carried Gold;
- Banked Gold position;
- current Area position;
- Attack, Defense, Max HP, Speed, and Crit Chance;
- Weapon, Helmet, Armor, Boots, and Accessory loadout;
- achievement count and a short unlocked-achievement summary.

The Bank and Area systems are intentionally later checklist milestones. Until their authoritative models exist, Profile renders the truthful migration baseline of `0` banked Gold and `Not established` Area rather than inventing browser-owned economy/world state. M2-05 and M5-01 will replace those placeholders from server-owned projections.

## Product boundaries

- The Adventure Stream remains the application shell; Profile does not create a separate page.
- No new headline currency is introduced: only Gold and externally owned Honey remain canonical.
- Equipment and stats come from the existing server-authoritative dashboard/loadout/stat policy.
- The legacy tactical dashboard is not reintroduced.
- Profile is intentionally read-only; actions belong to the corresponding Inventory, Bank, Area, and other command cards.

## Verification

`test/e2e/profile-rich-card.spec.js` runs at 390px mobile width and verifies the authoritative Profile projection, five equipment slots, generated adventurer sprite, mobile width, 44px dismissal target, canonical player-facing terminology, and that the Profile hero remains below the sticky navigation. It saves `ux-review/profile-rich-card-mobile.png` for visual review.

The milestone passed `npm run check`, `npm test`, and the complete active Chromium Playwright suite before merge. The representative 390px artifact was inspected, and post-merge main CI #1170 passed both unit/contract and browser-E2E jobs.

## Handoff

The next earliest checklist task is **M2-05 — Bank rich card**. That milestone must establish authoritative persisted carried-vs-banked Gold plus deposit/withdraw transactions and receipts rather than extending the Profile placeholder in browser code.
