// Presentation-only strangler adapter for M1-01.
// Persisted/API compatibility may still say Thread Dust while the player-facing product
// uses Gold. Remove this adapter after all producing projections have migrated.

const LEGACY_CURRENCY_PATTERNS = [
  [/\bThread Dust\b/g, 'Gold'],
  [/([+−-]?\d+(?:\.\d+)?)\s+Dust\b/g, '$1 Gold'],
];

function migrateText(value) {
  return LEGACY_CURRENCY_PATTERNS.reduce((copy, [pattern, replacement]) => copy.replace(pattern, replacement), String(value || ''));
}

export function migrateLegacyCurrencyCopy(root) {
  if (!root || !globalThis.NodeFilter) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    // Never rewrite user-authored chat. This adapter only migrates game/system copy.
    if (!node.parentElement?.closest('.stream-entry-chat')) {
      const next = migrateText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

if (globalThis.document) {
  const refresh = () => {
    migrateLegacyCurrencyCopy(document.querySelector('#stream'));
    migrateLegacyCurrencyCopy(document.querySelector('#inventory'));
  };
  const observer = new MutationObserver(refresh);
  const start = () => {
    refresh();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
