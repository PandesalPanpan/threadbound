# Equipment slots foundation

Status: **M1-04 in progress; do not check it complete yet.**

This increment establishes the canonical familiar equipment-slot vocabulary and a migration-safe persistence boundary without changing the currently shipped Weapon-only combat/read-model path.

## Canonical slots

`EquipmentSlotPolicy` owns exactly five player-facing slots:

- Weapon
- Helmet
- Armor
- Boots
- Accessory

Unknown legacy/product terms are rejected rather than silently becoming new slot categories.

## Persistence boundary

`SQLiteEquipmentRepository` owns the additive `player_equipment` table. It persists at most one equipped item per slot and validates that equipped items belong to the player. Changing equipment remains forbidden during an active dungeon.

Existing saves remain migration-safe: a valid legacy `players.equipped_item_id` Weapon is imported into the new loadout table, and equipping a Weapon through the new repository keeps that legacy pointer synchronized. Non-Weapon slots do not overload the old pointer.

## Why M1-04 remains unchecked

The authoritative five-slot persistence contract now exists, but the application path still reads `equipped_item_id` as the current Weapon in Hunt/dungeon combat and the dashboard still exposes only `character.equippedItem`. Before M1-04 can be marked complete, the Service Layer/read model must consume the per-slot loadout, Inventory presentation must recognize equipped state by slot, and browser acceptance must cover the resulting player journey.

M1-05 stat derivation is intentionally not implemented here. Slot persistence should land before Attack/Defense/Max HP/Speed/Crit semantics so the next milestone can build on one stable loadout source instead of embedding stat rules into SQLite or browser code.

## Verification

`test/equipment-slots.test.js` covers the exact slot vocabulary, invalid-slot rejection, one-item-per-slot persistence, replacement within a slot, legacy Weapon migration/compatibility, and active-run equipment locking.

## Handoff

Continue **M1-04**. Wire `SQLiteEquipmentRepository` into the application Service Layer and dashboard read model, preserve `equippedItem` as a temporary Weapon compatibility alias, update Inventory equipped-state presentation to use item slots, add Playwright coverage, then mark M1-04 complete only after post-merge `main` CI is green.
