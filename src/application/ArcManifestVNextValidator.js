import { normalizeCraftingRecipe } from '../domain/CraftingRecipePolicy.js';
import { normalizeCookingRecipe } from '../domain/CookingRecipePolicy.js';
import { AUTOMATIC_BATTLE_EFFECT_TYPES } from '../domain/AutomaticBattleEffectPolicy.js';
import { normalizeAutomaticBattleResistances } from '../domain/AutomaticBattleResistancePolicy.js';
import { QUEST_OBJECTIVE_TYPES } from '../domain/QuestObjective.js';
import { visualAsset } from '../content/VisualAssetCatalog.js';

export const ARC_MANIFEST_VNEXT_VERSION = 2;
export const ARC_MANIFEST_SUPPORTED_VERSIONS = Object.freeze([1, ARC_MANIFEST_VNEXT_VERSION]);

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const NPC_ROLES = new Set(['shopkeeper', 'blacksmith', 'banker', 'innkeeper', 'healer', 'quest-giver', 'cook', 'crafter', 'guild-hall', 'special']);
const QUEST_TYPES = new Set(QUEST_OBJECTIVE_TYPES);
const REQUIRED_ARRAYS = ['areas', 'towns', 'npcs', 'quests', 'shops', 'craftingRecipes', 'cookingRecipes', 'progressionChallenges'];

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function positiveInteger(value) { return Number.isInteger(value) && value > 0; }

function validateLevelBand(value, path, addError) {
  if (!object(value)) return addError(path, 'level_band_required', 'recommendedLevel must be an object with min and max.');
  if (!positiveInteger(value.min) || !positiveInteger(value.max) || value.max < value.min) {
    addError(path, 'invalid_level_band', 'recommendedLevel min/max must be positive integers with max >= min.');
  }
}

function validateStableId(value, path, addError) {
  if (!text(value) || !ID_PATTERN.test(value)) addError(path, 'invalid_vnext_id', 'ID must be a stable lowercase id using letters, numbers, hyphens, or underscores.');
}

