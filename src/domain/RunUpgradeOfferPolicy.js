export const RUN_UPGRADE_OFFER_VERSION = 1;
export const RUN_UPGRADE_OFFER_SIZE = 3;

const PRESENTATION = Object.freeze({
  sharpen: Object.freeze({
    category: 'OFFENSE',
    description: '+3 Attack for the rest of this run.',
    accent: 'damage',
  }),
  reinforce: Object.freeze({
    category: 'SUSTAIN',
    description: 'Restore 12 HP to every living Weaver before the boss.',
    accent: 'heal',
  }),
  riposte: Object.freeze({
    category: 'REACTION',
    description: 'Restore 4 HP. Successful Guards prime +3 damage on your next strike.',
    accent: 'guard',
  }),
  disrupt: Object.freeze({
    category: 'REACTION',
    description: 'Restore 4 HP. Successful Interrupts prime +4 damage on your next strike.',
    accent: 'special',
  }),
});

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeCatalog(upgrades) {
  return (Array.isArray(upgrades) ? upgrades : Object.values(upgrades || {}))
    .filter((upgrade) => upgrade?.id)
    .map((upgrade) => ({ ...upgrade }));
}

export function enrichRunUpgrade(upgrade) {
  if (!upgrade) return null;
  const presentation = PRESENTATION[upgrade.id] || {};
  const effectParts = [];
  if (Number(upgrade.attackBonus || 0) > 0) effectParts.push(`+${upgrade.attackBonus} Attack`);
  if (Number(upgrade.heal || 0) > 0) effectParts.push(`+${upgrade.heal} HP`);
  if (upgrade.reactionStyle === 'guard') effectParts.push('Guard → +3 next damage');
  if (upgrade.reactionStyle === 'interrupt') effectParts.push('Interrupt → +4 next damage');
  return {
    ...upgrade,
    category: presentation.category || 'POWER',
    description: presentation.description || effectParts.join(' · ') || 'Temporary run power.',
    accent: presentation.accent || 'special',
    effectSummary: effectParts,
  };
}

export function offeredRunUpgradeIds(runState, upgrades) {
  const catalog = normalizeCatalog(upgrades);
  if (!runState || catalog.length <= RUN_UPGRADE_OFFER_SIZE) return catalog.map((upgrade) => upgrade.id);

  const validIds = new Set(catalog.map((upgrade) => upgrade.id));
  const snapshotted = Array.isArray(runState.runUpgradeOfferIds)
    ? runState.runUpgradeOfferIds.filter((id) => validIds.has(id))
    : [];
  if (snapshotted.length) return snapshotted.slice(0, RUN_UPGRADE_OFFER_SIZE);

  // Always give the player one clean offense card and one clean sustain card. The final
  // slot is a run-specific reaction technique, so the draft varies without ever becoming
  // an all-defensive or all-technical dead offer.
  const guaranteedIds = ['sharpen', 'reinforce']
    .filter((id) => validIds.has(id));
  if (!guaranteedIds.length && catalog[0]) guaranteedIds.push(catalog[0].id);
  const version = Number(runState.runUpgradeOfferVersion || RUN_UPGRADE_OFFER_VERSION);
  const remaining = catalog
    .filter((upgrade) => !guaranteedIds.includes(upgrade.id))
    .map((upgrade) => ({
      upgrade,
      score: stableHash(`${runState.id}:${version}:${upgrade.id}`),
    }))
    .sort((left, right) => left.score - right.score || left.upgrade.id.localeCompare(right.upgrade.id))
    .slice(0, Math.max(0, RUN_UPGRADE_OFFER_SIZE - guaranteedIds.length))
    .map(({ upgrade }) => upgrade.id);
  return [...guaranteedIds, ...remaining].slice(0, RUN_UPGRADE_OFFER_SIZE);
}

export function decorateRunUpgradeOffers(runState, upgrades) {
  const catalog = normalizeCatalog(upgrades).map(enrichRunUpgrade);
  if (runState?.phase !== 'upgrade') return catalog;
  const byId = new Map(catalog.map((upgrade) => [upgrade.id, upgrade]));
  return offeredRunUpgradeIds(runState, catalog).map((id) => byId.get(id)).filter(Boolean);
}
