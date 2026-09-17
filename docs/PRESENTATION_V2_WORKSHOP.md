# Presentation v2 Workshop migration map

This increment ports the Arc Workshop mobile states from Figma nodes `74:2`
(editor) and `74:46` (validation + publish) into the existing Express-rendered
presentation boundary. It does not change the manifest contract or publication
authority.

## Boundary map

| Presentation responsibility | Current implementation | Preserved authority |
| --- | --- | --- |
| Page shell and responsive state | `src/app.js` + `public/ui-v2/workshop.css` | Existing session/auth gate |
| File upload, JSON editing, view-model rendering | `public/arc-workshop.js` | Browser never decides validity or publication |
| World context and schema downloads | Existing `/api/arc-workshop/context` and `/schema` | `ArcManifestService.worldContext()` and source schema |
| Validation | Existing `/api/arc-workshop/validate` | `ArcManifestService` and v1/v2 validators |
| Draft list/load/save | Existing `/api/arc-workshop/manifests` routes | `SQLiteArcManifestRepository` transaction boundary |
| Revalidation/publication | Existing `/api/arc-workshop/manifests/:id/publish` | Server projection into live Arc/Codex state |
| Realtime projection | Existing `state_changed` broadcast on `ArcPublished` | `RealtimeHub`; Workshop remains a presentation consumer |

The Workshop remains local-development-only. The browser retains only
presentation state: editor text, parsed preview, validation result, and whether
the editor or review state is visible. It does not duplicate balance, schema,
referential, or publication rules.

## Figma-to-page mapping

- Editor state: world-authoring heading, local-only chip, provider-independence
  notice, context/schema actions, upload control, JSON editor, validation action,
  and compact impact stats.
- Review state: manifest title/version, authoritative validation result, package
  impact, draft/publication cards, and the explicit save/publish actions.
- Existing `data-testid` hooks remain stable for the legacy Workshop and vNext
  acceptance paths.

The broader Figma battle section is recorded under `42:2`; it remains a later
vertical slice because the ordered presentation plan completes the Workshop
surface before revisiting additional gameplay presentation boundaries.

## Desktop workspace

The desktop pass ports the bounded two-column states from Figma nodes `74:102`
(editor + impact) and `74:180` (draft review + publish). The editor keeps the
JSON authoring surface at 760px and the impact preview at 580px; review keeps
the package review at 850px and drafts/publications at 490px. The right review
rail scrolls independently as authoritative records accumulate.

Review actions are explicit: unsaved validated JSON exposes Save valid draft,
saved draft records expose Publish revision, and published records expose
neither mutation. The desktop E2E slice captures both states in
`ux-review/arc-workshop-v2-editor-desktop.png` and
`ux-review/arc-workshop-v2-review-desktop.png`.

## PV2-I03 verification

- Malformed JSON and authoritative v2 validation failures remain in the review
  state with an explicit error summary and a disabled draft action.
- Saving remains draft-only; publish calls the existing server publish route,
  which revalidates the persisted manifest before promotion.
- v1 compatibility, v2 world-package content, full Brightbell breadth, and the
  unmistakable DRAFT/PUBLISHED list states are covered by the Workshop E2E
  suite. The expandable v2 preview enumerates areas, towns, NPCs, quests,
  shops/stocks, recipes, progression, dungeons, enemies, bosses, item pools,
  equipment templates, lore, achievements, and historical consequences.
  The expanded mobile review state is captured in
  `ux-review/arc-workshop-vnext-expanded-mobile.png`.
