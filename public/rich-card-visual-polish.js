import { createSpriteElement } from './sprite-catalog.js';
import { visualAsset } from './visual-asset-catalog.js';

const CARD_HEADER_ICONS = Object.freeze({
  inventory: 'icon.inventory-bag.v1',
  shop: 'icon.gold.v1',
  profile: 'icon.level-up.v1',
  bank: 'icon.chest.v1',
});

const PROFILE_ICONS = Object.freeze({
  'profile-gold': 'icon.gold.v1',
  'profile-banked-gold': 'icon.chest.v1',
  'profile-area': 'icon.map.v1',
  'profile-achievement-count': 'icon.level-up.v1',
  'profile-stat-attack': 'icon.attack-sword.v1',
  'profile-stat-defense': 'icon.defense-shield.v1',
  'profile-stat-max-hp': 'icon.health.v1',
  'profile-stat-speed': 'icon.wind.v1',
  'profile-stat-crit': 'icon.target.v1',
});

const INVENTORY_STAT_ICONS = Object.freeze({
  'inventory-rich-stat-attack': 'icon.attack-sword.v1',
  'inventory-rich-stat-defense': 'icon.defense-shield.v1',
  'inventory-rich-stat-max-hp': 'icon.health.v1',
  'inventory-rich-stat-speed': 'icon.wind.v1',
  'inventory-rich-stat-crit': 'icon.target.v1',
});

const SLOT_ICONS = Object.freeze({
  weapon: 'icon.attack-sword.v1',
  helmet: 'icon.armor-helmet.v1',
  armor: 'icon.chest-armor.v1',
  boots: 'icon.boots.v1',
  accessory: 'icon.magic-ring.v1',
});

function assetFrame(id) {
  const asset = visualAsset(id, 'icon');
  if (!asset) return null;
  return {
    type: 'visual-asset',
    visualAssetId: asset.id,
    src: asset.src,
    width: asset.width,
    height: asset.height,
  };
}

function icon(id, label, className = '') {
  const frame = assetFrame(id);
  if (!frame) return null;
  return createSpriteElement(frame, {
    className: ['rich-card-semantic-icon', className].filter(Boolean).join(' '),
    label,
  });
}

function prependIcon(target, id, label, marker) {
  if (!target || target.querySelector(`[data-rich-card-icon="${marker}"]`)) return;
  const element = icon(id, label);
  if (!element) return;
  element.dataset.richCardIcon = marker;
  target.prepend(element);
}

function decorateHeader(card) {
  const kind = card.dataset.richCardKind;
  const iconId = CARD_HEADER_ICONS[kind];
  const header = card.querySelector('.thread-reply-header');
  if (!iconId || !header || header.querySelector('[data-rich-card-header-icon="true"]')) return;
  const element = icon(iconId, `${kind} icon`, 'rich-card-header-icon');
  if (!element) return;
  element.dataset.richCardHeaderIcon = 'true';
  const close = header.querySelector('.thread-reply-close');
  if (close) header.insertBefore(element, close);
  else header.append(element);
}

function decorateProfile(card) {
  for (const [testId, iconId] of Object.entries(PROFILE_ICONS)) {
    const value = card.querySelector(`[data-testid="${testId}"]`);
    const cell = value?.closest('.thread-profile-resource, .thread-profile-stat');
    if (!cell) continue;
    prependIcon(cell, iconId, cell.querySelector('span')?.textContent || testId, testId);
  }
  for (const [slot, iconId] of Object.entries(SLOT_ICONS)) {
    const row = card.querySelector(`[data-testid="profile-slot-${slot}"]`);
    if (!row || row.querySelector('.thread-generated-item-sprite')) continue;
    prependIcon(row, iconId, `${slot} slot`, `profile-slot-${slot}`);
  }
}

function decorateInventory(card) {
  for (const [testId, iconId] of Object.entries(INVENTORY_STAT_ICONS)) {
    const cell = card.querySelector(`[data-testid="${testId}"]`);
    if (!cell) continue;
    prependIcon(cell, iconId, cell.querySelector('span')?.textContent || testId, testId);
  }
  for (const [slot, iconId] of Object.entries(SLOT_ICONS)) {
    const cell = card.querySelector(`[data-testid="inventory-slot-${slot}"]`);
    if (!cell) continue;
    prependIcon(cell, iconId, `${slot} slot`, `inventory-slot-${slot}`);
  }
  const utility = card.querySelector('.inventory-rich-utility');
  prependIcon(utility, 'icon.health-potion.v1', 'Health potions', 'inventory-health-potions');
}

