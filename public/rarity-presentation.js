export const RARITY_PRESENTATION = Object.freeze({
  common: Object.freeze({ tier: 1, label: 'Common' }),
  uncommon: Object.freeze({ tier: 2, label: 'Uncommon' }),
  rare: Object.freeze({ tier: 3, label: 'Rare' }),
  epic: Object.freeze({ tier: 4, label: 'Epic' }),
  legendary: Object.freeze({ tier: 5, label: 'Legendary' }),
  mythic: Object.freeze({ tier: 6, label: 'Mythic' }),
});

function rarityId(element) {
  for (const id of Object.keys(RARITY_PRESENTATION)) if (element.classList.contains(`rarity-${id}`)) return id;
  return null;
}

export function decorateRarityPresentation(root = document) {
  for (const element of root.querySelectorAll('[class*="rarity-"]')) {
    const id = rarityId(element);
    if (!id) continue;
    const meta = RARITY_PRESENTATION[id];
    element.dataset.rarity = id;
    element.dataset.rarityTier = String(meta.tier);
    for (const badge of element.querySelectorAll('.rarity-badge')) {
      const current = String(badge.textContent || '');
      badge.textContent = current.match(/(?:Tier|T)\s*\d+/i)
        ? current.replace(/(?:Tier|T)\s*\d+/i, (match) => match.toLowerCase().startsWith('tier') ? `Tier ${meta.tier}` : `T${meta.tier}`)
        : `${meta.label} · T${meta.tier}`;
    }
  }
}

if (globalThis.document) {
  const style = document.createElement('style');
  style.dataset.rarityContract = 'v1';
  style.textContent = `
    :root { --mythic:#ff78e8; }
    .rarity-mythic { --rarity-color:var(--mythic); box-shadow:0 0 30px rgba(255,120,232,.14); }
    .thread-gear-row.rarity-mythic { --rarity-color:var(--mythic); }
    .rarity-mythic .rarity-badge { border-color:color-mix(in srgb,var(--mythic) 54%,transparent); background:color-mix(in srgb,var(--mythic) 12%,transparent); }
  `;
  document.head.append(style);
  document.documentElement.dataset.rarityContract = 'common-uncommon-rare-epic-legendary-mythic';
  const refresh = () => decorateRarityPresentation(document);
  const observer = new MutationObserver(refresh);
  const start = () => {
    refresh();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
