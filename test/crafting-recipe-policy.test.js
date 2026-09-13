import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRAFTING_RECIPE_LIMITS,
  craftingRecipeAvailability,
  normalizeCraftingRecipe,
  planCraftingConsumption,
} from '../src/domain/CraftingRecipePolicy.js';

function recipe(overrides = {}) {
  return {
    id: 'wolf-leather-boots',
    name: 'Wolf Leather Boots',
    areaNumber: 2,
    ingredients: [
      { itemDefinitionId: 'wolf-pelt', quantity: 2 },
      { itemDefinitionId: 'iron-thread', quantity: 1 },
    ],
    output: { itemDefinitionId: 'wolf-leather-boots-template', quantity: 1 },
    ...overrides,
  };
}

test('crafting recipe is a small immutable item-to-item contract without another currency', () => {
  const normalized = normalizeCraftingRecipe(recipe());
  assert.deepEqual(normalized, {
    id: 'wolf-leather-boots',
    name: 'Wolf Leather Boots',
    areaNumber: 2,
    ingredients: [
      { itemDefinitionId: 'wolf-pelt', quantity: 2 },
      { itemDefinitionId: 'iron-thread', quantity: 1 },
    ],
    output: { itemDefinitionId: 'wolf-leather-boots-template', quantity: 1 },
  });
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.ingredients), true);
  assert.equal('gold' in normalized, false);
  assert.equal('honey' in normalized, false);
  assert.equal('currency' in normalized, false);
});

test('crafting recipe rejects duplicate ingredients, invalid quantities, cycles, and excessive ingredient lists', () => {
  assert.throws(
    () => normalizeCraftingRecipe(recipe({
      ingredients: [
        { itemDefinitionId: 'wolf-pelt', quantity: 1 },
        { itemDefinitionId: 'wolf-pelt', quantity: 1 },
      ],
    })),
    (error) => error.code === 'duplicate_crafting_ingredient',
  );
  assert.throws(
    () => normalizeCraftingRecipe(recipe({ ingredients: [{ itemDefinitionId: 'wolf-pelt', quantity: 0 }] })),
    (error) => error.code === 'invalid_crafting_ingredient_quantity',
  );
  assert.throws(
    () => normalizeCraftingRecipe(recipe({ output: { itemDefinitionId: 'wolf-pelt', quantity: 1 } })),
    (error) => error.code === 'crafting_output_is_ingredient',
  );
  assert.throws(
    () => normalizeCraftingRecipe(recipe({
      ingredients: Array.from({ length: CRAFTING_RECIPE_LIMITS.maxIngredients + 1 }, (_, index) => ({
        itemDefinitionId: `ingredient-${index + 1}`,
        quantity: 1,
      })),
    })),
    (error) => error.code === 'invalid_crafting_ingredients',
  );
});

test('availability counts ordinary persisted item instances by definitionId', () => {
  const items = [
    { id: 'pelt-1', definitionId: 'wolf-pelt' },
    { id: 'pelt-2', definitionId: 'wolf-pelt' },
    { id: 'thread-1', definitionId: 'iron-thread' },
    { id: 'unrelated', definitionId: 'forest-helm' },
  ];
  const availability = craftingRecipeAvailability(recipe(), items);
  assert.equal(availability.craftable, true);
  assert.deepEqual(availability.ingredients.map(({ itemDefinitionId, owned, missing }) => ({ itemDefinitionId, owned, missing })), [
    { itemDefinitionId: 'wolf-pelt', owned: 2, missing: 0 },
    { itemDefinitionId: 'iron-thread', owned: 1, missing: 0 },
  ]);
});

test('consumption plan selects concrete item instances deterministically but performs no mutation', () => {
  const items = [
    { id: 'pelt-oldest', definitionId: 'wolf-pelt' },
    { id: 'pelt-second', definitionId: 'wolf-pelt' },
    { id: 'pelt-spare', definitionId: 'wolf-pelt' },
    { id: 'thread-one', definitionId: 'iron-thread' },
  ];
  const plan = planCraftingConsumption(recipe(), items);
  assert.deepEqual(plan.consumeItemIds, ['pelt-oldest', 'pelt-second', 'thread-one']);
  assert.deepEqual(plan.output, { itemDefinitionId: 'wolf-leather-boots-template', quantity: 1 });
  assert.equal(items.length, 4, 'domain planning must not consume persisted items itself');
});

test('missing ingredients fail with exact item deficits for a future Service/Repository transaction', () => {
  assert.throws(
    () => planCraftingConsumption(recipe(), [{ id: 'pelt-1', definitionId: 'wolf-pelt' }]),
    (error) => {
      assert.equal(error.code, 'crafting_ingredients_missing');
      assert.deepEqual(error.missing, [
        { itemDefinitionId: 'wolf-pelt', missing: 1 },
        { itemDefinitionId: 'iron-thread', missing: 1 },
      ]);
      return true;
    },
  );
});
