# Threadbound agent rules

Read `CONTEXT.md`, `README.md`, and **`docs/THREADBOUND_MASTER_PLAN.md`** before changing a gameplay or presentation boundary. The master plan is the canonical product direction and ordered execution checklist. Relevant focused files under `docs/` refine implementation details but must not override the master plan's product direction without an explicit product decision.

## Execution order

- Inspect `docs/THREADBOUND_MASTER_PLAN.md` before choosing work.
- Continue the earliest unchecked task whose dependencies are satisfied.
- If that task is partially implemented, finish or repair it instead of skipping forward.
- Do not jump to new Arc/content generation while earlier foundation phases remain unfinished.
- Update a checkbox only when objective acceptance is actually implemented, tested, documented, merged, and green on `main`.
- Leave the repository ready for the next agent: merged green work plus a clear next unchecked task.

## Architecture

- Follow the Fowler-style boundaries already adopted by the project where they fit: Domain Model/Policy owns rules, the Service Layer coordinates use cases, repositories own persistence and transactions, and browser code is a Presentation Model. Do not add patterns or services merely for ceremony.
- Server and persisted domain state are authoritative. Realtime messages and the activity stream are projections, never sources of truth.
- One explicit game command should produce one concise public result receipt. Fine-grained domain events must not create a message explosion.
- Threadbound remains a modular monolith unless measured constraints justify a different deployment boundary.

## Product language and chat shell

- Follow `docs/THREADBOUND_MASTER_PLAN.md` for canonical player-facing language. Prefer obvious terms such as Gold, Inventory, Equipment, Upgrade, Heal, Bank, Area, Town, Quest, Adventure, Duel, Profile, and Leaderboard.
- Do not deepen legacy player-facing terms such as Thread Dust, Temper, Relic Pouch, Mend, or Weaver when implementing new default UX. Preserve old persistence/API names only where migration safety requires it.
- The Adventure Stream is the primary application shell. Rich Inventory/Shop/Bank/Profile/Area/Town/Quest/etc. interactions should be app-like cards inside chat rather than proliferating separate product screens.
- Buttons are command conveniences, not silent mutations: meaningful interactions still create coherent stream receipts.

## Player-facing copy and receipts

- Follow `docs/PLAYER_EXPERIENCE_ACCEPTANCE.md`: optimize for recognition, scanability, clear next actions, and low mobile friction.
- Put the result first. Prefer short labels and numeric deltas (`−4 HP`, `+20 Gold`, `+35 XP`, `32/40 HP`) over sentences that restate the same facts.
- Preserve sufficient accessible text, but do not duplicate the same outcome in multiple visible paragraphs/cards.
- Slash commands are optional compatibility shortcuts. Primary mobile actions must be tappable and common commands may be entered as exact plain words.
- Routine automatic battles belong in one concise main receipt. Detailed turn-by-turn simulation belongs behind an expandable/modal Battle Details view rather than flooding the stream.

## Visual assets

- Use semantic assets from `public/visual-asset-catalog.js` through `public/sprite-catalog.js`. New game UI must not introduce direct legacy `/sprites/kenney/*` paths when a generated semantic asset exists.
- Domain objects must not depend on image URLs, crop geometry, or browser presentation details. Use stable `visualAssetId` mappings at content/presentation boundaries.
- Keep deterministic assets in `public/assets/runtime/` committed. Run `npm run assets:generate` after changing source sheets or extraction definitions.

## Verification

- Add domain/repository tests for authoritative gameplay changes and Playwright coverage for changed player journeys.
- For substantial UI changes, inspect a representative mobile screenshot in addition to DOM assertions.
- Run `npm run check`, `npm test`, and relevant Playwright suites; run full E2E before merge for substantial gameplay/presentation changes.
- After merge, verify `main` CI remains green before considering the task done.
