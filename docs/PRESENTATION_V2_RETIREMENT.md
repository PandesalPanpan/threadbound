# Presentation v2 retirement inventory

This document is the branch-local evidence for PV2-J01 in
`docs/THREADBOUND_MASTER_PLAN.md`. It inventories the browser presentation graph
after PV2-I03. It does not remove files and does not authorize checking the
master-plan item until the work is merged and `main` is green.

## Audit boundary and method

The audit covered:

- HTML entrypoints assembled by `src/app.js`;
- the `express.static('public')` serving boundary;
- native module imports, including literal dynamic imports, in `public/`;
- stylesheet links and CSS `@import` edges;
- runtime/test references in `src/`, `public/`, `test/`, and the Playwright
  configuration files.

The application does not have a bundler that hides browser entrypoints. The
page templates and the literal module/style edges therefore provide the live
runtime graph. Historical Playwright projects remain useful migration evidence,
but they are not runtime dependencies and are called out separately below.

## Live HTML entrypoints

| Page | Entry scripts/styles | Status |
| --- | --- | --- |
| `/game` | `threadbound-theme.css`, `ui-v2/index.css`, `adventure-stream.css`, `run-command-idempotency.js`, `game.js`, `adventure-stream.js`, `adventure-meta-commands.js`, `simple-loop.js`, `ordinary-adventure.js` | Live player shell |
| `/codex` | `threadbound-theme.css`, `ui-v2/index.css`, `codex.js` | Live read-only Codex |
| `/arc-workshop` | `threadbound-theme.css`, `ui-v2/index.css`, `ui-v2/workshop.css`, `arc-workshop.js` | Live local-development authoring shell |

`src/app.js` is the only server-rendered browser entrypoint. The server exposes
all files under `public/`, but static availability is not evidence that a file
is loaded by a page.

## JavaScript dependency inventory

### Live player graph

The following graph is reachable from the `/game` HTML entrypoints:

- `game.js` → `sprite-catalog.js`, `relic-progression.js`, and
  `ui-v2/desktop-player.js`.
- `relic-progression.js` → `rich-chat-card.js` → the Shop, Inventory, Profile,
  Bank, Area, Town, Quest, Leaderboard, simulated-profile, bank/profile-sync,
  and rich-card visual-polish adapters.
- `rich-chat-card.js` also keeps the `battle-details.js` and
  `blackjack-card.js` paths reachable through the Leaderboard and gambling
  adapters. `battle-details.js` owns its own late stylesheet link to
  `battle-details.css`.
- `sprite-catalog.js` owns the literal asynchronous import of
  `generated-sprite-presentation.js`, which continues through
  `gold-copy-migration.js`, `equipment-copy-migration.js`, and
  `rarity-presentation.js`.
- `adventure-stream.js` → `ui-v2/stream.js`.
- `adventure-meta-commands.js` → `sprite-catalog.js` and `ui-v2/stream.js`.
- `simple-loop.js` and `ordinary-adventure.js` are direct page modules;
  `ordinary-adventure.js` imports the live gambling card adapter.

### Live non-player graphs

- `codex.js` is the `/codex` entrypoint and adds `minimal-ui.css` and
  `ui-v2/codex.css` at runtime.
- `arc-workshop.js` is the `/arc-workshop` entrypoint. Its page stylesheet is
  linked by the HTML template.
- `run-command-idempotency.js` remains a classic script on `/game`.
- `visual-asset-catalog.js` is shared by `sprite-catalog.js` and the server-side
  visual asset catalog contract; it is not an orphan asset file.

### Production-orphan presentation modules removed in J02

These files have no path from any current HTML entrypoint or live public-module
import. Their literal import edges form one disconnected legacy branch:

