export const RUN_UPGRADE_OFFER_VERSION = 2;
export const RUN_UPGRADE_OFFER_SIZE = 3;

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
  const effectParts = Array.isArray(upgrade.effectSummary) ? [...upgrade.effectSummary] : [];
  if (!effectParts.length) {
    if (Number(upgrade.attackBonus || 0) > 0) effectParts.push(`+${upgrade.attackBonus} Attack`);
    if (Number(upgrade.heal || 0) > 0) effectParts.push(`+${upgrade.heal} HP now`);
    if (upgrade.reactionStyle === 'guard') effectParts.push('Guard → +3 next damage');
    if (upgrade.reactionStyle === 'interrupt') effectParts.push('Interrupt → +4 next damage');
  }
  return {
    ...upgrade,
    category: upgrade.category || 'TECHNIQUE',
    description: upgrade.description || effectParts.join(' · ') || 'Temporary run power.',
    accent: upgrade.accent || 'special',
    effectSummary: effectParts,
  };
}

function rotatingPick(items, { runId, version, category, draftIndex }) {
  if (!items.length) return null;
  const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
  const start = stableHash(`${runId}:${version}:${category}`) % ordered.length;
  return ordered[(start + draftIndex) % ordered.length] || null;
}

export function offeredRunUpgradeIds(runState, upgrades) {
  const catalog = normalizeCatalog(upgrades);
  if (!runState || catalog.length <= RUN_UPGRADE_OFFER_SIZE) return catalog.map((upgrade) => upgrade.id);

  const validIds = new Set(catalog.map((upgrade) => upgrade.id));
  const snapshotted = Array.isArray(runState.runUpgradeOfferIds)
    ? runState.runUpgradeOfferIds.filter((id) => validIds.has(id))
    : [];
  if (snapshotted.length) return snapshotted.slice(0, RUN_UPGRADE_OFFER_SIZE);

  const version = Number(runState.runUpgradeOfferVersion || RUN_UPGRADE_OFFER_VERSION);
  const draftIndex = Math.max(0, Number(runState.runUpgradeDraftIndex || 0));
  const categories = ['OFFENSE', 'SUSTAIN', 'TECHNIQUE'];
  const chosen = [];

  // One card from each role makes every draft readable at a glance. Within each role the
  // deterministic starting point is run-specific, then later draft moments rotate through
  // the role pool. That guarantees visible build variety without client-side rerolls.
  for (const category of categories) {
    const candidate = rotatingPick(
      catalog.filter((upgrade) => String(upgrade.category || '').toUpperCase() === category),
      { runId: runState.id, version, category, draftIndex },
    );
    if (candidate && !chosen.some((upgrade) => upgrade.id === candidate.id)) chosen.push(candidate);
  }

  if (chosen.length < RUN_UPGRADE_OFFER_SIZE) {
    const remaining = catalog
      .filter((upgrade) => !chosen.some((candidate) => candidate.id === upgrade.id))
      .map((upgrade) => ({ upgrade, score: stableHash(`${runState.id}:${version}:${draftIndex}:fallback:${upgrade.id}`) }))
      .sort((left, right) => left.score - right.score || left.upgrade.id.localeCompare(right.upgrade.id));
    for (const { upgrade } of remaining) {
      chosen.push(upgrade);
      if (chosen.length >= RUN_UPGRADE_OFFER_SIZE) break;
    }
  }
  return chosen.slice(0, RUN_UPGRADE_OFFER_SIZE).map((upgrade) => upgrade.id);
}

export function decorateRunUpgradeOffers(runState, upgrades) {
  const catalog = normalizeCatalog(upgrades).map(enrichRunUpgrade);
  if (runState?.phase !== 'upgrade') return catalog;
  const byId = new Map(catalog.map((upgrade) => [upgrade.id, upgrade]));
  return offeredRunUpgradeIds(runState, catalog).map((id) => byId.get(id)).filter(Boolean);
}
