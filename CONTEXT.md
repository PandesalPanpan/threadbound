# Threadbound Glossary

## Arc Manifest

A portable, untrusted content contract that may define narrative, encounters, rewards, and exact allowlisted visual asset references. Publication is explicit and validation remains authoritative.

## Source sheet

A project-owned AI-generated PNG containing multiple pieces of source art. Source sheets are retained as editable masters and are not fetched by gameplay UI.

## Visual asset

A presentation resource identified by a stable, canon-neutral `visualAssetId`. A visual asset describes what an image depicts; it does not define gameplay behavior or canonical identity.

## Visual asset catalog

The versioned allowlist of visual assets, including their kind, neutral label, description, tags, runtime URL, dimensions, and provenance.

## Runtime asset

A tightly cropped, lossless WebP derived deterministically from a source sheet. Runtime filenames contain a content hash and may be cached immutably.

## Canonical visual mapping

A presentation-layer association between a Threadbound entity ID and a `visualAssetId`. It is separate from the domain model so canon and art can evolve independently.
