# Threadbound Arc Manifest Workflow

Threadbound treats an Arc Manifest as a portable content contract. The manifest may be authored by any producer: ChatGPT, another hosted AI, a local model, a human editor, or a future in-app generator. Threadbound does not trust the producer. The validator and publication pipeline remain authoritative.

## Intended workflow

1. Export or copy the current world context from Threadbound.
2. Give that context plus the appropriate JSON Schema and `docs/ARC_GENERATION_GUIDANCE.md` to the AI or human author.
3. Produce an `arc-manifest.json` file.
4. Upload the file in the Arc Workshop.
5. Review validation errors and warnings.
6. Review the package against the tone/originality checklist in `docs/ARC_GENERATION_GUIDANCE.md`.
7. Save the valid manifest as a draft.
8. Preview its content impact.
9. Publish explicitly.

Publication is intentionally separate from upload. An uploaded manifest never changes live gameplay merely because it parsed successfully.

## Manifest versions

- `schemas/arc-manifest.schema.json` remains the migration-compatible v1 contract used by existing bundled/generated content.
- `schemas/arc-manifest-vnext.schema.json` defines manifest version `2`, which extends the v1 payload with referential world packaging for Areas, Towns, NPCs, Quests, Shops, crafting/cooking recipes, level bands, progression challenges, and automatic-battle effect resistances.
- The authoritative validator accepts existing v1 manifests unchanged. A v2 manifest is projected through the existing v1 structural/equipment checks and additionally passes `ArcManifestVNextValidator`; generated Town shop stocks may bind to Towns declared by that same validated v2 package.
- The Arc Workshop labels the detected manifest version and, for v2, previews the package's Areas, Towns, NPCs, Quests, Shops, recipes, and progression challenges before save/publish. The browser preview is informational only; world references, recipes, progression rules, equipment, and combat resistances are still revalidated server-side.
- `examples/arc-manifest-vnext.example.json` is a compact valid v2 package used by the Workshop acceptance path and as an authoring reference.

## Provider independence

The same JSON contract is used whether the manifest came from ChatGPT, Claude, Gemini, a local model, a handwritten file, or a future Threadbound generation adapter. This keeps generation outside the core domain and makes paid AI APIs optional.

## Generation/editorial guidance

`docs/ARC_GENERATION_GUIDANCE.md` is the canonical authoring guidance for generated Arc concepts and prose. New Arc generation should aim across the package for the master plan's approximate **70% lighthearted/colorful guild adventure, 20% exciting danger, and 10% serious/emotional weight** while remaining original to Threadbound.

The guidance requires references to be translated into abstract traits instead of copied expression. It rejects renamed or closely imitated copyrighted characters, distinctive designs, storylines, locations, factions, artifacts, dialogue, boss packages, and other recognizable recreations. It also gives Threadbound-first guidance for NPCs, Areas/Towns, Quests, enemies/bosses, equipment/food/rewards, and visual prompts, plus a pre-publish review checklist.

These editorial rules complement rather than replace schema validation. The validator proves structural/mechanical constraints; human review is still responsible for tone, originality, coherence, and whether generated content belongs in Threadbound.

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

Give the model the exported world-context JSON, the selected JSON Schema, and `docs/ARC_GENERATION_GUIDANCE.md`, then ask:

> Create one original Threadbound Arc Manifest that conforms exactly to the supplied JSON Schema. Preserve all existing canon and unresolved hooks in the world context. Across the package, aim for roughly 70% lighthearted/colorful guild adventure, 20% exciting danger, and 10% serious/emotional weight. Use broad fantasy/anime-adventure conventions only as ingredients; do not copy, rename, closely imitate, or continue characters, designs, dialogue, locations, factions, quests, magic systems, scenes, bosses, artifacts, or storylines from existing copyrighted works. Translate any references into abstract traits and invent a distinct Threadbound identity. Use only the allowed mechanic IDs, effect IDs, enemy ability IDs, Quest objective types, equipment slots/stats/rarities, reward types, and numeric budgets listed in the context. Keep generated equipment inside its exported rarity/Level/Area power budget and use only exact allowlisted item visualAssetIds. Story Quest objectives, world references, recipes, progression challenges, combat resistances, and equipment templates must remain constrained data only; do not invent scripts, formulas, callbacks, unsupported objective types, hidden stats, currencies, or executable mechanics. Do not introduce a headline currency beyond Gold and Honey. Return only valid JSON for the Arc Manifest.

The validator is still expected to reject mistakes. AI output is treated as untrusted input, and valid JSON still requires tone/originality review before publication.
