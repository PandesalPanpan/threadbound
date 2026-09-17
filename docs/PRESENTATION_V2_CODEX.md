# Presentation v2 Codex

H01 adapts the mobile Codex directory and article frames from the Figma file
`Threadbound — Minimal Chat Gameplay UI`:

- `73:5` — `Codex v2 / Mobile / Directory`
- `73:66` — `Codex v2 / Mobile / Article`

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

## Verification

The focused acceptance journey is
`test/e2e/presentation-v2-codex.local.spec.js`. It runs at 390×844, asserts the
directory and article hierarchy, and captures representative screenshots under
`test-results/presentation-v2/`.
