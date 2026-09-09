# Combat Clarity & Resolution Implementation

This pass deliberately keeps the following boundaries:

- `DungeonRun` owns action ordering, lethal resolution and explicit death effects because those are combat invariants.
- `CriticalStrikePolicy` is a deterministic Domain Policy. The run id/version/player/action seed makes preview and commit agree without browser-side randomness or rerolls.
- `CombatPreviewService` remains a read-only Application Service and obtains damage/critical results by simulating the real `AdventureRun` aggregate.
- `ActivityStreamService` projects critical/death-effect facts and enriches run-decision projections with the authoritative next enemy state.
- `gameplay-feel.js`, `semantic-combat-colors.js`, and `combat-transition-presentation.js` are Presentation Model concerns only. They may animate, color, overlay or enrich presentation but never decide combat outcomes.
- Stream persistence remains append-only.

Player-first resolution means an offensive action applies before an already telegraphed ignored intent. If that action kills the enemy, the ordinary pending intent is cancelled. An explicit `death_burst` ability is the first supported exception and demonstrates the extension point for future deathrattles/exploding enemies without special-casing UI code.