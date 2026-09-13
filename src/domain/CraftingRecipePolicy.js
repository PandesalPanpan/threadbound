const RECIPE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const ITEM_DEFINITION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export const CRAFTING_RECIPE_LIMITS = Object.freeze({
  maxIngredients: 8,
  maxQuantityPerIngredient: 99,
  maxOutputQuantity: 99,
});

function craftingError(code, message, path) {
  const error = new Error(message);
  error.code = code;
  if (path) error.path = path;
  return error;
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stableId(value, { code, label, path, pattern = ITEM_DEFINITION_ID_PATTERN }) {
  const id = String(value || '').trim();
  if (!pattern.test(id)) throw craftingError(code, `${label} must be a stable lowercase item id.`, path);
  return id;
}

function quantity(value, { code, label, path, max }) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw craftingError(code, `${label} must be an integer between 1 and ${max}.`, path);
  }
  return value;
}

function normalizeIngredient(entry, index) {
  const path = `ingredients[${index}]`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw craftingError('invalid_crafting_ingredient', 'Crafting ingredients must be objects.', path);
  }
  return Object.freeze({
    itemDefinitionId: stableId(entry.itemDefinitionId, {
      code: 'invalid_crafting_ingredient_item',
      label: 'Ingredient itemDefinitionId',
      path: `${path}.itemDefinitionId`,
    }),
    quantity: quantity(entry.quantity, {
      code: 'invalid_crafting_ingredient_quantity',
      label: 'Ingredient quantity',
      path: `${path}.quantity`,
      max: CRAFTING_RECIPE_LIMITS.maxQuantityPerIngredient,
    }),
  });
}

function normalizeOutput(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw craftingError('invalid_crafting_output', 'Crafting output must be an object.', 'output');
  }
  return Object.freeze({
    itemDefinitionId: stableId(entry.itemDefinitionId, {
      code: 'invalid_crafting_output_item',
      label: 'Output itemDefinitionId',
      path: 'output.itemDefinitionId',
    }),
    quantity: quantity(entry.quantity ?? 1, {
      code: 'invalid_crafting_output_quantity',
      label: 'Output quantity',
      path: 'output.quantity',
      max: CRAFTING_RECIPE_LIMITS.maxOutputQuantity,
    }),
  });
}

export function normalizeCraftingRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    throw craftingError('invalid_crafting_recipe', 'Crafting recipe must be an object.');
  }

  const id = stableId(recipe.id, {
    code: 'invalid_crafting_recipe_id',
    label: 'Crafting recipe id',
    path: 'id',
    pattern: RECIPE_ID_PATTERN,
  });
  if (!nonEmptyText(recipe.name)) throw craftingError('invalid_crafting_recipe_name', 'Crafting recipe name is required.', 'name');
  if (!Number.isInteger(recipe.areaNumber) || recipe.areaNumber < 1 || recipe.areaNumber > 100) {
    throw craftingError('invalid_crafting_recipe_area', 'Crafting recipe areaNumber must be an integer between 1 and 100.', 'areaNumber');
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1 || recipe.ingredients.length > CRAFTING_RECIPE_LIMITS.maxIngredients) {
    throw craftingError('invalid_crafting_ingredients', `Crafting recipe must contain between 1 and ${CRAFTING_RECIPE_LIMITS.maxIngredients} item ingredients.`, 'ingredients');
  }

  const ingredients = recipe.ingredients.map(normalizeIngredient);
  const ingredientIds = ingredients.map((ingredient) => ingredient.itemDefinitionId);
  if (new Set(ingredientIds).size !== ingredientIds.length) {
    throw craftingError('duplicate_crafting_ingredient', 'A crafting recipe must list each itemDefinitionId only once.', 'ingredients');
  }

  const output = normalizeOutput(recipe.output);
  if (ingredientIds.includes(output.itemDefinitionId)) {
    throw craftingError('crafting_output_is_ingredient', 'Crafting output cannot also be one of its own ingredients.', 'output.itemDefinitionId');
  }

  return Object.freeze({
    id,
    name: recipe.name.trim(),
    areaNumber: recipe.areaNumber,
    ingredients: Object.freeze(ingredients),
    output,
  });
}

function ingredientItems(items, itemDefinitionId) {
  return (Array.isArray(items) ? items : []).filter((item) => (
    item
    && typeof item === 'object'
    && nonEmptyText(item.id)
    && String(item.definitionId || '').trim() === itemDefinitionId
  ));
}

export function craftingRecipeAvailability(recipe, items) {
  const normalized = normalizeCraftingRecipe(recipe);
  const ingredients = normalized.ingredients.map((ingredient) => {
    const owned = ingredientItems(items, ingredient.itemDefinitionId).length;
    return Object.freeze({
      ...ingredient,
      owned,
      missing: Math.max(0, ingredient.quantity - owned),
    });
  });
  return Object.freeze({
    recipe: normalized,
    craftable: ingredients.every((ingredient) => ingredient.missing === 0),
    ingredients: Object.freeze(ingredients),
  });
}

export function planCraftingConsumption(recipe, items) {
  const availability = craftingRecipeAvailability(recipe, items);
  if (!availability.craftable) {
    const error = craftingError('crafting_ingredients_missing', 'Required crafting items are missing.', 'ingredients');
    error.missing = availability.ingredients
      .filter((ingredient) => ingredient.missing > 0)
      .map(({ itemDefinitionId, missing }) => ({ itemDefinitionId, missing }));
    throw error;
  }

  const consumeItemIds = [];
  for (const ingredient of availability.recipe.ingredients) {
    const candidates = ingredientItems(items, ingredient.itemDefinitionId);
    consumeItemIds.push(...candidates.slice(0, ingredient.quantity).map((item) => item.id));
  }

  return Object.freeze({
    recipeId: availability.recipe.id,
    areaNumber: availability.recipe.areaNumber,
    consumeItemIds: Object.freeze(consumeItemIds),
    output: availability.recipe.output,
  });
}
