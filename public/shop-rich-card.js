function openInventoryFromShop() {
  const input = document.querySelector('[data-testid="stream-message"]');
  const form = document.querySelector('[data-testid="stream-composer"]');
  if (!input || !form) return;
  input.value = 'inventory';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  form.requestSubmit();
}

function installStyles(documentRef = document) {
  if (documentRef.querySelector('[data-shop-rich-card-styles]')) return;
  const style = documentRef.createElement('style');
  style.dataset.shopRichCardStyles = 'true';
  style.textContent = `
    [data-shop-rich-card="true"] .thread-shop-shelf { display:grid; gap:9px; }
    [data-shop-rich-card="true"] .thread-shop-offer { display:grid; grid-template-columns:52px minmax(0,1fr); gap:9px; align-items:center; }
    [data-shop-rich-card="true"] .thread-shop-offer .thread-shop-buy { grid-column:1 / -1; width:100%; min-height:44px; }
    [data-shop-rich-card="true"] .thread-shop-offer[data-affordable="false"] { opacity:.72; }
    [data-shop-rich-card="true"] .shop-rich-card-footer { display:grid; gap:6px; }
    [data-shop-rich-card="true"] .shop-rich-card-footer button { width:100%; min-height:44px; }
    [data-shop-rich-card="true"] .shop-rich-card-note { margin:0; color:var(--muted); font-size:.68rem; line-height:1.4; }
    @media (min-width:540px) {
      [data-shop-rich-card="true"] .thread-shop-offer { grid-template-columns:56px minmax(0,1fr) auto; }
      [data-shop-rich-card="true"] .thread-shop-offer .thread-shop-buy { grid-column:auto; width:auto; min-width:128px; }
    }
  `;
  documentRef.head.append(style);
}

function explicitCommand(card) {
  const kicker = card?.querySelector('.thread-reply-header span')?.textContent || '';
  const match = kicker.match(/\/(shop|inventory|gear)\b/i);
  return match?.[1]?.toLowerCase() || null;
}

function isShopCard(card) {
  if (!card || card.hidden) return false;
  const command = explicitCommand(card);
  if (command) return command === 'shop';
  if (card.querySelector('.inventory-rich-layout')) return false;
  if (card.querySelector('.thread-shop-shelf, .thread-shop-vendor')) return true;
  return card.dataset.richCardKind === 'shop' && card.dataset.inventoryRichCard !== 'true';
}

function enhanceShopCard(card, { documentRef = document } = {}) {
  if (!isShopCard(card)) return;

  delete card.dataset.inventoryRichCard;
  card.dataset.shopRichCard = 'true';
  card.dataset.richCardKind = 'shop';
  card.setAttribute('aria-label', 'Shop panel');
  const headerTitle = card.querySelector('.thread-reply-header strong');
  if (headerTitle?.textContent.includes('field shop')) headerTitle.textContent = headerTitle.textContent.replace('field shop', 'Shop');

  for (const offer of card.querySelectorAll('.thread-shop-offer')) {
    offer.dataset.testid = 'shop-offer';
    const buy = offer.querySelector('.thread-shop-buy');
    if (!buy) continue;
    offer.dataset.affordable = String(!buy.disabled);
    buy.dataset.shopBuy = 'true';
    if (/\bDust\b/.test(buy.textContent)) buy.textContent = buy.textContent.replace(/\bDust\b/g, 'Gold');
  }

  if (!card.querySelector('[data-testid="stream-shop-sell-equipment"]')) {
    const footer = documentRef.createElement('div');
    footer.className = 'shop-rich-card-footer rich-chat-card-actions';
    footer.dataset.shopRichCardOwned = 'true';
    const sell = documentRef.createElement('button');
    sell.type = 'button';
    sell.dataset.testid = 'stream-shop-sell-equipment';
    sell.dataset.richCardAction = 'true';
    sell.className = 'rich-chat-card-action';
    sell.textContent = 'Sell equipment';
    sell.addEventListener('click', openInventoryFromShop);
    const note = documentRef.createElement('p');
    note.className = 'shop-rich-card-note';
    note.textContent = 'Selling uses your Inventory so equipped-state and protected-item rules stay authoritative.';
    footer.append(sell, note);
    card.append(footer);
  }
}

export function installShopRichCard({ documentRef = document } = {}) {
  const stream = documentRef.querySelector('#stream');
  if (!stream) return () => {};
  installStyles(documentRef);
  let scheduled = false;
  const decorate = () => {
    scheduled = false;
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    enhanceShopCard(card, { documentRef });
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(decorate);
  };
  const observer = new MutationObserver((mutations) => {
    const ownedOnly = mutations.length > 0 && mutations.every((mutation) => {
      const changed = [...mutation.addedNodes, ...mutation.removedNodes];
      return changed.length > 0 && changed.every((node) => node.nodeType === Node.ELEMENT_NODE && node.dataset?.shopRichCardOwned === 'true');
    });
    if (!ownedOnly) schedule();
  });
  observer.observe(stream, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  schedule();
  return () => observer.disconnect();
}

if (typeof document !== 'undefined') {
  const uninstall = installShopRichCard();
  window.addEventListener('beforeunload', uninstall, { once: true });
}
