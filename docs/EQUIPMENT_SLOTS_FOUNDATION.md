# Equipment slots and generated loot

Status: **Five-slot generated Equipment, stat persistence, and semantic item art are implemented and branch-verified. Delivery remains pending merge and green `main` CI.**

Threadbound uses one canonical Equipment loadout across the Service Layer,
repositories, battle calculations, and player-facing read models.

## Canonical slots and stat identity

`EquipmentSlotPolicy` owns the five player-facing slots:

- Weapon
- Helmet
- Armor
- Boots
- Accessory

Generated items use Area-authored material/family and rarity profiles, with
slot-appropriate combinations of Attack, Defense, Max HP, Speed, and Crit
Chance. Weapon families are selected from swords, daggers, spears, axes, bows,
crossbows, and staffs. Armor, helmet, boots, and accessory families use the
corresponding official item library families. Area 1 has a lower rarity ceiling
than later Areas, and Area 4 has the strongest authored profile.

These values contribute through the existing equipment battle effects/read
models. They are not calculated in React. Level-derived base Max HP remains a
separate progression value and equipment Max HP adds to it.

## Persistence boundary and old saves

`SQLiteEquipmentRepository` owns the additive `player_equipment` table. It
persists at most one equipped item per slot and validates that equipped items
belong to the player. Changing equipment remains forbidden during an active
Dungeon.

`SQLiteItemMapper` is the single row-to-equipment projection shared by game,
equipment, and Codex reads. New stat values and constrained item metadata are
stored in the existing item effect/template JSON payload, while the legacy
`attack_bonus` column remains readable and synchronized. Old rows that contain
only `attack_bonus` hydrate with zero for unsupported extended stats; their
effect payload and semantic art identifiers remain intact. Equipment Max HP
composition reads through the canonical mapper.

Existing saves remain migration-safe: a valid legacy
`players.equipped_item_id` Weapon is imported into the loadout table, and
equipping a Weapon through the canonical repository keeps that legacy pointer
synchronized. Non-Weapon slots do not overload the old pointer.

## Official semantic item art

Generated items persist a stable `visualAssetId` selected from
`public/visual-asset-catalog.js` through `public/sprite-catalog.js`. The item
data does not store image URLs or crop geometry. Inventory, Shop, Profile,
equipment slots, Hunt/Adventure/Dungeon loot receipts, Codex, and Duel/loadout
surfaces use the same semantic resolver. New equipment rewards and starter
offers use the individually exported Figma item library. Existing legacy IDs
remain registered against their original artwork so persisted items continue to
resolve without migration.

`public/assets/runtime/` remains the committed deterministic output generated
from the legacy sheets and Figma item and character source masters. New game UI
should not add direct legacy `/sprites/kenney/*` paths when a semantic asset is
available.

## Service Layer and read model

`GameService` uses the canonical equipment repository for commands and
dashboard projection. `character.equipment` always contains the five slot
keys; each value is the equipped item for that slot or `null`.

`character.equippedItem` remains temporarily as a Weapon-only compatibility
alias so older combat/presentation paths keep working during the strangler
migration. Compatibility combat reads Weapon from the canonical loadout.
Inventory exposes slot, rarity, stat, and semantic-art details from the same
persisted item model.

## Verification contract

Focused tests cover slot vocabulary and locking, equipment row mapping,
extended stats, legacy Weapon migration, old-item compatibility, area/rarity
catalog selection, and consistent visual asset resolution. Full verification
also includes the mobile and desktop React stream journeys and `npm run check`.

## Handoff

Keep Equipment rules in the domain and canonical item Data Mapper. Do not
duplicate stat, rarity, or art-selection logic in browser components. Mark the
relevant master-plan acceptance complete only after combined verification,
documentation, merge, and green `main` CI.