export class ArcManifestVNextValidator {
  validate(manifest) {
    const errors = [];
    const warnings = [];
    const addError = (path, code, message) => errors.push({ path, code, message });

    if (!object(manifest)) return { valid: false, errors: [{ path: '', code: 'manifest_not_object', message: 'Arc Manifest must be a JSON object.' }], warnings };
    if (!ARC_MANIFEST_SUPPORTED_VERSIONS.includes(manifest.manifestVersion)) {
      addError('manifestVersion', 'unsupported_manifest_version', `manifestVersion must be one of ${ARC_MANIFEST_SUPPORTED_VERSIONS.join(', ')}.`);
      return { valid: false, errors, warnings };
    }
    if (manifest.manifestVersion !== ARC_MANIFEST_VNEXT_VERSION) return { valid: true, errors, warnings };

    for (const field of REQUIRED_ARRAYS) {
      if (!Array.isArray(manifest[field])) addError(field, 'vnext_array_required', `${field} must be an array in Arc Manifest vNext.`);
    }
    if (errors.length) return { valid: false, errors, warnings };
    if (manifest.areas.length < 1) addError('areas', 'area_required', 'Arc Manifest vNext must define at least one Area.');

    const ids = new Map();
    const register = (id, path) => {
      validateStableId(id, path, addError);
      if (!text(id)) return;
      if (ids.has(id)) addError(path, 'duplicate_vnext_id', `ID "${id}" is already used at ${ids.get(id)}.`);
      else ids.set(id, path);
    };

    const areaIds = new Set();
    const areaNumbers = new Set();
    manifest.areas.forEach((area, index) => {
      const path = `areas[${index}]`;
      if (!object(area)) return addError(path, 'invalid_area', 'Area must be an object.');
      register(area.id, `${path}.id`);
      if (text(area.id)) areaIds.add(area.id);
      if (!positiveInteger(area.number) || area.number > 100) addError(`${path}.number`, 'invalid_area_number', 'Area number must be an integer between 1 and 100.');
      else if (areaNumbers.has(area.number)) addError(`${path}.number`, 'duplicate_area_number', `Area number ${area.number} is already defined.`);
      else areaNumbers.add(area.number);
      if (!text(area.name)) addError(`${path}.name`, 'area_name_required', 'Area name is required.');
      validateLevelBand(area.recommendedLevel, `${path}.recommendedLevel`, addError);
    });

    const townIds = new Set();
    manifest.towns.forEach((town, index) => {
      const path = `towns[${index}]`;
      if (!object(town)) return addError(path, 'invalid_town', 'Town must be an object.');
      register(town.id, `${path}.id`);
      if (text(town.id)) townIds.add(town.id);
      if (!areaIds.has(town.areaId)) addError(`${path}.areaId`, 'unknown_area_reference', `Unknown Area ID "${town.areaId}".`);
      if (!text(town.name)) addError(`${path}.name`, 'town_name_required', 'Town name is required.');
    });

    const npcIds = new Set();
    manifest.npcs.forEach((npc, index) => {
      const path = `npcs[${index}]`;
      if (!object(npc)) return addError(path, 'invalid_npc', 'NPC must be an object.');
      register(npc.id, `${path}.id`);
      if (text(npc.id)) npcIds.add(npc.id);
      if (!townIds.has(npc.townId)) addError(`${path}.townId`, 'unknown_town_reference', `Unknown Town ID "${npc.townId}".`);
      if (!text(npc.name)) addError(`${path}.name`, 'npc_name_required', 'NPC name is required.');
      if (!NPC_ROLES.has(npc.role)) addError(`${path}.role`, 'unsupported_npc_role', `NPC role must be one of: ${[...NPC_ROLES].join(', ')}.`);
      if (npc.visualAssetId !== undefined && !visualAsset(npc.visualAssetId, 'character')) {
        addError(`${path}.visualAssetId`, 'unknown_visual_asset', 'NPC visualAssetId must reference an allowlisted character asset.');
      }
    });

    const stockIds = new Set((manifest.shopStocks || []).map((stock) => stock?.id).filter(text));
    manifest.shops.forEach((shop, index) => {
      const path = `shops[${index}]`;
      if (!object(shop)) return addError(path, 'invalid_shop', 'Shop must be an object.');
      register(shop.id, `${path}.id`);
      if (!townIds.has(shop.townId)) addError(`${path}.townId`, 'unknown_town_reference', `Unknown Town ID "${shop.townId}".`);
      if (!text(shop.name)) addError(`${path}.name`, 'shop_name_required', 'Shop name is required.');
      if (!stockIds.has(shop.stockId)) addError(`${path}.stockId`, 'unknown_shop_stock_reference', `Unknown shopStocks ID "${shop.stockId}".`);
    });

    manifest.quests.forEach((quest, index) => {
      const path = `quests[${index}]`;
      if (!object(quest)) return addError(path, 'invalid_quest', 'Quest must be an object.');
      register(quest.id, `${path}.id`);
      if (!areaIds.has(quest.areaId)) addError(`${path}.areaId`, 'unknown_area_reference', `Unknown Area ID "${quest.areaId}".`);
      if (!text(quest.title)) addError(`${path}.title`, 'quest_title_required', 'Quest title is required.');
      if (!Array.isArray(quest.objectives) || quest.objectives.length < 1) addError(`${path}.objectives`, 'quest_objectives_required', 'Quest must contain at least one objective.');
      else quest.objectives.forEach((objective, objectiveIndex) => {
        const objectivePath = `${path}.objectives[${objectiveIndex}]`;
        if (!object(objective)) return addError(objectivePath, 'invalid_quest_objective', 'Quest objective must be an object.');
        if (!QUEST_TYPES.has(objective.type)) addError(`${objectivePath}.type`, 'unsupported_quest_objective', `Unsupported Quest objective type "${objective.type}".`);
        if (!positiveInteger(objective.count ?? 1)) addError(`${objectivePath}.count`, 'invalid_quest_objective_count', 'Quest objective count must be a positive integer.');
        if (['visit', 'speak'].includes(objective.type) && !text(objective.targetId)) addError(`${objectivePath}.targetId`, 'quest_target_required', `${objective.type} objectives require targetId.`);
        if (objective.type === 'visit' && text(objective.targetId) && !areaIds.has(objective.targetId) && !townIds.has(objective.targetId)) addError(`${objectivePath}.targetId`, 'unknown_visit_target', `Unknown Area/Town target "${objective.targetId}".`);
        if (objective.type === 'speak' && text(objective.targetId) && !npcIds.has(objective.targetId)) addError(`${objectivePath}.targetId`, 'unknown_npc_reference', `Unknown NPC target "${objective.targetId}".`);
      });
    });

    const knownItemIds = new Set((manifest.itemPools || []).flatMap((pool) => Array.isArray(pool?.items) ? pool.items.map((item) => item?.id) : []).filter(text));
    const validateRecipeItems = (recipe, path) => {
      for (const [ingredientIndex, ingredient] of recipe.ingredients.entries()) {
        if (!knownItemIds.has(ingredient.itemDefinitionId)) addError(`${path}.ingredients[${ingredientIndex}].itemDefinitionId`, 'unknown_recipe_item', `Unknown itemDefinitionId "${ingredient.itemDefinitionId}".`);
      }
    };

    manifest.craftingRecipes.forEach((recipe, index) => {
      const path = `craftingRecipes[${index}]`;
      try {
        const normalized = normalizeCraftingRecipe(recipe);
        register(normalized.id, `${path}.id`);
        if (!areaNumbers.has(normalized.areaNumber)) addError(`${path}.areaNumber`, 'unknown_recipe_area', `No Area uses number ${normalized.areaNumber}.`);
        validateRecipeItems(normalized, path);
        if (!knownItemIds.has(normalized.output.itemDefinitionId)) addError(`${path}.output.itemDefinitionId`, 'unknown_recipe_item', `Unknown output itemDefinitionId "${normalized.output.itemDefinitionId}".`);
      } catch (error) {
        addError(error.path ? `${path}.${error.path}` : path, error.code || 'invalid_crafting_recipe', error.message);
      }
    });

    manifest.cookingRecipes.forEach((recipe, index) => {
      const path = `cookingRecipes[${index}]`;
      try {
        const normalized = normalizeCookingRecipe(recipe);
        register(normalized.id, `${path}.id`);
        if (!areaNumbers.has(normalized.areaNumber)) addError(`${path}.areaNumber`, 'unknown_recipe_area', `No Area uses number ${normalized.areaNumber}.`);
        validateRecipeItems(normalized, path);
      } catch (error) {
        addError(error.path ? `${path}.${error.path}` : path, error.code || 'invalid_cooking_recipe', error.message);
      }
    });

    const dungeonIds = new Set((manifest.dungeons || []).map((entry) => entry?.id).filter(text));
    manifest.progressionChallenges.forEach((challenge, index) => {
      const path = `progressionChallenges[${index}]`;
      if (!object(challenge)) return addError(path, 'invalid_progression_challenge', 'Progression challenge must be an object.');
      register(challenge.id, `${path}.id`);
      if (!areaIds.has(challenge.areaId)) addError(`${path}.areaId`, 'unknown_area_reference', `Unknown Area ID "${challenge.areaId}".`);
      if (challenge.unlocksAreaId !== null && challenge.unlocksAreaId !== undefined && !areaIds.has(challenge.unlocksAreaId)) addError(`${path}.unlocksAreaId`, 'unknown_area_reference', `Unknown unlocked Area ID "${challenge.unlocksAreaId}".`);
      if (!dungeonIds.has(challenge.dungeonId)) addError(`${path}.dungeonId`, 'unknown_dungeon_reference', `Unknown dungeon ID "${challenge.dungeonId}".`);
      if (challenge.requiresBothHumans !== true) addError(`${path}.requiresBothHumans`, 'both_humans_required', 'Progression challenges must require both human players unless a later explicit content rule changes this default.');
      validateLevelBand(challenge.recommendedLevel, `${path}.recommendedLevel`, addError);
    });

    for (const [collectionName, collection] of [['enemies', manifest.enemies || []], ['bosses', manifest.bosses || []]]) {
      collection.forEach((entry, index) => {
        if (entry?.resistances === undefined) return;
        try { normalizeAutomaticBattleResistances(entry.resistances); }
        catch (error) { addError(`${collectionName}[${index}].resistances`, 'invalid_effect_resistance', error.message); }
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

export function publicArcManifestVNextContract() {
  return Object.freeze({
    manifestVersion: ARC_MANIFEST_VNEXT_VERSION,
    supportedVersions: [...ARC_MANIFEST_SUPPORTED_VERSIONS],
    requiredCollections: [...REQUIRED_ARRAYS],
    effectTypes: [...AUTOMATIC_BATTLE_EFFECT_TYPES],
    npcRoles: [...NPC_ROLES],
    questObjectiveTypes: [...QUEST_TYPES],
  });
}
