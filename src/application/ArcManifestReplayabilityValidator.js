const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const EVENT_EFFECT_BUDGETS = Object.freeze({
  healAll: Object.freeze({ min: 0, max: 40 }),
  damageAll: Object.freeze({ min: 0, max: 30 }),
  focusAll: Object.freeze({ min: -4, max: 4 }),
  runAttackBonus: Object.freeze({ min: 0, max: 5 }),
});

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }

function manifestOwnedIds(manifest) {
  const ids = new Set();
  const add = (value) => { if (text(value)) ids.add(value); };
  add(manifest.arc?.id);
  for (const key of ['lore', 'enemies', 'bosses', 'dungeons', 'itemPools', 'achievements', 'historicalConsequences']) {
    for (const entry of manifest[key] || []) add(entry?.id);
  }
  for (const pool of manifest.itemPools || []) for (const item of pool?.items || []) add(item?.id);
  return ids;
}

export class ArcManifestReplayabilityValidator {
  validate(manifest) {
    const errors = [];
    const warnings = [];
    const addError = (path, code, message) => errors.push({ path, code, message });
    const addWarning = (path, code, message) => warnings.push({ path, code, message });
    if (!object(manifest)) return { valid: true, errors, warnings };

    const knownEnemyIds = new Set((manifest.enemies || []).map((entry) => entry?.id).filter(text));
    const existingIds = manifestOwnedIds(manifest);
    const runEventIds = new Set();

    for (const [kind, entries] of [['enemies', manifest.enemies || []], ['bosses', manifest.bosses || []]]) {
      entries.forEach((entry, index) => {
        if (entry?.intentCadence === undefined) return;
        if (!Number.isInteger(entry.intentCadence) || entry.intentCadence < 1 || entry.intentCadence > 6) {
          addError(`${kind}[${index}].intentCadence`, 'invalid_intent_cadence', 'intentCadence must be an integer between 1 and 6.');
        }
      });
    }

    if (manifest.runEvents !== undefined && !Array.isArray(manifest.runEvents)) {
      addError('runEvents', 'run_events_array_required', 'runEvents must be an array when provided.');
    }

    for (const [eventIndex, event] of (manifest.runEvents || []).entries()) {
      const path = `runEvents[${eventIndex}]`;
      if (!object(event)) {
        addError(path, 'invalid_run_event', 'Run event must be an object.');
        continue;
      }
      if (!text(event.id) || !ID_PATTERN.test(event.id)) addError(`${path}.id`, 'invalid_id', 'Run event IDs must use the Arc Manifest ID format.');
      else {
        if (existingIds.has(event.id)) addError(`${path}.id`, 'duplicate_manifest_id', `Run event ID "${event.id}" collides with another manifest entity.`);
        if (runEventIds.has(event.id)) addError(`${path}.id`, 'duplicate_run_event_id', `Run event ID "${event.id}" is duplicated.`);
        runEventIds.add(event.id);
      }
      if (!text(event.name)) addError(`${path}.name`, 'name_required', 'Run event name is required.');
      if (!text(event.prompt)) addError(`${path}.prompt`, 'prompt_required', 'Run event prompt is required.');
      if (!Array.isArray(event.choices) || event.choices.length < 2 || event.choices.length > 4) {
        addError(`${path}.choices`, 'invalid_run_event_choices', 'Run events require between 2 and 4 choices.');
        continue;
      }
      const choiceIds = new Set();
      event.choices.forEach((choice, choiceIndex) => {
        const choicePath = `${path}.choices[${choiceIndex}]`;
        if (!object(choice)) return addError(choicePath, 'invalid_run_event_choice', 'Run event choice must be an object.');
        if (!text(choice.id) || !ID_PATTERN.test(choice.id)) addError(`${choicePath}.id`, 'invalid_id', 'Choice IDs must use the Arc Manifest ID format.');
        else if (choiceIds.has(choice.id)) addError(`${choicePath}.id`, 'duplicate_choice_id', `Choice ID "${choice.id}" is duplicated within this event.`);
        else choiceIds.add(choice.id);
        if (!text(choice.name)) addError(`${choicePath}.name`, 'name_required', 'Choice name is required.');
        if (!text(choice.summary)) addError(`${choicePath}.summary`, 'summary_required', 'Choice summary is required.');
        if (!object(choice.effects)) return addError(`${choicePath}.effects`, 'effects_object_required', 'Choice effects must be an object.');
        const keys = Object.keys(choice.effects);
        if (keys.length === 0) addWarning(`${choicePath}.effects`, 'empty_choice_effects', 'This choice has no gameplay effect.');
        for (const key of keys) {
          const budget = EVENT_EFFECT_BUDGETS[key];
          if (!budget) {
            addError(`${choicePath}.effects.${key}`, 'unsupported_run_event_effect', `Unsupported run event effect "${key}".`);
            continue;
          }
          const value = choice.effects[key];
          if (!Number.isInteger(value) || value < budget.min || value > budget.max) {
            addError(`${choicePath}.effects.${key}`, 'run_event_effect_budget', `${key} must be an integer between ${budget.min} and ${budget.max}.`);
          }
        }
      });
    }

    for (const [dungeonIndex, dungeon] of (manifest.dungeons || []).entries()) {
      const path = `dungeons[${dungeonIndex}]`;
      const variants = dungeon?.encounterVariants;
      if (variants !== undefined && !Array.isArray(variants)) {
        addError(`${path}.encounterVariants`, 'encounter_variants_array_required', 'encounterVariants must be an array when provided.');
      }
      for (const [variantIndex, sequence] of (Array.isArray(variants) ? variants : []).entries()) {
        const variantPath = `${path}.encounterVariants[${variantIndex}]`;
        if (!Array.isArray(sequence) || sequence.length < 1 || sequence.length > 12) {
          addError(variantPath, 'invalid_encounter_variant', 'Each encounter variant must contain between 1 and 12 enemy IDs.');
          continue;
        }
        sequence.forEach((enemyId, enemyIndex) => {
          if (!knownEnemyIds.has(enemyId)) addError(`${variantPath}[${enemyIndex}]`, 'unknown_enemy_reference', `Unknown enemy ID "${enemyId}".`);
        });
      }

      const schedule = dungeon?.runEventSchedule;
      if (schedule === undefined) continue;
      if (!object(schedule)) {
        addError(`${path}.runEventSchedule`, 'invalid_run_event_schedule', 'runEventSchedule must be an object.');
        continue;
      }
      const sequenceLengths = [dungeon.encounters, ...(Array.isArray(variants) ? variants : [])]
        .filter(Array.isArray)
        .map((sequence) => sequence.length);
      const minimumLength = sequenceLengths.length ? Math.min(...sequenceLengths) : 0;
      if (!Number.isInteger(schedule.afterEncounterIndex) || schedule.afterEncounterIndex < 0 || schedule.afterEncounterIndex >= Math.max(0, minimumLength - 1)) {
        addError(`${path}.runEventSchedule.afterEncounterIndex`, 'invalid_run_event_position', 'Run events must occur after an encounter that is followed by another normal encounter in every variant.');
      }
      if (!Array.isArray(schedule.eventIds) || schedule.eventIds.length < 1 || schedule.eventIds.length > 8) {
        addError(`${path}.runEventSchedule.eventIds`, 'invalid_run_event_references', 'runEventSchedule.eventIds must contain between 1 and 8 run event IDs.');
      } else {
        schedule.eventIds.forEach((eventId, eventIndex) => {
          if (!runEventIds.has(eventId)) addError(`${path}.runEventSchedule.eventIds[${eventIndex}]`, 'unknown_run_event_reference', `Unknown run event ID "${eventId}".`);
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
