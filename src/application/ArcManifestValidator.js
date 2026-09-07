import { DUNGEONS } from '../domain/DungeonRun.js';
import { ITEM_EFFECTS } from '../domain/ItemGenerator.js';
import { ACHIEVEMENTS } from './AchievementProjector.js';
import { allCanonicalNarrativeEntries } from '../content/CanonicalContent.js';

export const MANIFEST_VERSION = 1;
export const ALLOWED_ENEMY_ABILITIES = Object.freeze(['basic_retaliation']);
export const BALANCE_BUDGETS = Object.freeze({
  enemyBaseHp: Object.freeze({ min: 1, max: 200 }),
  enemyRetaliation: Object.freeze({ min: 0, max: 30 }),
  bossBaseHp: Object.freeze({ min: 1, max: 1000 }),
  bossRetaliation: Object.freeze({ min: 0, max: 75 }),
  itemAttackBonus: Object.freeze({ min: 0, max: 10 }),
  maxDungeonEncounters: 12,
});

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const ACHIEVEMENT_EVENTS = new Set(['enemy_defeated', 'boss_defeated', 'dungeon_completed', 'item_generated', 'player_revived']);
const HISTORY_TRIGGERS = new Set(['arc_started', 'arc_completed', 'threshold_reached']);
const PROGRESSION_METRICS = new Set(['dungeon_clears', 'boss_kills', 'enemy_kills']);
const RARITIES = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);

function canonicalIds() {
  const ids = new Set(allCanonicalNarrativeEntries().map((entry) => entry.id));
  for (const dungeon of Object.values(DUNGEONS)) {
    ids.add(dungeon.id);
    for (const enemy of dungeon.encounters) ids.add(enemy.id);
    ids.add(dungeon.boss.id);
  }
  for (const achievement of Object.values(ACHIEVEMENTS)) ids.add(achievement.id);
  return ids;
}

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function integer(value) { return Number.isInteger(value); }
function pathJoin(path, key) { return path ? `${path}.${key}` : key; }