function decorateBank(card) {
  const carried = card.querySelector('[data-testid="bank-carried-gold"]')?.closest('.thread-bank-balance');
  const banked = card.querySelector('[data-testid="bank-banked-gold"]')?.closest('.thread-bank-balance');
  prependIcon(carried, 'icon.gold.v1', 'Carried Gold', 'bank-carried-gold');
  prependIcon(banked, 'icon.chest.v1', 'Banked Gold', 'bank-banked-gold');
}

function decorateShop(card) {
  for (const offer of card.querySelectorAll('.thread-shop-offer')) {
    if (offer.querySelector('.thread-generated-item-sprite')) continue;
    prependIcon(offer, 'icon.inventory-bag.v1', 'Shop item', `shop-offer-${offer.dataset.sku || 'item'}`);
  }
}

function decorateCard(card) {
  if (!card || card.hidden || !card.childElementCount) return;
  decorateHeader(card);
  switch (card.dataset.richCardKind) {
    case 'profile': decorateProfile(card); break;
    case 'inventory': decorateInventory(card); break;
    case 'bank': decorateBank(card); break;
    case 'shop': decorateShop(card); break;
    default: break;
  }
}

function installStyles(documentRef) {
  if (documentRef.querySelector('[data-rich-card-visual-polish-styles]')) return;
  const style = documentRef.createElement('style');
  style.dataset.richCardVisualPolishStyles = 'true';
  style.textContent = `
    .rich-card-semantic-icon { width:28px; height:28px; min-width:28px; align-self:center; }
    .rich-card-header-icon { width:34px; height:34px; min-width:34px; margin-left:auto; }
    .rich-chat-card .thread-profile-resource,
    .rich-chat-card .thread-profile-stat,
    .rich-chat-card .thread-bank-balance { grid-template-columns:30px minmax(0,1fr); column-gap:8px; align-items:center; }
    .rich-chat-card .thread-profile-resource > .rich-card-semantic-icon,
    .rich-chat-card .thread-profile-stat > .rich-card-semantic-icon,
    .rich-chat-card .thread-bank-balance > .rich-card-semantic-icon { grid-row:1 / span 2; }
    .rich-chat-card .thread-profile-resource > span:not(.rich-card-semantic-icon),
    .rich-chat-card .thread-profile-resource > strong,
    .rich-chat-card .thread-profile-stat > span:not(.rich-card-semantic-icon),
    .rich-chat-card .thread-profile-stat > strong,
    .rich-chat-card .thread-bank-balance > span:not(.rich-card-semantic-icon),
    .rich-chat-card .thread-bank-balance > strong { grid-column:2; }
    .inventory-rich-stat .rich-card-semantic-icon { display:block; width:24px; height:24px; min-width:24px; margin:0 auto 4px; }
    .inventory-rich-slot { display:grid; grid-template-columns:24px minmax(0,1fr); column-gap:6px; align-items:center; }
    .inventory-rich-slot > .rich-card-semantic-icon { width:24px; height:24px; min-width:24px; grid-row:1 / span 2; }
    .inventory-rich-slot > span:not(.rich-card-semantic-icon), .inventory-rich-slot > strong { grid-column:2; margin-top:0; }
    .inventory-rich-utility > .rich-card-semantic-icon { width:30px; height:30px; min-width:30px; }
    @media (max-width:420px) {
      .rich-card-header-icon { width:30px; height:30px; min-width:30px; }
      .rich-chat-card .thread-profile-resource,
      .rich-chat-card .thread-profile-stat,
      .rich-chat-card .thread-bank-balance { padding:8px; column-gap:6px; }
      .rich-card-semantic-icon { width:24px; height:24px; min-width:24px; }
    }
  `;
  documentRef.head.append(style);
}

export function installRichCardVisualPolish({ documentRef = document } = {}) {
  const stream = documentRef.querySelector('#stream');
  if (!stream) return () => {};
  installStyles(documentRef);
  let scheduled = false;
  const run = () => {
    scheduled = false;
    decorateCard(stream.querySelector('[data-testid="stream-command-card"]'));
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(run);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(stream, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-rich-card-kind'] });
  schedule();
  return () => observer.disconnect();
}

if (typeof document !== 'undefined') {
  const uninstall = installRichCardVisualPolish();
  window.addEventListener('beforeunload', uninstall, { once: true });
}
