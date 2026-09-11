# Visual Asset Architecture and Execution Plan

## Outcome

The five project-owned AI-generated sheets in `public/assets/generated/` are source masters. A deterministic generator crops them into 366 lossless WebP runtime assets and writes a versioned, semantically labeled catalog. Threadbound entities and Arc Manifests reference stable `visualAssetId` values rather than file paths or sheet coordinates.

## Decisions

1. Keep source sheets and commit generated runtime assets.
2. Use canon-neutral semantic IDs, labels, descriptions, and tags.
3. Keep `visualAssetId` optional for backward compatibility, but validate it strictly when present.
4. Require new AI-authored content, through generation guidance, to select exact allowlisted IDs.
5. Use deterministic fallbacks only for legacy content with no explicit mapping.
6. Expose a compact shortlist in world context and the complete authoring catalog through a separate endpoint.
7. Serve content-hashed runtime files with one-year immutable caching.

These boundaries follow Fowler-style Registry and Data Mapper responsibilities: the visual catalog is the registry, while canonical/manifest entity IDs are mapped to presentation assets without teaching gameplay objects about URLs or crop geometry.

## Data flow

`source sheet -> deterministic extractor -> runtime WebP + catalog -> visual asset mapper -> UI`

An Arc Manifest may carry `visualAssetId` on an enemy, boss, or item template. Validation checks both existence and kind. Runtime dungeon/reward materialization preserves that stable ID, and browser presentation resolves it through the catalog.

## Authoring contract

Asset IDs have the form `<kind>.<semantic-name>.v<version>`, for example `mob.shadow-beast.v1`. The supported manifest kinds are:

- `mob` for ordinary enemies
- `boss` for bosses
- `item` for item templates

Character and UI icon assets are cataloged for first-party presentation but are not accepted in those manifest fields.

## Regeneration

Run `npm run assets:generate`. The command removes only generator-owned, content-hashed WebP files under `public/assets/runtime/`, recreates crops, and rewrites `public/visual-asset-catalog.js`. Review changed images and catalog labels before committing.

## Rollout and compatibility

Older regular SVG atlases remain as compatibility data while UI surfaces transition. Existing manifests without `visualAssetId` remain valid. Canonical entities use explicit presentation mappings; unmapped legacy/generated entities receive a deterministic same-kind fallback.

## Verification plan

- Generator determinism: rerunning produces the same catalog and filenames.
- Catalog integrity: IDs are unique, URLs resolve, and kind lookup rejects mismatches.
- Manifest validation: valid same-kind IDs pass; unknown and cross-kind IDs fail.
- Runtime propagation: published enemy/boss and generated item data retain explicit IDs.
- HTTP behavior: runtime assets return long-lived immutable cache headers.
- Presentation: mob, boss, item, character, and icon crops are visually reviewed for clipping.
