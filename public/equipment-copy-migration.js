// Presentation-only strangler adapter for M1-02.
// Legacy routes, CSS hooks, stream history, and persisted item metadata may still use
// Relic/Temper/Gear names. New player-facing game copy uses Inventory/Equipment/Upgrade.

function migrateEquipmentText(value) {
  let copy = String(value || '')
    .replace(/\bRelic pouch\b/g, 'Inventory')
    .replace(/\brelic pouch\b/g, 'inventory')
    .replace(/\bOpen Gear\b/g, 'Open Inventory')
    .replace(/\ba relic\b/g, 'an item')
    .replace(/\bthis relic\b/g, 'this item')
    .replace(/\bTempering\b/g, 'upgrading')
    .replace(/\bTemper\b/g, 'Upgrade')
    .replace(/\bTempered (?=.+? to \d+\/\d+)/g, 'Upgraded ');

  // Navigation/card labels can be exactly "Gear". Do not replace ordinary lower-case
  // "gear" in prose because it is already clear player language.
  copy = copy.replace(/^(\s*)Gear(\s*)$/, '$1Inventory$2');
  return copy;
}

export function migrateLegacyEquipmentCopy(root = document.body) {
  if (!root || !globalThis.NodeFilter) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    const protectedCopy = parent?.closest('.stream-entry-chat, script, style, textarea');
    if (!protectedCopy) {
      const next = migrateEquipmentText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

if (globalThis.document) {
  const refresh = () => migrateLegacyEquipmentCopy(document.body);
  const observer = new MutationObserver(refresh);
  const start = () => {
    refresh();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
