# Combat Clarity & Resolution Implementation

This pass deliberately keeps the following boundaries:

- `DungeonRun` owns action ordering, lethal resolution and explicit death effects because those are combat invariants.
- `CriticalStrikePolicy` is a deterministic Domain Policy. The run id/version/player/action seed makes preview and commit agree without browser-side randomness or rerolls.
- `CombatPreviewService` remains a read-only Application Service and obtains damage/critical results by simulating the real `AdventureRun` aggregate.
- `ActivityStreamService` projects critical/death-effect facts and enriches run-decision projections with the authoritative next enemy state.
- The retired pre-PV2 tactical presentation adapters were browser-only concerns;
  they never decided combat outcomes and were removed in PV2-J02. The current
  player surface keeps the same boundary through the v2 stream/simple-loop
  presentation adapters.
- Stream persistence remains append-only.

Player-first resolution means an offensive action applies before an already telegraphed ignored intent. If that action kills the enemy, the ordinary pending intent is cancelled. An explicit `death_burst` ability is the first supported exception and demonstrates the extension point for future deathrattles/exploding enemies without special-casing UI code.
