# Threadbound Arc Manifest Workflow

Threadbound treats an Arc Manifest as a portable content contract. The manifest may be authored by any producer: ChatGPT, another hosted AI, a local model, a human editor, or a future in-app generator. Threadbound does not trust the producer. The validator and publication pipeline remain authoritative.

## Intended workflow

1. Export or copy the current world context from Threadbound.
2. Give that context plus the appropriate JSON Schema to the AI or human author.
3. Produce an `arc-manifest.json` file.
4. Upload the file in the Arc Workshop.
5. Review validation errors and warnings.
6. Save the valid manifest as a draft.
7. Preview its content impact.
8. Publish explicitly.

Publication is intentionally separate from upload. An uploaded manifest never changes live gameplay merely because it parsed successfully.

## Manifest versions

- `schemas/arc-manifest.schema.json` remains the migration-compatible v1 contract used by existing bundled/generated content.
- `schemas/arc-manifest-vnext.schema.json` defines manifest version `2`, which extends the v1 payload with referential world packaging for Areas, Towns, NPCs, Quests, Shops, crafting/cooking recipes, level bands, progression challenges, and automatic-battle effect resistances.
- The authoritative validator accepts existing v1 manifests unchanged. A v2 manifest is projected through the existing v1 structural/equipment checks and additionally passes `ArcManifestVNextValidator`; generated Town shop stocks may bind to Towns declared by that same validated v2 package.
- M10-01 establishes the data/validation boundary only. Arc Workshop vNext preview/presentation remains M10-02, and authoring new Arc content remains later in Phase 10.

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
- Optional v1 `storyQuests` may compose only the existing domain-owned Quest objective vocabulary.
- v2 `quests` bind objectives to generated Area/Town/NPC IDs and reject unsupported objective types or broken visit/speak references.
- v2 crafting/cooking recipes reuse the existing domain recipe policies and may only reference item definitions present in the same manifest. Cooking remains fight-count based rather than wall-clock based.
- v2 progression challenges reference a validated dungeon and Area and preserve the default rule that major progression challenges require both human players.
- v2 enemy/boss resistances use only the automatic battle engine's constrained `fire`, `poison`, `ice`, and `psychic` vocabulary with `normal`, `resistant`, `high-resistant`, or `immune` handling.
- Uploaded files begin as drafts.
- Publishing is an explicit action.
- Published arc content is projected into the Codex automatically.

## Suggested AI prompt

Give the model both the exported world-context JSON and the selected JSON Schema, then ask:

> Create one Threadbound Arc Manifest that conforms exactly to the supplied JSON Schema. Preserve all existing canon and unresolved hooks in the world context. Use only the allowed mechanic IDs, effect IDs, enemy ability IDs, Quest objective types, equipment slots/stats/rarities, reward types, and numeric budgets listed in the context. Keep generated equipment inside its exported rarity/Level/Area power budget and use only exact allowlisted item visualAssetIds. Story Quest objectives, world references, recipes, progression challenges, combat resistances, and equipment templates must remain constrained data only; do not invent scripts, formulas, callbacks, unsupported objective types, hidden stats, currencies, or executable mechanics. Return only valid JSON for the Arc Manifest.

The validator is still expected to reject mistakes. AI output is treated as untrusted input.
