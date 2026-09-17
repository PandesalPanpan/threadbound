# Presentation v2 Codex

H01 adapts the mobile Codex directory and article frames from the Figma file
`Threadbound — Minimal Chat Gameplay UI`:

- `73:5` — `Codex v2 / Mobile / Directory`
- `73:66` — `Codex v2 / Mobile / Article`
- `73:108` — `Codex v2 / Desktop / Library + Article`

The page remains the existing server-rendered Codex route and continues to use
`/api/codex`. The presentation layer only reshapes the existing directory and
detail records; it does not create a second wiki data source or change Codex
service, repository, history, achievement, or content contracts.

## Directory

The 390px mobile layout now follows the Figma hierarchy:

1. Threadbound navigation with the active Codex destination.
2. `LIVING ARCHIVE` eyebrow, `Codex` title, and the concise world-state subtitle.
3. Search control with the existing Loom query behavior.
4. Rounded category chips, including the compact `More` affordance while the
   existing achievements/history test IDs remain available.
5. One-line authoritative category counts.
6. Dense entry cards with semantic category icon, metadata, summary, and a
   clear next-action chevron.

## Article

Selecting a record promotes the existing detail model into the article state:

- breadcrumb navigation;
- category icon, title, and metadata;
- `RECORD` infobox from source/revision/discovery fields;
- contents links;
- overview, mechanics, related pages, and history sections.

The transition is an explicit mobile view state instead of relying on document
scrolling. This keeps the article frame stable on the same clipped-overflow
shell used by the rest of Presentation v2 and maps cleanly to the separate
Figma directory/article frames.

## Desktop workspace

H02 keeps the same projection in a 1440×960 three-column workspace:

1. A 210px category rail with authoritative counts and the published-content
   explanation.
2. A 360px `RECENT + RELEVANT` directory with six visible cards and a bounded
   scroll region for additional records.
3. A flexible article panel with the breadcrumb, record header, overview,
   mechanics, related pages, and history sections.

The desktop category rail and mobile chips invoke the same `openCategory`
behavior, so search, selection, deep links, and detail rendering remain one
browser projection over the existing Codex service.

## Verification

The focused acceptance journey is
`test/e2e/presentation-v2-codex.local.spec.js`. It runs at 390×844, asserts the
directory and article hierarchy, and captures representative screenshots under
`test-results/presentation-v2/`.

The desktop acceptance journey is
`test/e2e/presentation-v2-codex-desktop.local.spec.js`. It runs at 1440×960,
checks the three column geometry and rail navigation, and captures the desktop
workspace screenshot in the same review directory.

State and navigation coverage lives in
`test/e2e/presentation-v2-codex-state.local.spec.js`: it cross-checks visible
counts against `/api/codex`, exercises category/search filtering, deliberate
article hashes, reload/deep-link restoration, breadcrumb return to the
directory, and empty-search recovery.