export class ArcManifestValidator {
  validate(manifest) {
    const errors = [];
    const warnings = [];
    const addError = (path, code, message) => errors.push({ path, code, message });
    const addWarning = (path, code, message) => warnings.push({ path, code, message });

    if (!object(manifest)) {
      addError('', 'manifest_not_object', 'Arc Manifest must be a JSON object.');
      return { valid: false, errors, warnings };
    }
    if (manifest.manifestVersion !== MANIFEST_VERSION) addError('manifestVersion', 'unsupported_manifest_version', `manifestVersion must be ${MANIFEST_VERSION}.`);

    const arc = manifest.arc;
    if (!object(arc)) addError('arc', 'arc_required', 'arc must be an object.');
    else {
      this.#id(arc.id, 'arc.id', addError);
      if (!text(arc.title)) addError('arc.title', 'title_required', 'Arc title is required.');
      if (!text(arc.premise)) addError('arc.premise', 'premise_required', 'Arc premise is required.');
      if (!object(arc.progression)) addError('arc.progression', 'progression_required', 'Arc progression is required.');
      else {
        if (!PROGRESSION_METRICS.has(arc.progression.metric)) addError('arc.progression.metric', 'unsupported_progression_metric', 'Unsupported progression metric.');
        if (!integer(arc.progression.target) || arc.progression.target < 1 || arc.progression.target > 100000000) addError('arc.progression.target', 'invalid_progression_target', 'Progression target must be an integer between 1 and 100,000,000.');
        else if (arc.progression.target > 1000000) addWarning('arc.progression.target', 'very_large_progression_target', 'This target may make the arc feel effectively permanent.');
      }
    }

    const requiredArrays = ['lore', 'enemies', 'bosses', 'dungeons', 'itemPools', 'achievements', 'historicalConsequences'];
    for (const key of requiredArrays) if (!Array.isArray(manifest[key])) addError(key, 'array_required', `${key} must be an array.`);
    if (errors.some((entry) => entry.code === 'array_required')) return { valid: false, errors, warnings };
    if (manifest.dungeons.length < 1) addError('dungeons', 'dungeon_required', 'An arc must contain at least one dungeon.');

    const protectedIds = canonicalIds();
    const seen = new Map();
    const registerId = (id, path) => {
      this.#id(id, path, addError);
      if (!text(id)) return;
      if (protectedIds.has(id)) addError(path, 'canonical_id_collision', `ID "${id}" is owned by canonical Threadbound content.`);
      if (seen.has(id)) addError(path, 'duplicate_manifest_id', `ID "${id}" is already used at ${seen.get(id)}.`);
      else seen.set(id, path);
    };

    if (text(arc?.id)) registerId(arc.id, 'arc.id');

    manifest.lore.forEach((entry, index) => {
      const path = `lore[${index}]`;
      if (!object(entry)) return addError(path, 'invalid_lore_entry', 'Lore entry must be an object.');
      registerId(entry.id, `${path}.id`);
      for (const field of ['title', 'summary', 'body']) if (!text(entry[field])) addError(`${path}.${field}`, 'text_required', `${field} is required.`);
      this.#tags(entry.tags, `${path}.tags`, addError);
    });

    const enemyIds = new Set();
    manifest.enemies.forEach((entry, index) => {
      const path = `enemies[${index}]`;
      if (!object(entry)) return addError(path, 'invalid_enemy', 'Enemy must be an object.');
      registerId(entry.id, `${path}.id`);
      if (text(entry.id)) enemyIds.add(entry.id);
      if (!text(entry.name)) addError(`${path}.name`, 'name_required', 'Enemy name is required.');
      this.#range(entry.baseHp, BALANCE_BUDGETS.enemyBaseHp, `${path}.baseHp`, 'enemy_hp_budget', addError);
      this.#range(entry.retaliation, BALANCE_BUDGETS.enemyRetaliation, `${path}.retaliation`, 'enemy_retaliation_budget', addError);
      this.#abilities(entry.abilities, `${path}.abilities`, addError);
    });

    const bossIds = new Set();
    manifest.bosses.forEach((entry, index) => {
      const path = `bosses[${index}]`;
      if (!object(entry)) return addError(path, 'invalid_boss', 'Boss must be an object.');
      registerId(entry.id, `${path}.id`);
      if (text(entry.id)) bossIds.add(entry.id);
      if (!text(entry.name)) addError(`${path}.name`, 'name_required', 'Boss name is required.');
      this.#range(entry.baseHp, BALANCE_BUDGETS.bossBaseHp, `${path}.baseHp`, 'boss_hp_budget', addError);
      this.#range(entry.retaliation, BALANCE_BUDGETS.bossRetaliation, `${path}.retaliation`, 'boss_retaliation_budget', addError);
      this.#abilities(entry.abilities, `${path}.abilities`, addError);
    });

    const poolIds = new Set();
    manifest.itemPools.forEach((pool, index) => {
      const path = `itemPools[${index}]`;
      if (!object(pool)) return addError(path, 'invalid_item_pool', 'Item pool must be an object.');
      registerId(pool.id, `${path}.id`);
      if (text(pool.id)) poolIds.add(pool.id);
      if (!Array.isArray(pool.items) || pool.items.length < 1) return addError(`${path}.items`, 'item_pool_empty', 'Item pool must contain at least one item template.');
      pool.items.forEach((item, itemIndex) => {
        const itemPath = `${path}.items[${itemIndex}]`;
        if (!object(item)) return addError(itemPath, 'invalid_item_template', 'Item template must be an object.');
        registerId(item.id, `${itemPath}.id`);
        if (!text(item.namePattern)) addError(`${itemPath}.namePattern`, 'name_pattern_required', 'namePattern is required.');
        if (!RARITIES.has(item.rarity)) addError(`${itemPath}.rarity`, 'invalid_rarity', 'Unsupported rarity.');
        this.#range(item.attackBonus, BALANCE_BUDGETS.itemAttackBonus, `${itemPath}.attackBonus`, 'item_attack_budget', addError);
        if (!Array.isArray(item.effects)) addError(`${itemPath}.effects`, 'effects_array_required', 'effects must be an array.');
        else for (const [effectIndex, effect] of item.effects.entries()) if (!Object.hasOwn(ITEM_EFFECTS, effect)) addError(`${itemPath}.effects[${effectIndex}]`, 'unsupported_item_effect', `Unsupported item effect "${effect}".`);
      });
    });

    manifest.dungeons.forEach((entry, index) => {
      const path = `dungeons[${index}]`;
      if (!object(entry)) return addError(path, 'invalid_dungeon', 'Dungeon must be an object.');
      registerId(entry.id, `${path}.id`);
      if (!text(entry.name)) addError(`${path}.name`, 'name_required', 'Dungeon name is required.');
      if (!integer(entry.recommendedPlayers) || entry.recommendedPlayers < 1 || entry.recommendedPlayers > 4) addError(`${path}.recommendedPlayers`, 'invalid_recommended_players', 'recommendedPlayers must be 1–4.');
      if (!Array.isArray(entry.encounters) || entry.encounters.length < 1) addError(`${path}.encounters`, 'encounters_required', 'Dungeon must contain encounters.');
      else {
        if (entry.encounters.length > BALANCE_BUDGETS.maxDungeonEncounters) addError(`${path}.encounters`, 'too_many_encounters', `A dungeon may contain at most ${BALANCE_BUDGETS.maxDungeonEncounters} encounters.`);
        entry.encounters.forEach((enemyId, encounterIndex) => { if (!enemyIds.has(enemyId)) addError(`${path}.encounters[${encounterIndex}]`, 'unknown_enemy_reference', `Unknown enemy ID "${enemyId}".`); });
      }
      if (!bossIds.has(entry.bossId)) addError(`${path}.bossId`, 'unknown_boss_reference', `Unknown boss ID "${entry.bossId}".`);
      if (!poolIds.has(entry.rewardPoolId)) addError(`${path}.rewardPoolId`, 'unknown_reward_pool_reference', `Unknown reward pool ID "${entry.rewardPoolId}".`);
    });

    manifest.achievements.forEach((entry, index) => {
      const path = `achievements[${index}]`;
      if (!object(entry)) return addError(path, 'invalid_achievement', 'Achievement must be an object.');
      registerId(entry.id, `${path}.id`);
      if (!text(entry.title)) addError(`${path}.title`, 'title_required', 'Achievement title is required.');
      if (!text(entry.description)) addError(`${path}.description`, 'description_required', 'Achievement description is required.');
      if (!ACHIEVEMENT_EVENTS.has(entry.event)) addError(`${path}.event`, 'unsupported_achievement_event', 'Unsupported achievement event.');
      if (!integer(entry.threshold) || entry.threshold < 1 || entry.threshold > 100000000) addError(`${path}.threshold`, 'invalid_threshold', 'Achievement threshold must be a positive integer.');
    });

    manifest.historicalConsequences.forEach((entry, index) => {
      const path = `historicalConsequences[${index}]`;
      if (!object(entry)) return addError(path, 'invalid_history_entry', 'Historical consequence must be an object.');
      registerId(entry.id, `${path}.id`);
      if (!HISTORY_TRIGGERS.has(entry.trigger)) addError(`${path}.trigger`, 'unsupported_history_trigger', 'Unsupported historical trigger.');
      if (!text(entry.title)) addError(`${path}.title`, 'title_required', 'History title is required.');
      if (!text(entry.body)) addError(`${path}.body`, 'body_required', 'History body is required.');
    });

    if (manifest.lore.length === 0) addWarning('lore', 'no_lore', 'This arc has no lore entries; the Codex will only show its arc summary.');
    if (manifest.achievements.length === 0) addWarning('achievements', 'no_achievements', 'This arc introduces no achievements.');
    return { valid: errors.length === 0, errors, warnings };
  }

  #id(value, path, addError) {
    if (!text(value) || !ID_PATTERN.test(value)) addError(path, 'invalid_id', 'IDs must be 3–64 lowercase letters, numbers, underscores, or hyphens and begin with a letter/number.');
  }
  #range(value, budget, path, code, addError) {
    if (!integer(value) || value < budget.min || value > budget.max) addError(path, code, `Value must be an integer between ${budget.min} and ${budget.max}.`);
  }
  #abilities(value, path, addError) {
    if (!Array.isArray(value)) return addError(path, 'abilities_array_required', 'abilities must be an array.');
    value.forEach((ability, index) => { if (!ALLOWED_ENEMY_ABILITIES.includes(ability)) addError(`${path}[${index}]`, 'unsupported_enemy_ability', `Unsupported enemy ability "${ability}".`); });
  }
  #tags(value, path, addError) {
    if (value === undefined) return;
    if (!Array.isArray(value)) return addError(path, 'tags_array_required', 'tags must be an array.');
    if (value.some((tag) => !text(tag))) addError(path, 'invalid_tag', 'Tags must be non-empty strings.');
  }
}