| File | Evidence | Current classification |
| --- | --- | --- |
| `public/combat-skills.js` | No `src/app.js` script tag and no public-module import. Its `combat-skill-panel` is absent by design in the current simple-loop regression (`test/e2e/mobile-chat-first-regression.spec.js`). | Removed in J02; historical skills suite remains archived. |
| `public/gameplay-feel.js` | No current page or public-module import; it was the root of the disconnected branch below. | Removed in J02; historical gameplay-feel suite/docs remain archived. |
| `public/semantic-combat-colors.js` | Imported only by `gameplay-feel.js`. | Removed in J02. |
| `public/combat-transition-presentation.js` | Imported only by `semantic-combat-colors.js`. | Removed in J02. |
| `public/ux-coherence-bootstrap.js` | Imported only by `semantic-combat-colors.js`. | Removed in J02. |
| `public/ux-coherence.js` | Literal dynamic import only from `ux-coherence-bootstrap.js`. | Removed in J02. |
| `public/buildcraft-presentation.js` | Literal dynamic import only from `ux-coherence-bootstrap.js`. | Removed in J02. |

The removed set was safe from a *current runtime* dependency perspective. The
historical projects
`playwright.skills.local.config.js` and the old
`combat-skills.spec.js`, `gameplay-feel.spec.js`, `ux-coherence.spec.js`, and
`buildcraft-depth.spec.js` still describe the retired tactical presentation.
Those projects are excluded from the canonical `test:e2e` graph, and the
skills project currently fails at its first missing `combat-skill-panel`, but
they remain archived migration references rather than runtime dependencies.

## Stylesheet inventory

All current stylesheet files have a live edge; none is a verified file-level
deletion candidate in J01.

| File | Live edge |
| --- | --- |
| `public/threadbound-theme.css` | Shared HTML link; also imported by `game.css`. |
| `public/ui-v2/index.css` | Shared HTML link; imports v2 tokens, base, shell, components, responsive, stream, core-card, world/social, dungeon, and gambling styles. |
| `public/adventure-stream.css` | Direct `/game` HTML link. |
| `public/game.css` | Added by `game.js`; imports the minimal compatibility layers. |
| `public/game-feel.css` | Added by `game.js`; remains linked until its selectors are deliberately migrated or removed. |
| `public/minimal-ui.css` | Imported by `game.css` and added by `codex.js`. |
| `public/minimal-stream-cleanup.css` | Imported by `game.css`; contains live stream/card compatibility overrides. |
| `public/minimal-interaction.css` | Imported by `game.css`; contains live touch-target overrides. |
| `public/battle-details.css` | Added by `battle-details.js` when the detail disclosure is mounted. |
| `public/ui-v2/*.css` | Reachable through `ui-v2/index.css`, the Codex entrypoint, the Workshop HTML entrypoint, or `game.js`. |

Some live compatibility styles still contain selectors for the disconnected
tactical modules. That is a selector-level cleanup question, not proof that the
stylesheet file itself is unused. Removing one of these files in J02 would
change the current page cascade without a selector-by-selector migration and
visual check.

## Verification record

The inventory was checked against:

- the `/game`, `/codex`, and `/arc-workshop` templates in `src/app.js`;
- the static import/dynamic-import graph in `public/`;
- CSS links/imports in `src/app.js`, `public/game.js`, `public/codex.js`,
  `public/battle-details.js`, and the CSS files themselves;
- canonical Playwright project matches in `playwright.config.js`,
  `playwright.simple.local.config.js`, and `playwright.workshop.config.js`;
- the current mobile regression that asserts advanced combat-skill controls are
  absent;
- `npm run test:e2e:legacy-skills`, which currently fails at the expected stale
  `combat-skill-panel` assertion rather than proving a current runtime load.

### J03 handoff

J02 removed only the seven disconnected browser modules. No stylesheet was
removed, and the backend/domain skill, preview, and run-build support remains
intact. J03 should run the full canonical unit/E2E gates, decide whether the
historical tactical Playwright projects are retained or formally retired, and
prepare the merge/main-CI handoff.
