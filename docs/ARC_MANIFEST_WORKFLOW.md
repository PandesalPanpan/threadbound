# Threadbound Arc Manifest Workflow

Threadbound treats an Arc Manifest as a portable content contract. The manifest may be authored by any producer: ChatGPT, another hosted AI, a local model, a human editor, or a future in-app generator. Threadbound does not trust the producer. The validator and publication pipeline remain authoritative.

## Intended workflow

1. Export or copy the current world context from Threadbound.
2. Give that context plus `schemas/arc-manifest.schema.json` to the AI or human author.
3. Produce an `arc-manifest.json` file.
4. Upload the file in the Arc Workshop.
5. Review validation errors and warnings.
6. Save the valid manifest as a draft.
7. Preview its content impact.
8. Publish explicitly.

Publication is intentionally separate from upload. An uploaded manifest never changes live gameplay merely because it parsed successfully.

## Provider independence

The same JSON contract is used whether the manifest came from ChatGPT, Claude, Gemini, a local model, a handwritten file, or a future Threadbound generation adapter. This keeps generation outside the core domain and makes paid AI APIs optional.

## Authority rules

- Canonical mechanics and effect IDs are owned by Threadbound.
- A manifest can only reference mechanics allowed by the validator.
- IDs must be unique inside a manifest and may not overwrite protected canonical IDs.
- Balance budgets, enemy stats, dungeon composition, progression thresholds, and references are validated before publication.
- Uploaded files begin as drafts.
- Publishing is an explicit action.
- Published arc content is projected into the Codex automatically.

## Suggested AI prompt

Give the model both the exported world-context JSON and the JSON Schema, then ask:

> Create one Threadbound Arc Manifest that conforms exactly to the supplied JSON Schema. Preserve all existing canon and unresolved hooks in the world context. Use only the allowed mechanic IDs, effect IDs, enemy ability IDs, reward types, and numeric budgets listed in the context. Do not invent executable code or unsupported mechanics. Return only valid JSON for the Arc Manifest.

The validator is still expected to reject mistakes. AI output is treated as untrusted input.
