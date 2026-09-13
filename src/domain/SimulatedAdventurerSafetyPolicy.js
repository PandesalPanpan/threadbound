import { isExtendedArcEquipmentTemplate, normalizeArcEquipmentTemplate } from './ArcEquipmentTemplatePolicy.js';

const SIMULATION_ACTION_FIELDS = Object.freeze([
  'tickKey',
  'scheduledAt',
  'actionType',
  'experienceAward',
]);
const SIMULATION_ACTION_FIELD_SET = new Set(SIMULATION_ACTION_FIELDS);
const SIMULATION_ACTION_TYPES = new Set(['hunt', 'adventure']);

function safetyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw safetyError('simulated_adventurer_unsafe_mutation', `${label} is required.`);
  return text;
}

/**
 * Simulation ticks deliberately have a narrow mutation contract. Unknown reward
 * or target fields fail closed so a future scheduler cannot accidentally turn
 * a bot tick into a Gold/Honey/item grant or a mutation of a human player.
 */
export function assertSafeSimulatedAdventurerSimulationActions(actions = []) {
  if (!Array.isArray(actions)) {
    throw safetyError('simulated_adventurer_unsafe_mutation', 'Simulation actions must be an array.');
  }

  for (const action of actions) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw safetyError('simulated_adventurer_unsafe_mutation', 'Simulation action must be an object.');
    }
    const unexpectedField = Object.keys(action).find((field) => !SIMULATION_ACTION_FIELD_SET.has(field));
    if (unexpectedField) {
      throw safetyError(
        'simulated_adventurer_unsafe_mutation',
        `Simulation action field ${unexpectedField} is not allowed; bot ticks may only mutate their own XP/activity counters.`,
      );
    }

    requiredText(action.tickKey, 'Simulation tick key');
    requiredText(action.scheduledAt, 'Simulation scheduled time');
    if (!SIMULATION_ACTION_TYPES.has(action.actionType)) {
      throw safetyError('simulated_adventurer_unsafe_mutation', `Unsupported simulated action type: ${action.actionType || '(empty)'}.`);
    }
    if (!Number.isInteger(action.experienceAward) || action.experienceAward < 0) {
      throw safetyError('simulated_adventurer_unsafe_mutation', 'Simulation experienceAward must be a non-negative integer.');
    }
  }

  return actions;
}

/** Bots never own an authoritative Honey wallet. Any attempted Honey mutation is invalid. */
export function forbidSimulatedAdventurerHoneyMutation() {
  throw safetyError(
    'simulated_adventurer_honey_forbidden',
    'Simulated adventurers cannot mint, receive, spend, or otherwise mutate Honey.',
  );
}

/**
 * Bot-owned mutations may only target that same simulated adventurer. This is
 * intentionally separate from human player/economy repositories.
 */
export function assertSimulatedAdventurerMutationTarget({ adventurerId, targetId, targetKind }) {
  const actor = requiredText(adventurerId, 'Simulated adventurer id');
  const target = requiredText(targetId, 'Mutation target id');
  if (targetKind !== 'simulated' || target !== actor) {
    throw safetyError(
      'simulated_adventurer_human_economy_forbidden',
      'Simulated adventurers may mutate only their own simulated-adventurer state.',
    );
  }
  return true;
}

/**
 * The only supported construction path for future bot equipment grants. It
 * reuses the same validated Arc equipment vocabulary/budget as human content;
 * arbitrary executable/item-shaped data is rejected rather than persisted.
 */
export function materializeValidatedSimulatedAdventurerEquipment({ template, itemId, name }) {
  if (!template || typeof template !== 'object' || Array.isArray(template) || !isExtendedArcEquipmentTemplate(template)) {
    throw safetyError(
      'simulated_adventurer_invalid_item',
      'Simulated adventurer equipment must come from an extended validated Arc equipment template.',
    );
  }

  let normalized;
  try {
    normalized = normalizeArcEquipmentTemplate(template);
  } catch (error) {
    throw safetyError('simulated_adventurer_invalid_item', `Invalid simulated adventurer equipment template: ${error.message}`);
  }

  const templateId = requiredText(template.id, 'Equipment template id');
  const resolvedItemId = requiredText(itemId, 'Equipment item id');
  const resolvedName = requiredText(name, 'Equipment item name');

  return Object.freeze({
    id: resolvedItemId,
    templateId,
    name: resolvedName,
    slot: normalized.slot,
    rarity: normalized.rarity,
    attackBonus: normalized.stats.attackBonus,
    defenseBonus: normalized.stats.defenseBonus,
    maxHpBonus: normalized.stats.maxHpBonus,
    speedBonus: normalized.stats.speedBonus,
    critChanceBonus: normalized.stats.critChanceBonus,
    effects: Object.freeze([...normalized.effects]),
    requiredLevel: normalized.requiredLevel,
    areaNumber: normalized.areaNumber,
    visualAssetId: template.visualAssetId ?? null,
  });
}

export function publicSimulatedAdventurerSafetyContract() {
  return Object.freeze({
    simulationActionFields: SIMULATION_ACTION_FIELDS,
    simulationActionTypes: Object.freeze([...SIMULATION_ACTION_TYPES]),
    honey: 'forbidden',
    mutationTarget: 'self-simulated-only',
    equipmentSource: 'extended-validated-arc-equipment-template',
  });
}
