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
- New equipment templates use canonical Weapon/Helmet/Armor/Boots/Accessory slots, Common-through-Mythic rarity, the five readable stat bonuses, at most three allowlisted effect codes, required Level, Area number, and an exact allowlisted item `visualAssetId`.
- Equipment stats/effects must fit the exported rarity + Level + Area power budget. Generated content cannot invent extra stat names, callbacks, formulas, or executable item mechanics. See `docs/ARC_EQUIPMENT_TEMPLATES.md`.
- Existing weapon-only Arc Manifest v1 item templates remain accepted for migration compatibility; new authored equipment should use the extended template shape.
- Optional `storyQuests` may compose only the domain-owned Quest objective vocabulary: `kill`, `hunt`, `adventure`, `collect`, `boss`, `visit`, and `speak`.
- Story Quest objectives are constrained data. Objective fields outside `id`, `type`, `targetId`, `targetLabel`, and `count` are rejected; generated content cannot add scripts, formulas, callbacks, or custom executable mechanics.
- Existing Arc Manifest v1 files may omit `storyQuests`; the extension is migration-compatible.
- Story Quest publication in v1 preserves validated authoring data but does not yet bind generated Quests into live Area/Town/NPC placement. Full referential world binding is deferred to Arc Manifest vNext.
- Uploaded files begin as drafts.
- Publishing is an explicit action.
- Published arc content is projected into the Codex automatically.

## Suggested AI prompt

Give the model both the exported world-context JSON and the JSON Schema, then ask:

> Create one Threadbound Arc Manifest that conforms exactly to the supplied JSON Schema. Preserve all existing canon and unresolved hooks in the world context. Use only the allowed mechanic IDs, effect IDs, enemy ability IDs, Quest objective types, equipment slots/stats/rarities, reward types, and numeric budgets listed in the context. Keep generated equipment inside its exported rarity/Level/Area power budget and use only exact allowlisted item visualAssetIds. Story Quest objectives and equipment templates must remain data only; do not invent scripts, formulas, callbacks, unsupported objective types, hidden stats, or executable mechanics. Return only valid JSON for the Arc Manifest.

The validator is still expected to reject mistakes. AI output is treated as untrusted input.
