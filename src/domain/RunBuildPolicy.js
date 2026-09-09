import { RUN_UPGRADES } from './RunPowerCatalog.js';

const ARCHETYPE_NAMES = Object.freeze({
  guard: 'Guard / Riposte',
  control: 'Interrupt / Control',
  expose: 'Expose / Crit',
  focus: 'Focus / Skills',
  pressure: 'Pressure',
  sustain: 'Sustain',
});

const MODIFIER_KEYS = Object.freeze([
  'guardCounterBonus',
  'guardFocusBonus',
  'interruptCounterBonus',
  'interruptFocusBonus',
  'exposedDamageBonus',
  'exposedCritChanceBonus',
  'skillFocusRefund',
]);

function selectedDefinitions(selectedUpgradeIds = []) {
  return selectedUpgradeIds
    .map((id) => RUN_UPGRADES[String(id || '')])
    .filter(Boolean);
}

/**
 * Domain Policy / Domain Service for run buildcraft.
 *
 * Selected power IDs are the durable facts on the AdventureRun aggregate. This policy
 * derives their whitelisted mechanical composition without storing executable behavior
 * in manifests, HTTP payloads, or browser code. Both committed combat and previews use
 * DungeonRun, so they consume the exact same derived modifiers.
 */
export function deriveRunBuild(selectedUpgradeIds = []) {
  const selected = selectedDefinitions(selectedUpgradeIds);
  const modifiers = Object.fromEntries(MODIFIER_KEYS.map((key) => [key, 0]));
  const archetypeCounts = new Map();

  for (const power of selected) {
    for (const key of MODIFIER_KEYS) modifiers[key] += Number(power.mechanics?.[key] || 0);
    for (const archetype of power.archetypes || []) {
      archetypeCounts.set(archetype, (archetypeCounts.get(archetype) || 0) + 1);
    }
  }

  const archetypes = [...archetypeCounts.entries()]
    .map(([id, count]) => ({ id, name: ARCHETYPE_NAMES[id] || id, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

  const synergies = [];
  if (modifiers.guardCounterBonus > 0) {
    synergies.push({
      id: 'guard-riposte',
      archetype: 'guard',
      name: 'Riposte Engine',
      description: `Successful Guard adds +${modifiers.guardCounterBonus} extra counter damage${modifiers.guardFocusBonus > 0 ? ` and +${modifiers.guardFocusBonus} extra Focus` : ''}.`,
    });
  }
  if (modifiers.interruptCounterBonus > 0 || modifiers.interruptFocusBonus > 0) {
    synergies.push({
      id: 'interrupt-control',
      archetype: 'control',
      name: 'Control Engine',
      description: `Successful Interrupt adds +${modifiers.interruptCounterBonus} extra next-hit damage${modifiers.interruptFocusBonus > 0 ? ` and +${modifiers.interruptFocusBonus} extra Focus` : ''}.`,
    });
  }
  if (modifiers.exposedDamageBonus > 0 || modifiers.exposedCritChanceBonus > 0) {
    synergies.push({
      id: 'expose-crit',
      archetype: 'expose',
      name: 'Expose Engine',
      description: `Attacks and damage skills against Exposed gain +${modifiers.exposedDamageBonus} damage${modifiers.exposedCritChanceBonus > 0 ? ` and +${Math.round(modifiers.exposedCritChanceBonus * 100)}% crit chance` : ''}.`,
    });
  }
  if (modifiers.skillFocusRefund > 0) {
    synergies.push({
      id: 'focus-skills',
      archetype: 'focus',
      name: 'Focus Loop',
      description: `Damage skills refund ${modifiers.skillFocusRefund} Focus after they connect.`,
    });
  }

  return {
    selected: selected.map((power) => ({
      id: power.id,
      name: power.name,
      category: power.category,
      archetypes: [...(power.archetypes || [])],
      effectSummary: [...(power.effectSummary || [])],
    })),
    archetypes,
    modifiers,
    synergies,
  };
}

export function runBuildModifiers(stateOrIds) {
  const ids = Array.isArray(stateOrIds) ? stateOrIds : stateOrIds?.selectedUpgrades || [];
  return deriveRunBuild(ids).modifiers;
}
