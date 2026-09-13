import { CRAFTING_RECIPE_LIMITS } from './CraftingRecipePolicy.js';
import { fightBuffDefinition, normalizeFightCount } from './FightBuffPolicy.js';

const RECIPE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const ITEM_DEFINITION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const RECIPE_FIELDS = new Set(['id', 'name', 'areaNumber', 'ingredients', 'buff']);
const INGREDIENT_FIELDS = new Set(['itemDefinitionId', 'quantity']);
const BUFF_FIELDS = new Set(['code', 'fights']);

function cookingError(code, message, path) {
  const error = new Error(message);
  error.code = code;
  if (path) error.path = path;
  return error;
}

function rejectUnknownFields(value, allowed, { code, label, path = '' }) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw cookingError(code, `${label} does not support field "${field}".`, path ? `${path}.${field}` : field);
  }
}

function stableId(value, { code, label, path, pattern = ITEM_DEFINITION_ID_PATTERN }) {
  const id = String(value || '').trim();
  if (!pattern.test(id)) throw cookingError(code, `${label} must be a stable lowercase id.`, path);
  return id;
}

function normalizeIngredient(entry, index) {
  const path = `ingredients[${index}]`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw cookingError('invalid_cooking_ingredient', 'Cooking ingredients must be objects.', path);
  rejectUnknownFields(entry, INGREDIENT_FIELDS, { code: 'unsupported_cooking_ingredient_field', label: 'Cooking ingredient', path });
  const itemDefinitionId = stableId(entry.itemDefinitionId, {
    code: 'invalid_cooking_ingredient_item',
    label: 'Ingredient itemDefinitionId',
    path: `${path}.itemDefinitionId`,
  });
  if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > CRAFTING_RECIPE_LIMITS.maxQuantityPerIngredient) {
    throw cookingError('invalid_cooking_ingredient_quantity', `Ingredient quantity must be an integer between 1 and ${CRAFTING_RECIPE_LIMITS.maxQuantityPerIngredient}.`, `${path}.quantity`);
  }
  return Object.freeze({ itemDefinitionId, quantity: entry.quantity });
}

function normalizeBuff(buff) {
  if (!buff || typeof buff !== 'object' || Array.isArray(buff)) throw cookingError('invalid_cooking_buff', 'Cooking recipe buff must be an object.', 'buff');
  rejectUnknownFields(buff, BUFF_FIELDS, { code: 'unsupported_cooking_buff_field', label: 'Cooking buff', path: 'buff' });
  let definition;
  try {
    definition = fightBuffDefinition(buff.code);
  } catch (error) {
    throw cookingError('unsupported_cooking_buff_code', error.message, 'buff.code');
  }
  let fights;
  try {
    fights = normalizeFightCount(buff.fights);
  } catch (error) {
    throw cookingError('invalid_cooking_buff_fights', error.message, 'buff.fights');
  }
  return Object.freeze({ code: definition.code, fights });
}

export function normalizeCookingRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw cookingError('invalid_cooking_recipe', 'Cooking recipe must be an object.');
  rejectUnknownFields(recipe, RECIPE_FIELDS, { code: 'unsupported_cooking_recipe_field', label: 'Cooking recipe' });

  const id = stableId(recipe.id, { code: 'invalid_cooking_recipe_id', label: 'Cooking recipe id', path: 'id', pattern: RECIPE_ID_PATTERN });
  const name = String(recipe.name || '').trim();
  if (!name) throw cookingError('invalid_cooking_recipe_name', 'Cooking recipe name is required.', 'name');
  if (!Number.isInteger(recipe.areaNumber) || recipe.areaNumber < 1 || recipe.areaNumber > 100) {
    throw cookingError('invalid_cooking_recipe_area', 'Cooking recipe areaNumber must be an integer between 1 and 100.', 'areaNumber');
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1 || recipe.ingredients.length > CRAFTING_RECIPE_LIMITS.maxIngredients) {
    throw cookingError('invalid_cooking_ingredients', `Cooking recipe must contain between 1 and ${CRAFTING_RECIPE_LIMITS.maxIngredients} item ingredients.`, 'ingredients');
  }

  const ingredients = recipe.ingredients.map(normalizeIngredient);
  const ids = ingredients.map((ingredient) => ingredient.itemDefinitionId);
  if (new Set(ids).size !== ids.length) throw cookingError('duplicate_cooking_ingredient', 'A cooking recipe must list each itemDefinitionId only once.', 'ingredients');

  return Object.freeze({
    id,
    name,
    areaNumber: recipe.areaNumber,
    ingredients: Object.freeze(ingredients),
    buff: normalizeBuff(recipe.buff),
  });
}

function ingredientItems(items, itemDefinitionId) {
  return (Array.isArray(items) ? items : []).filter((item) => (
    item
    && typeof item === 'object'
    && String(item.id || '').trim()
    && String(item.definitionId || '').trim() === itemDefinitionId
  ));
}

export function cookingRecipeAvailability(recipe, items) {
  const normalized = normalizeCookingRecipe(recipe);
  const ingredients = normalized.ingredients.map((ingredient) => {
    const owned = ingredientItems(items, ingredient.itemDefinitionId).length;
    return Object.freeze({ ...ingredient, owned, missing: Math.max(0, ingredient.quantity - owned) });
  });
  return Object.freeze({
    recipe: normalized,
    cookable: ingredients.every((ingredient) => ingredient.missing === 0),
    ingredients: Object.freeze(ingredients),
  });
}

export function planCookingConsumption(recipe, items) {
  const availability = cookingRecipeAvailability(recipe, items);
  if (!availability.cookable) {
    const error = cookingError('cooking_ingredients_missing', 'Required cooking items are missing.', 'ingredients');
    error.missing = availability.ingredients
      .filter((ingredient) => ingredient.missing > 0)
      .map(({ itemDefinitionId, missing }) => ({ itemDefinitionId, missing }));
    throw error;
  }

  const consumeItemIds = [];
  for (const ingredient of availability.recipe.ingredients) {
    consumeItemIds.push(...ingredientItems(items, ingredient.itemDefinitionId).slice(0, ingredient.quantity).map((item) => item.id));
  }

  return Object.freeze({
    recipeId: availability.recipe.id,
    areaNumber: availability.recipe.areaNumber,
    consumeItemIds: Object.freeze(consumeItemIds),
    buff: availability.recipe.buff,
  });
}
