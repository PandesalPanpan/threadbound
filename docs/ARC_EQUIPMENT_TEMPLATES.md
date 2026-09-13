# Arc equipment templates

M7-01 extends Arc Manifest equipment authoring from the legacy weapon-only `attackBonus` shape to familiar five-slot equipment while keeping old v1 manifests valid.

## Authoritative vocabulary

New equipment templates use domain-owned concepts rather than inventing Arc-specific mechanics:

- slots: `weapon`, `helmet`, `armor`, `boots`, `accessory`;
- rarities: `common`, `uncommon`, `rare`, `epic`, `legendary`, `mythic`;
- stats: `attackBonus`, `defenseBonus`, `maxHpBonus`, `speedBonus`, `critChanceBonus`;
- effects: codes from `EquipmentBattleEffectPolicy` only;
- exact allowlisted `item.*` `visualAssetId` references.

`ArcEquipmentTemplatePolicy` owns normalization and the power-budget calculation. `ArcEquipmentTemplateValidator` applies that policy to untrusted Arc Manifest data. The browser and JSON Schema mirror the contract but are not authoritative gameplay rules.

## Extended template shape

An extended template supplies `slot`, `rarity`, `stats`, `effects`, `requiredLevel`, `areaNumber`, and `visualAssetId`. The top-level `attackBonus` remains temporarily required as a migration alias and must equal `stats.attackBonus`.

Canonical Attack currently reads only the equipped Weapon's `attackBonus`, so non-Weapon templates cannot claim Attack bonus. Defense, Max HP, Speed, and Crit Chance may be supplied by any equipment slot through the existing `CharacterStatPolicy` loadout calculation.

## Progression-aware budget

Generated equipment cannot choose arbitrary stat totals merely because a field is schema-valid. The authoritative budget is:

```text
limit = rarity.maxAttack
      + (areaNumber - 1)
      + floor((requiredLevel - 1) / 10)
```

Weighted cost is:

```text
Attack        1 point per +1
Defense       1 point per +1
Max HP        0.25 point per +1
Speed         1 point per +1
Crit Chance   1 point per +1 percentage point
special effect 1 point per non-plain allowlisted effect
```

An extended item may carry at most three unique allowlisted effects. `none` cannot be combined with another extended effect. Templates above their progression budget are rejected before draft save or publication. Crit Chance bonus is independently capped at 100% before the budget calculation.

This is an authoring safety budget, not a claim that final balance is complete. Later tuning may change the centralized policy without moving formulas into generated content.

## Persistence and runtime materialization

`ArcManifestService.generateReward()` materializes the validated template into the existing item model, including slot, rarity tier, all canonical stat bonuses, effect codes, required Level, Area, budget metadata, and visual asset.

Migration safety is preserved without rewriting the `items` table:

- `attack_bonus` remains the authoritative compatibility column used by existing Weapon Upgrade behavior;
- extended template metadata is stored inside the existing serialized `effect_json` envelope;
- `SQLiteEquipmentRepository` hydrates that data back into canonical loadout fields;
- legacy persisted items without that metadata default to zero extra stats, Level 1, Area 1, and their existing single `effect_code`.

The automatic battle and activity-cooldown policies read the hydrated `effectCodes` list, so multiple extended effects are executable only through existing allowlisted domain catalogs. Arc content still cannot provide custom code, callbacks, formulas, or arbitrary mechanics.

## Legacy compatibility

Existing Arc Manifest v1 weapon templates remain accepted. They continue to mean:

- Weapon slot;
- Level 1;
- Area 1;
- legacy `attackBonus`;
- Common through Legendary rarity;
- their historical primary effect at `effects[0]`.

Legacy effect arrays remain structurally accepted up to the prior v1 schema limit, but M7-01 does not activate their additional entries. That prevents publishing this milestone from silently making an old generated item stronger. Validation emits a migration warning so new authoring can move to the extended shape without invalidating already bundled/published manifests.

## Deliberate deferrals

- M7-02 owns Arc/Town Shop stock definitions and consumption.
- M7-03 owns the canonical Sell transaction.
- Full Arc vNext referential world packaging remains M10-01.
- This milestone does not add a new player screen, currency, crafting resource, or browser-owned equipment rule.

## Verification

`test/arc-equipment-template.test.js` proves canonical vocabulary, budget enforcement, rejection of partial/executable-looking templates, legacy compatibility, runtime reward materialization, SQLite loadout reconstruction, derived-stat contribution, multiple allowlisted effects, and world-context authoring guidance. `test/arc-equipment-legacy-compat.test.js` locks the historical first-effect-only behavior for legacy templates, while `test/activity-cooldown-policy.test.js` proves secondary extended effects are visible to authoritative cooldown policy.

The existing Arc Workshop Playwright path uses `examples/arc-manifest.example.json`; that example now uses the extended equipment shape, so the full E2E gate validates, publishes, earns, and inspects an extended Arc-generated item through the real player journey.

## Handoff

After M7-01 is merged and green on `main`, continue M7-02: extend the server-owned Shop catalog to consume validated Arc/Town stock definitions. Preserve this equipment-template validation boundary rather than allowing Shop/browser code to reinterpret generated item mechanics.
