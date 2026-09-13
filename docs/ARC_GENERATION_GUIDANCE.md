# Threadbound Arc Generation Guidance

This document is the authoring contract for new Threadbound Arc concepts, prose, characters, places, quests, enemies, bosses, items, and visual prompts. It refines the canonical product direction in `docs/THREADBOUND_MASTER_PLAN.md`; it does not override the Arc Manifest schema or authoritative validators.

Generated output is always untrusted content. It must still conform to the selected Arc Manifest schema, exported world context, allowlisted mechanics, numeric budgets, reference rules, and publication workflow described in `docs/ARC_MANIFEST_WORKFLOW.md`.

## Tone target: 70 / 20 / 10

Use the ratio as an editorial compass across an Arc, not as a per-scene formula.

- **70% lighthearted, colorful guild-anime adventure** — welcoming towns, expressive guild personalities, playful rivalries, odd jobs, food, festivals, travel mishaps, curious monsters, optimistic discoveries, friendly banter, and rewards that make ordinary play feel lively.
- **20% exciting danger** — dangerous routes, intimidating elites, escalating Adventures, time-sensitive rescues, risky ruins, boss pressure, rival challenges, and combat stakes that make progression feel earned.
- **10% serious or emotional weight** — loss, difficult choices, old promises, reconciliation, sacrifice, consequences, or quiet character moments. These scenes should matter because the surrounding world is usually warm rather than because the whole setting is grim.

Default play should feel adventurous, friendly, colorful, curious, and occasionally funny. Do not make misery, cynicism, cruelty, apocalypse, betrayal, or horror the constant baseline. Serious material should create contrast and consequence, then allow the world to breathe again.

## Originality boundary

Threadbound may draw on broad genre conventions, but generated content must be original to Threadbound.

Do not ask for or produce:

- an existing copyrighted character with the name changed;
- a recognizable recreation of an existing character's visual design, costume, signature weapon, personality bundle, biography, powers, catchphrases, or relationships;
- a scene-by-scene, quest-by-quest, or arc-by-arc rewrite of an existing anime, manga, game, novel, film, or other story;
- a town, guild, faction, boss, artifact, or magic system whose distinctive identity is substantially copied from one identifiable work;
- dialogue written to imitate the distinctive voice of a living author or a specific copyrighted character;
- prompts such as “make this character basically X,” “use X but rename them,” or “recreate the Y arc.”

Broad ingredients are acceptable when recombined into a distinct identity: adventurer guilds, quest boards, elemental monsters, rival parties, festivals, ruins, enchanted forests, blacksmiths, cooking, dungeon bosses, found-family themes, and colorful fantasy towns are genre-level concepts rather than a license to copy one particular expression.

When a reference is supplied for mood or quality, translate it into abstract traits before generation. For example, replace “make a character like [named character]” with requirements such as “cheerful veteran lancer, competitive but generous, sunflower motif, protects junior adventurers, fights with mobility rather than raw strength.” The resulting identity, silhouette, history, relationships, naming, equipment, dialogue, and story role should be newly invented.

## Threadbound-first worldbuilding

Every generated element should answer at least one Threadbound-specific gameplay or world need.

Prefer content that connects to:

- a permanent Area players can revisit;
- a Town service, NPC, Guild Hall, Shop, Quest, or profession;
- Hunt or Adventure encounters;
- equipment, recipes, achievements, or readable progression rewards;
- a progression challenge that advances the shared journey;
- simulated adventurers or rivals who make the guild world feel persistent;
- established Arc/world hooks without overwriting older canon.

Avoid lore that exists only as an encyclopedia dump. Put most characterization into playable hooks, short dialogue, receipts, item flavor, NPC interactions, quests, environmental details, and consequences the two human players can encounter.

## Character and NPC guidance

Build characters from independent dimensions instead of a familiar franchise template:

1. **Role in the world** — shopkeeper, scout, cook, healer, rival, guild clerk, monster researcher, blacksmith, courier, retired adventurer, etc.
2. **Personal want** — prove a theory, restore a family inn, win a cooking contest, map a route, reconcile with a teammate, repay a debt.
3. **Contradiction** — brave but terrible with directions; stern but secretly collects cute monster sketches; famous fighter who dislikes crowds.
4. **Visual identity** — choose a new silhouette, palette family, motif, equipment set, and practical profession details without referencing a protected character design.
5. **Gameplay connection** — quest chain, service, rivalry, recipe, shop stock, progression clue, Adventure event, or recurring Guild Hall presence.
6. **Relationship web** — give important NPCs at least one Threadbound-original relationship to another local person, faction, Area, or event.

Do not rely on one-note parody personalities or make every NPC speak in exaggerated anime catchphrases. Colorful does not require noisy.

## Area and Town guidance

Each Area should have a readable gameplay identity and at least two differentiators beyond palette alone, such as traversal fiction, enemy ecology, resource identity, local problem, weather, profession, social custom, or Adventure hook.

Each Town should feel useful rather than decorative. Prefer a compact set of memorable services and NPCs tied to the Area's problems and rewards. Towns may be whimsical, but the humor should come from original local circumstances rather than direct references or jokes that depend on another franchise.

