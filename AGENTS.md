# Threadbound agent rules

Read `CONTEXT.md`, `README.md`, and the relevant file under `docs/` before changing a gameplay or presentation boundary.

## Architecture

- Follow the Fowler-style boundaries already adopted by the project where they fit: Domain Model/Policy owns rules, the Service Layer coordinates use cases, repositories own persistence and transactions, and browser code is a Presentation Model. Do not add patterns or services merely for ceremony.
- Server and persisted domain state are authoritative. Realtime messages and the activity stream are projections, never sources of truth.
- One explicit game command should produce one concise public result receipt. Fine-grained domain events must not create a message explosion.

## Player-facing copy and receipts

- Follow `docs/PLAYER_EXPERIENCE_ACCEPTANCE.md`: optimize for recognition, scanability, clear next actions, and low mobile friction.
- Put the result first. Prefer short labels and numeric deltas (`−4 HP`, `+3 Dust`, `32/40 HP`) over sentences that restate the same facts.
- Preserve sufficient accessible text, but do not duplicate the same outcome in multiple visible paragraphs/cards.
- Slash commands are optional compatibility shortcuts. Primary mobile actions must be tappable and common commands may be entered as exact plain words.

## Visual assets

- Use semantic assets from `public/visual-asset-catalog.js` through `public/sprite-catalog.js`. New game UI must not introduce direct legacy `/sprites/kenney/*` paths when a generated semantic asset exists.
- Domain objects must not depend on image URLs, crop geometry, or browser presentation details. Use stable `visualAssetId` mappings at content/presentation boundaries.
- Keep deterministic assets in `public/assets/runtime/` committed. Run `npm run assets:generate` after changing source sheets or extraction definitions.

## Verification

- Add domain/repository tests for authoritative gameplay changes and Playwright coverage for changed player journeys.
- For substantial UI changes, inspect a representative mobile screenshot in addition to DOM assertions.
