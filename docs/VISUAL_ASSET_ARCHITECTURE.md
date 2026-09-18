# Visual Asset Architecture and Execution Plan

## Outcome

The five project-owned AI-generated sheets in `public/assets/generated/` remain source masters. The deterministic generator now also imports exactly 100 committed SVG source masters from the Figma `THREADBOUND · CHARACTER LIBRARY` boards XIII–XXIX (reserved slots excluded), then writes 524 lossless WebP catalog entries covering the existing sheets, six battle concepts, and the new 100-art/152-entry character library. Threadbound entities and Arc Manifests reference stable `visualAssetId` values rather than file paths or sheet coordinates.

## Decisions

1. Keep source sheets, the 100 Figma SVG masters, and generated runtime assets committed.
2. Use canon-neutral semantic IDs, labels, descriptions, and tags.
3. Keep `visualAssetId` optional for backward compatibility, but validate it strictly when present; v2 NPC artwork, when supplied, must be a `character` asset.
4. Require new AI-authored content, through generation guidance, to select exact allowlisted IDs.
5. Use deterministic fallbacks only for legacy content with no explicit mapping.
6. Expose a compact shortlist in world context and the complete authoring catalog through a separate endpoint.
7. Serve content-hashed runtime files with one-year immutable caching.

These boundaries follow Fowler-style Registry and Data Mapper responsibilities: the visual catalog is the registry, while canonical/manifest entity IDs are mapped to presentation assets without teaching gameplay objects about URLs or crop geometry.

## Data flow

`source sheet or Figma SVG master -> deterministic extractor -> runtime WebP + catalog -> visual asset mapper -> UI`

An Arc Manifest may carry `visualAssetId` on an enemy, boss, or item template. A v2 NPC may optionally carry a character-only ID. Validation checks both existence and kind. Runtime dungeon/reward/Town materialization preserves stable IDs, and browser presentation resolves them through the catalog.

## Authoring contract

Asset IDs have the form `<kind>.<semantic-name>.v<version>`, for example `mob.shadow-beast.v1`. The supported manifest kinds are:

- `mob` for ordinary enemies
- `boss` for bosses
- `item` for item templates
- `character` for players, allies, and optional v2 NPC artwork

The Figma character library is grouped by authoring family: humanoids (boards XIII–XIX) can author `character` or `mob` aliases; common mobs (XX–XXVII) author `mob`; elite boards (XXVIII–XXIX) author `mob` and `boss`. The stable IDs are derived from the source name, for example `character.road-sellsword.v1`, `mob.marsh-blob.v1`, and `boss.iron-husk.v1`. Catalog records carry family, role, board category, and source-master provenance; compact world context and the Workshop endpoint omit runtime URLs and provenance.

## Regeneration

Run `npm run assets:generate`. The command removes only generator-owned, content-hashed WebP files under `public/assets/runtime/`, recreates sheet crops, renders each Figma source once (aliases reuse that runtime binary), and rewrites `public/visual-asset-catalog.js`. Review changed images and catalog labels before committing.

## Rollout and compatibility

Older regular SVG atlases remain as compatibility data while UI surfaces transition. Existing manifests without `visualAssetId` remain valid. Canonical entities use explicit presentation mappings; unmapped legacy/generated entities receive a deterministic same-kind fallback.

## Verification plan

- Generator determinism: rerunning produces the same catalog and filenames.
- Catalog integrity: IDs are unique, URLs resolve, and kind lookup rejects mismatches.
- Manifest validation: valid same-kind IDs pass; unknown and cross-kind IDs fail.
- Runtime propagation: published enemy/boss, generated item, and illustrated v2 NPC/Town data retain explicit IDs.
- HTTP behavior: runtime assets return long-lived immutable cache headers.
- Presentation: mob, boss, item, character, and icon crops are visually reviewed for clipping.
