# Equipment slots foundation

Status: **M1-04 implementation complete on this branch; mark the master checklist complete only after merge and green `main` CI.**

Threadbound now has one canonical familiar equipment-loadout boundary spanning persistence, Service Layer/read model, compatibility combat, and Inventory presentation.

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

Existing saves remain migration-safe: a valid legacy `players.equipped_item_id` Weapon is imported into the new loadout table, and equipping a Weapon through the canonical repository keeps that legacy pointer synchronized. Non-Weapon slots do not overload the old pointer.

## Service Layer and read model

`GameService` now owns a `SQLiteEquipmentRepository` dependency and uses it for equipment commands and dashboard projection.

`character.equipment` is the canonical read model and always contains the five slot keys. Each value is either the currently equipped item for that slot or `null`.

`character.equippedItem` remains temporarily as a **Weapon-only compatibility alias** so legacy tactical combat and older presentation code keep working during the strangler migration. Compatibility combat also reads the Weapon from the canonical loadout rather than directly from `players.equipped_item_id`.

M1-04 deliberately does **not** make Helmet/Armor/Boots/Accessory contribute Attack, Defense, HP, Speed, or Crit yet. Those derived-stat semantics belong to M1-05.

## Inventory presentation

The equipment progression presentation model resolves equipped state against the item's canonical slot. Inventory rows expose the familiar slot label and do not offer a second Equip action for an item already occupying its slot. Active-run equipment locks remain enforced server-side and mirrored in the UI.

This is still a compatibility-stage Inventory surface; the full five-slot rich Inventory card remains M2-02.

## Verification

- `test/equipment-slots.test.js` covers exact slot vocabulary, invalid-slot rejection, one-item-per-slot persistence, replacement within a slot, legacy Weapon migration/compatibility, and active-run equipment locking.
- `test/equipment-loadout-integration.test.js` covers Service Layer projection/equipping, simultaneous Weapon + Helmet persistence, the Weapon compatibility alias, and slot metadata on equipment events.
- `test/e2e/relic-progression.local.spec.js` verifies the mobile Inventory journey receives all five canonical slot keys, renders the item's slot label, keeps the Weapon alias synchronized, and preserves active-run equip locking.

## Handoff

After this branch merges and `main` CI is green, mark **M1-04** complete. The next dependency-satisfied milestone is **M1-05 — readable derived stats: Attack, Defense, Max HP, Speed, Crit Chance**. Build those rules in a domain policy/model over the canonical five-slot loadout rather than embedding stat math in SQLite or browser code.
