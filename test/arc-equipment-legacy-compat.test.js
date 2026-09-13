import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArcEquipmentTemplate } from '../src/domain/ArcEquipmentTemplatePolicy.js';

test('legacy Arc equipment may retain its v1 effect list but only its historical first effect becomes active', () => {
  const legacy = normalizeArcEquipmentTemplate({
    id: 'legacy-many-effects',
    namePattern: 'Legacy Blade of {suffix}',
    rarity: 'legendary',
    attackBonus: 5,
    effects: ['boss_bane', 'ember_edge', 'frost_edge', 'mind_edge'],
    visualAssetId: 'item.steel-sword.v1',
  });

  assert.equal(legacy.extended, false);
  assert.equal(legacy.slot, 'weapon');
  assert.equal(legacy.requiredLevel, 1);
  assert.equal(legacy.areaNumber, 1);
  assert.deepEqual(legacy.effects, ['boss_bane']);
});
