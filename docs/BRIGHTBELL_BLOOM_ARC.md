# The Brightbell Bloom — first full Arc Manifest vNext package

`content/arcs/brightbell-bloom.arc-manifest.json` is Threadbound's first full authored **Arc Manifest v2** package. It is the M10-05 content milestone and deliberately exercises the vNext contract at realistic Arc breadth without creating a second gameplay architecture.

## Package shape

The Arc follows the project's colorful guild-adventure tone: a festival road of ringing flowers climbs through warmglass orchards toward a highland signal tower whose summit bell has started answering a strange storm note.

The package contains:

- 3 permanent Areas: **Bellbloom Meadows**, **Emberglass Orchard**, and **Kitewind Heights**;
- 2 Towns: **Bellbloom** and **Kitewatch**;
- 10 named NPCs across quest, shop, cook, smith, bank, guild-hall, crafter, innkeeper, and special roles;
- 12 normal enemies and 3 progression bosses;
- 3 two-player progression Adventures, with each gate retaining the canonical `requiresBothHumans: true` rule;
- 21 equipment templates covering Weapon, Helmet, Armor, Boots, and Accessory, using only canonical stats/effects and allowlisted semantic `visualAssetId` values;
- 12 constrained-data Quests using the existing objective vocabulary;
- 2 Gold-only Town Shops with server-validated equipment stock;
- 3 crafting recipes and 3 fight-count cooking recipes;
- 6 achievements, 5 lore entries, and 2 historical consequences.

The package introduces no headline wallet beyond Gold/Honey and contains no executable generated mechanic. Enemy abilities, automatic-battle resistances, equipment effects, recipes, Quest objectives, progression references, prices, and visuals remain inside the existing allowlisted policies and validators.

## Validation and publication boundary

M10-05 is an **authoring/generation milestone**, not an implicit world-replacement step. The package must pass the same authoritative `ArcManifestService.validate()` composition used by uploads, and the Arc Workshop mobile acceptance path proves it can be reviewed and saved as a **draft**.

The package is intentionally **not** added to `BUNDLED_ARC_MANIFESTS` in M10-05. Bundled manifests are auto-published by the current runtime content bootstrap, which would skip the next ordered acceptance question.

**M10-06 owns explicit publication plus regression proof that previously available Arcs/Areas remain revisit-able after the new Arc enters the world.** Until that milestone is green, Brightbell Bloom remains source-controlled, fully validated content that requires an explicit publication action.

HUMAN playtest gates remain manual; schema validation, CI, and Workshop automation do not claim that the Arc is fun or balanced in real play.
