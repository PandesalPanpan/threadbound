import './equipment-copy-migration.js';
import './rarity-presentation.js';

// Presentation-only strangler adapter for M1-01.
// Persisted/API compatibility may still say Thread Dust while the player-facing product
// uses Gold. Remove this adapter after all producing projections have migrated.

const LEGACY_CURRENCY_PATTERNS = [
  [/\bThread Dust\b/g, 'Gold'],
  [/([+−-]?\d+(?:\.\d+)?)\s+Dust\b/g, '$1 Gold'],
  [/\bDust\b/g, 'Gold'],
];

function migrateText(value) {
  return LEGACY_CURRENCY_PATTERNS.reduce((copy, [pattern, replacement]) => copy.replace(pattern, replacement), String(value || ''));
}

export function migrateLegacyCurrencyCopy(root = document.body) {
  if (!root || !globalThis.NodeFilter) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    const protectedCopy = parent?.closest('.stream-entry-chat, script, style, textarea');
    // Never rewrite user-authored chat or executable/style source. This adapter only
    // migrates Threadbound-owned presentation copy while legacy producers remain.
    if (!protectedCopy) {
      const next = migrateText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

if (globalThis.document) {
  const refresh = () => migrateLegacyCurrencyCopy(document.body);
  const observer = new MutationObserver(refresh);
  const start = () => {
    refresh();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
