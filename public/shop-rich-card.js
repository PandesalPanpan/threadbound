const commandCard = document.querySelector('[data-testid="stream-command-card"]');

function openInventoryFromShop() {
  const input = document.querySelector('[data-testid="stream-message"]');
  const form = document.querySelector('[data-testid="stream-composer"]');
  if (!input || !form) return;
  input.value = 'inventory';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  form.requestSubmit();
}

function installStyles() {
  if (document.querySelector('[data-shop-rich-card-styles]')) return;
  const style = document.createElement('style');
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
  document.head.append(style);
}

function enhanceShopCard() {
  if (!commandCard || commandCard.hidden) return;
  const kicker = commandCard.querySelector('.thread-reply-header span')?.textContent || '';
  if (!/\/shop\b/i.test(kicker) && commandCard.dataset.richCardKind !== 'shop') return;

  commandCard.dataset.shopRichCard = 'true';
  commandCard.dataset.richCardKind = 'shop';
  const headerTitle = commandCard.querySelector('.thread-reply-header strong');
  if (headerTitle?.textContent.includes('field shop')) headerTitle.textContent = headerTitle.textContent.replace('field shop', 'Shop');

  for (const offer of commandCard.querySelectorAll('.thread-shop-offer')) {
    offer.dataset.testid = 'shop-offer';
    const buy = offer.querySelector('.thread-shop-buy');
    if (!buy) continue;
    offer.dataset.affordable = String(!buy.disabled);
    buy.dataset.shopBuy = 'true';
    if (/\bDust\b/.test(buy.textContent)) buy.textContent = buy.textContent.replace(/\bDust\b/g, 'Gold');
  }

  if (!commandCard.querySelector('[data-testid="stream-shop-sell-equipment"]')) {
    const footer = document.createElement('div');
    footer.className = 'shop-rich-card-footer rich-chat-card-actions';
    footer.dataset.shopRichCardOwned = 'true';
    const sell = document.createElement('button');
    sell.type = 'button';
    sell.dataset.testid = 'stream-shop-sell-equipment';
    sell.dataset.richCardAction = 'true';
    sell.className = 'rich-chat-card-action';
    sell.textContent = 'Sell equipment';
    sell.addEventListener('click', openInventoryFromShop);
    const note = document.createElement('p');
    note.className = 'shop-rich-card-note';
    note.textContent = 'Selling uses your Inventory so equipped-state and protected-item rules stay authoritative.';
    footer.append(sell, note);
    commandCard.append(footer);
  }
}

if (commandCard) {
  installStyles();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhanceShopCard();
    });
  };
  const observer = new MutationObserver((mutations) => {
    const ownedOnly = mutations.length > 0 && mutations.every((mutation) => {
      const changed = [...mutation.addedNodes, ...mutation.removedNodes];
      return changed.length > 0 && changed.every((node) => node.nodeType === Node.ELEMENT_NODE && node.dataset?.shopRichCardOwned === 'true');
    });
    if (!ownedOnly) schedule();
  });
  observer.observe(commandCard, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  schedule();
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
