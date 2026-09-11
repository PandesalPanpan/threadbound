# ADR 0001: Semantic visual asset catalog with derived runtime files

## Status

Accepted — 2026-09-11

## Context

Threadbound received large AI-generated sheets with irregularly sized subjects. Uniform CSS grid cropping is unsuitable, direct sheet use transfers megabytes for a single portrait, and embedding file paths in domain entities would couple gameplay to presentation. Arc generation also needs deterministic, reviewable portrait selection.

## Decision

Retain sheets as source masters, commit deterministic lossless-WebP crops, and address art through versioned canon-neutral `visualAssetId` values. A catalog acts as the asset registry. Presentation mappers bind canonical IDs to assets. Arc Manifests may provide an optional exact allowlisted ID that is type-checked during validation.

## Consequences

- Runtime files are independently and immutably cacheable.
- Published manifests remain visually deterministic as the catalog grows.
- Existing manifests remain compatible.
- Generated binary files increase repository size.
- Catalog labels require human review when source art changes.
- The extraction command becomes part of asset maintenance, not application startup.