Previously published Areas and Arcs remain part of the permanent world. New generation should extend the world, not reboot it or silently replace older canon.

## Quest and story guidance

Use simple objectives as the mechanical spine, then add enough fiction to make them memorable. A generated story quest should still reduce to validated objective types and references supported by the manifest contract.

Good quest structure usually has:

- an immediate understandable request;
- a reason the request matters to a person or place;
- one or two gameplay steps using validated Hunt, Adventure, collect, boss, visit, or speak objectives;
- a concise payoff or change in relationship/world state;
- rewards appropriate to the exported balance context.

Do not generate long mandatory dialogue walls before routine actions. Keep the Adventure Stream scannable and let optional detail carry deeper lore.

For the 10% serious material, avoid shock value as a substitute for writing. Prefer earned consequences, difficult loyalties, remembrance, responsibility, or reconciliation. Do not use graphic suffering merely to signal maturity.

## Enemy and boss guidance

Enemies should fit the Area ecology or local conflict and remain visually/mechanically distinguishable at a glance. Recombine creature type, behavior, environment, profession/faction, material, and elemental/status vocabulary into original concepts.

Bosses should have a clear narrative reason to matter and a readable gameplay identity. Use only mechanics and effects permitted by the authoritative context. Do not recreate a famous boss's distinctive appearance, attack sequence, arena story, or signature mechanic package.

Major progression bosses may support sparse party decisions, but generation must never request the legacy permanent tactical dashboard or invent executable combat scripts.

## Item, equipment, food, and reward guidance

Names and flavor should reinforce the local Arc identity while mechanics remain within the exported schema and budgets.

- Use canonical equipment slots and Common-through-Mythic rarity.
- Use only allowlisted stats, effects, recipes, reward types, and `visualAssetId` values.
- Gold remains the normal game currency and Honey remains the externally owned premium currency. Do not invent another headline wallet.
- Prefer food buffs measured in remaining fights when using the cooking system.
- Give notable rewards an original visual/material motif tied to their source Area, NPC, enemy, profession, or story.

Do not copy iconic named weapons, costumes, artifacts, foods, or item descriptions from existing works.

## Visual-generation guidance

Visual prompts should describe original subject matter directly rather than naming a copyrighted franchise, character, artist, or studio as the target.

Prefer prompt dimensions such as:

- subject and role;
- silhouette and pose;
- clothing/armor materials;
- original motif;
- palette family;
- expression;
- readable equipment;
- environment;
- camera framing;
- rendering traits needed by Threadbound's sprite pipeline.

If a mood reference is useful, convert it to generic visual properties such as “bright cel-shaded fantasy color blocking,” “clean readable mobile-game silhouette,” “warm guild hall lighting,” or “playful adventure illustration.” Avoid “in the style of [living artist/studio]” and avoid named-character lookalikes.

Generated art still enters Threadbound through the project-owned source-sheet, visual-asset catalog, deterministic runtime asset, and `visualAssetId` workflow. Gameplay domain objects must not depend on raw image URLs or prompt text.

## Generation prompt contract

When generating an Arc or Arc component, provide the model with:

1. the current exported world context;
2. the correct Arc Manifest schema/version;
3. relevant allowlists and numeric budgets;
4. this generation guidance;
5. the explicit instruction that existing canon is additive and must not be overwritten.

Use language equivalent to:

> Create original Threadbound content for the supplied world context. Aim across the package for roughly 70% lighthearted/colorful guild adventure, 20% exciting danger, and 10% serious/emotional weight. Use broad fantasy/anime-adventure genre conventions only as ingredients; do not copy, rename, closely imitate, or continue characters, designs, dialogue, locations, factions, quests, magic systems, scenes, or storylines from existing copyrighted works. Translate any references into abstract traits and invent a distinct Threadbound identity. Preserve existing canon, use only the supplied schema/allowlists/budgets, introduce no executable mechanics, and introduce no headline currency beyond Gold and Honey.

The output must still pass authoritative validation. This guidance does not make generated data trusted.

## Review checklist before Workshop save/publish

A reviewer should be able to answer **yes** to all of these before accepting generated Arc content:

- Does the package feel mostly colorful, friendly, curious, and adventurous, with danger and seriousness used as contrast?
- Can every important character be described without saying “it is basically [existing character]”?
- Are names, silhouettes, costumes, relationships, histories, locations, factions, artifacts, quests, bosses, and story beats independently identifiable as Threadbound creations?
- If references were used, were they reduced to abstract traits rather than copied expression?
- Does each major lore element connect to playable Areas, Towns, NPCs, Quests, Adventures, rewards, professions, or progression?
- Does the package preserve prior canon and leave previously published Areas/Arcs intact?
- Are mechanics constrained to the supplied schema, allowlists, and budgets?
- Does the content avoid arbitrary scripts, callbacks, hidden stats, unsupported objectives, or tactical-dashboard mechanics?
- Does the economy still use Gold and Honey as the only headline currencies?
- Are visual prompts original descriptions rather than named-character, franchise, living-artist, or studio imitation requests?

If originality is uncertain, regenerate the questionable element from its gameplay purpose and abstract traits rather than trying to disguise the reference with renamed nouns.
