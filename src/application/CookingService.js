import { normalizeCookingRecipe } from '../domain/CookingRecipePolicy.js';
import { SQLiteCookingRepository } from '../infrastructure/SQLiteCookingRepository.js';

export class CookingService {
  constructor({ repository, eventBus, cookingRepository = null, recipes = [] } = {}) {
    if (!repository) throw new Error('CookingService requires the game repository.');
    if (!eventBus) throw new Error('CookingService requires the event bus.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.cookingRepository = cookingRepository || new SQLiteCookingRepository({ database: repository.db });
    this.recipes = new Map();
    for (const recipe of recipes) {
      const normalized = normalizeCookingRecipe(recipe);
      if (this.recipes.has(normalized.id)) throw new Error(`Duplicate cooking recipe id: ${normalized.id}.`);
      this.recipes.set(normalized.id, normalized);
    }
  }

  recipe(recipeId) {
    return this.recipes.get(String(recipeId || '').trim()) || null;
  }

  cook(playerId, recipeId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    const recipe = this.recipe(recipeId);
    if (!recipe) {
      const error = new Error('Cooking recipe not found.');
      error.code = 'cooking_recipe_not_found';
      throw error;
    }

    const result = this.cookingRepository.cook({ playerId, recipe });
    this.eventBus.publish({
      type: 'FoodCooked',
      playerId,
      recipeId: recipe.id,
      recipeName: recipe.name,
      buffCode: result.buff.code,
      buffName: result.buff.name,
      remainingFights: result.buff.remainingFights,
      consumedItemIds: [...result.consumedItemIds],
    });
    return result;
  }
}
