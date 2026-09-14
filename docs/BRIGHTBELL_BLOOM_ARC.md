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

M10-05 established Brightbell Bloom as source-controlled authored content that passes the same authoritative `ArcManifestService.validate()` composition used by uploads. `saveDraft()` remains non-publishing: Workshop/upload flows can still review and save a draft without making it live.

M10-06 adds the exact same source-controlled manifest to `BUNDLED_ARC_MANIFESTS`. The existing runtime bootstrap remains additive: it recognizes an already-published bundled manifest by Arc ID plus exact manifest payload, leaves that record intact, and publishes only the missing bundled content. Brightbell therefore enters the runtime catalog without superseding Glasswake.

The M10-06 regression simulates an older release where Glasswake is already published and a player has unlocked through Area 3, then starts the new bundled catalog. It proves that:

- the original Glasswake published record and revision remain unchanged;
- Glasswake and Brightbell are both present in the published Arc catalog and runtime dungeon catalog;
- Glasswake's existing dungeon still resolves after Brightbell publication;
- Areas 1, 2, and 3 remain selectable, and traveling back through each Area never lowers the player's highest-unlocked frontier.

This milestone deliberately preserves the migration-safe Area runtime established in Phase 5. Arc Manifest v2 Area/Town collections remain validated content data at this boundary; M10-06 does not replace existing persisted Area identity or retroactively rewrite player position while proving additive publication safety.

HUMAN playtest gates remain manual; schema validation, CI, and automated revisit regression do not claim that the Arc is fun or balanced in real play.
