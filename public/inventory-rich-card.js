import { createSpriteElement, itemSpriteFrame } from './sprite-catalog.js';

const SLOT_ORDER = Object.freeze(['weapon', 'helmet', 'armor', 'boots', 'accessory']);
const SLOT_LABELS = Object.freeze({
  weapon: 'Weapon',
  helmet: 'Helmet',
  armor: 'Armor',
  boots: 'Boots',
  accessory: 'Accessory',
});

function installStyles(documentRef) {
  if (documentRef.querySelector('[data-inventory-rich-card-styles]')) return;
  const style = documentRef.createElement('style');
  style.dataset.inventoryRichCardStyles = 'true';
  style.textContent = `
    .inventory-rich-layout { display:grid; gap:12px; }
    .inventory-rich-summary { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; }
    .inventory-rich-stat { min-width:0; padding:8px 5px; border:1px solid rgba(179,109,255,.2); border-radius:9px; background:rgba(179,109,255,.06); text-align:center; }
    .inventory-rich-stat span { display:block; color:var(--muted); font-size:.54rem; font-weight:900; letter-spacing:.05em; text-transform:uppercase; }
    .inventory-rich-stat strong { display:block; margin-top:2px; font-size:.82rem; }
    .inventory-rich-loadout { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; }
    .inventory-rich-slot { min-width:0; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.025); }
    .inventory-rich-slot span { display:block; color:var(--muted); font-size:.56rem; font-weight:900; letter-spacing:.05em; text-transform:uppercase; }
    .inventory-rich-slot strong { display:block; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.7rem; }
    .inventory-rich-list { display:grid; gap:8px; }
    .inventory-rich-item { display:grid; grid-template-columns:52px minmax(0,1fr); gap:9px; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(255,255,255,.025); }
    .inventory-rich-item-copy { min-width:0; display:grid; gap:5px; }
    .inventory-rich-item-head { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .inventory-rich-item-head strong { min-width:0; }
    .inventory-rich-meta { flex:0 0 auto; font-size:.56rem; font-weight:900; letter-spacing:.04em; text-transform:uppercase; }
    .inventory-rich-item-stats { color:var(--muted); font-size:.65rem; line-height:1.35; }
    .inventory-rich-actions { grid-column:1 / -1; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .inventory-rich-actions button { min-height:44px; margin:0; }
    .inventory-rich-equipped { display:inline-flex; align-items:center; min-height:28px; padding:4px 8px; border-radius:8px; background:rgba(100,230,169,.08); color:#9ff2c4; font-size:.6rem; font-weight:900; }
    .inventory-rich-empty { margin:0; padding:14px; border:1px dashed rgba(255,255,255,.12); border-radius:10px; color:var(--muted); text-align:center; }
    .inventory-rich-utility { display:flex; justify-content:space-between; gap:10px; align-items:center; padding:9px 10px; border:1px solid rgba(255,255,255,.08); border-radius:10px; }
    .inventory-rich-utility small { display:block; color:var(--muted); margin-top:2px; }
    @media (max-width:520px) {
      .inventory-rich-summary { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .inventory-rich-loadout { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .inventory-rich-actions { grid-template-columns:1fr; }
    }
  `;
  documentRef.head.append(style);
}

function inventoryCommand(card) {
  if (card?.dataset.inventoryRichCard === 'true' || card?.dataset.richCardKind === 'inventory') return true;
  const kicker = card?.querySelector('.thread-reply-header > div > span')?.textContent || '';
  return /\/(gear|inventory)\b/i.test(kicker);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function itemSlot(item) {
  const slot = String(item?.slot || 'weapon').trim().toLowerCase();
  return SLOT_ORDER.includes(slot) ? slot : 'weapon';
}

function equippedForItem(data, item) {
  const slot = itemSlot(item);
  return data.character?.equipment?.[slot] || (slot === 'weapon' ? data.character?.equippedItem : null);
}

function itemStats(item) {
  const parts = [];
  const numeric = [
    ['Attack', item?.attackBonus],
    ['Defense', item?.defenseBonus],
    ['Max HP', item?.maxHpBonus ?? item?.maxHealthBonus],
    ['Speed', item?.speedBonus],
  ];
  for (const [label, value] of numeric) {
    const amount = Number(value || 0);
    if (Number.isFinite(amount) && amount !== 0) parts.push(`${amount > 0 ? '+' : ''}${amount} ${label}`);
  }
  const crit = Number(item?.critChanceBonus || 0);
  if (Number.isFinite(crit) && crit !== 0) parts.push(`${crit > 0 ? '+' : ''}${Math.round(crit * 1000) / 10}% Crit`);
  if (item?.effect?.name && item.effect.name !== 'Plain') parts.push(item.effect.name);
  return parts.length ? parts.join(' · ') : 'No stat bonus';
}

function characterStats(documentRef, data) {
  const stats = data.character?.stats || {};
  const values = [
    ['Attack', stats.attack ?? data.character?.attackPower ?? 0],
    ['Defense', stats.defense ?? 0],
    ['Max HP', stats.maxHp ?? data.character?.maxHealth ?? 0],
    ['Speed', stats.speed ?? 0],
    ['Crit', `${stats.critChancePercent ?? 0}%`],
  ];
  const grid = documentRef.createElement('div');
  grid.className = 'inventory-rich-summary';
  grid.dataset.testid = 'inventory-rich-stats';
  grid.setAttribute('aria-label', 'Character stats');
  for (const [label, value] of values) {
    const cell = documentRef.createElement('div');
    cell.className = 'inventory-rich-stat';
    cell.dataset.testid = `inventory-rich-stat-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const name = documentRef.createElement('span');
    name.textContent = label;
    const amount = documentRef.createElement('strong');
    amount.textContent = String(value);
    cell.append(name, amount);
    grid.append(cell);
  }
  return grid;
}

function loadoutGrid(documentRef, data) {
  const grid = documentRef.createElement('div');
  grid.className = 'inventory-rich-loadout';
  grid.dataset.testid = 'inventory-rich-loadout';
  grid.setAttribute('aria-label', 'Equipment slots');
  for (const slot of SLOT_ORDER) {
    const item = data.character?.equipment?.[slot] || null;
    const cell = documentRef.createElement('div');
    cell.className = 'inventory-rich-slot';
    cell.dataset.slot = slot;
    cell.dataset.testid = `inventory-slot-${slot}`;
    const label = documentRef.createElement('span');
    label.textContent = SLOT_LABELS[slot];
    const value = documentRef.createElement('strong');
    value.textContent = item?.name || 'Empty';
    cell.append(label, value);
    grid.append(cell);
  }
  return grid;
}

function actionButton(documentRef, label, testId, action, { disabled = false, primary = false } = {}) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.dataset.testid = testId;
  button.dataset.richCardAction = 'true';
  button.className = `rich-chat-card-action${primary ? ' primary-action' : ''}`;
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      await action(button);
    } finally {
      button.removeAttribute('aria-busy');
      if (documentRef.contains(button)) button.disabled = disabled;
    }
  });
  return button;
}

function itemRow(documentRef, data, item, rerender) {
  const slot = itemSlot(item);
  const equipped = equippedForItem(data, item)?.id === item.id;
  const row = documentRef.createElement('article');
  row.className = `inventory-rich-item rarity-${String(item.rarity || 'common').toLowerCase()}`;
  row.dataset.testid = 'inventory-rich-item';
  row.dataset.itemId = item.id;
  row.dataset.slot = slot;

  row.append(createSpriteElement(itemSpriteFrame(item), {
    className: 'inventory-rich-sprite thread-generated-item-sprite',
    label: item.name,
  }));

  const copy = documentRef.createElement('div');
  copy.className = 'inventory-rich-item-copy';
  const head = documentRef.createElement('div');
  head.className = 'inventory-rich-item-head';
  const name = documentRef.createElement('strong');
  name.textContent = item.name;
  const meta = documentRef.createElement('span');
  meta.className = 'inventory-rich-meta';
  meta.textContent = `${SLOT_LABELS[slot]} · ${String(item.rarity || 'common').toUpperCase()}`;
  head.append(name, meta);
  const stats = documentRef.createElement('div');
  stats.className = 'inventory-rich-item-stats';
  stats.textContent = itemStats(item);
  copy.append(head, stats);
  if (equipped) {
    const badge = documentRef.createElement('span');
    badge.className = 'inventory-rich-equipped';
    badge.textContent = `Equipped · ${SLOT_LABELS[slot]}`;
    copy.append(badge);
  }
  row.append(copy);

  const actions = documentRef.createElement('div');
  actions.className = 'inventory-rich-actions rich-chat-card-actions';
  const equipmentLocked = Boolean(data.activeRun);
  actions.append(actionButton(documentRef, equipped ? 'Equipped' : 'Equip', `inventory-rich-equip-${item.id}`, async () => {
    await api(`/api/items/${encodeURIComponent(item.id)}/equip`, { method: 'POST' });
    await rerender();
  }, { disabled: equipped || equipmentLocked, primary: !equipped }));

  const progression = item.progression || {};
  const canAffordUpgrade = Number(data.character?.gold || 0) >= Number(progression.nextCost || 0);
  const upgradeLabel = progression.canUpgrade
    ? `Upgrade · ${progression.nextCost} Gold`
    : `Upgrade · Max`;
  actions.append(actionButton(documentRef, upgradeLabel, `inventory-rich-upgrade-${item.id}`, async () => {
    await api(`/api/items/${encodeURIComponent(item.id)}/upgrade`, { method: 'POST', body: JSON.stringify({}) });
    await rerender();
  }, { disabled: !progression.canUpgrade || !canAffordUpgrade || equipmentLocked }));

  let confirmed = false;
  const sell = actionButton(documentRef, equipped ? 'Sell · Equipped' : 'Sell', `inventory-rich-sell-${item.id}`, async (button) => {
    if (!confirmed) {
      confirmed = true;
      button.textContent = 'Confirm Sell';
      button.disabled = false;
      return;
    }
    await api(`/api/items/${encodeURIComponent(item.id)}/salvage`, { method: 'POST' });
    await rerender();
  }, { disabled: equipped || equipmentLocked });
  actions.append(sell);
  row.append(actions);
  return row;
}

async function renderInventoryCard(card, { documentRef = document } = {}) {
  if (!card || card.hidden || !inventoryCommand(card)) return;
  if (card.dataset.inventoryRichRendering === 'true') return;
  // Claim the canonical identity before awaiting dashboard I/O. The simple chat shell may
  // rewrite the visible kicker to THREADBOUND while this fetch is in flight; presentation
  // text must not erase the semantic card family or cancel the render.
  card.dataset.inventoryRichCard = 'true';
  card.dataset.richCardKind = 'inventory';
  card.dataset.inventoryRichRendering = 'true';
  try {
    const data = await api('/api/dashboard');
    if (card.hidden || !inventoryCommand(card)) return;
    const header = card.querySelector('.thread-reply-header');
    if (!header) return;

    const heading = header.querySelector('strong');
    if (heading) heading.textContent = 'Inventory';
    const kicker = header.querySelector('span');
    if (kicker) kicker.textContent = 'PRIVATE THREAD REPLY · /inventory';
    let subtitle = header.querySelector('small');
    if (!subtitle) {
      subtitle = documentRef.createElement('small');
      header.querySelector('div')?.append(subtitle);
    }
    subtitle.textContent = `${data.inventory.length} item${data.inventory.length === 1 ? '' : 's'} · ${data.character.gold} Gold`;

    for (const child of [...card.children]) {
      if (child !== header) child.remove();
    }
    card.classList.add('rich-chat-card');
    card.dataset.richCardKind = 'inventory';
    card.dataset.inventoryRichCard = 'true';
    card.setAttribute('aria-label', 'Inventory panel');

    const layout = documentRef.createElement('div');
    layout.className = 'inventory-rich-layout';
    layout.dataset.testid = 'inventory-rich-card';
    layout.append(characterStats(documentRef, data), loadoutGrid(documentRef, data));

    const utility = documentRef.createElement('div');
    utility.className = 'inventory-rich-utility';
    const utilityCopy = documentRef.createElement('div');
    const utilityName = documentRef.createElement('strong');
    utilityName.textContent = `Health Potions · ${data.character.healthPotions}`;
    const utilityDetail = documentRef.createElement('small');
    utilityDetail.textContent = `${data.character.currentHealth}/${data.character.maxHealth} HP`;
    utilityCopy.append(utilityName, utilityDetail);
    utility.append(utilityCopy);
    layout.append(utility);

    const list = documentRef.createElement('div');
    list.className = 'inventory-rich-list';
    list.dataset.testid = 'inventory-rich-items';
    if (!data.inventory.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'inventory-rich-empty';
      empty.textContent = 'No equipment yet. Hunt or clear an Adventure to find gear.';
      list.append(empty);
    } else {
      const rerender = async () => {
        card.querySelector('.inventory-rich-layout')?.remove();
        await renderInventoryCard(card, { documentRef });
      };
      for (const item of data.inventory) list.append(itemRow(documentRef, data, item, rerender));
    }
    layout.append(list);
    card.append(layout);
  } catch (error) {
    const existing = card.querySelector('[data-testid="inventory-rich-error"]');
    if (existing) existing.textContent = error.message;
    else {
      const message = documentRef.createElement('p');
      message.dataset.testid = 'inventory-rich-error';
      message.className = 'stream-error';
      message.textContent = error.message;
      card.append(message);
    }
  } finally {
    delete card.dataset.inventoryRichRendering;
  }
}

export function installInventoryRichCard({ documentRef = document } = {}) {
  const stream = documentRef.querySelector('#stream');
  if (!stream) return () => {};
  installStyles(documentRef);
  let scheduled = false;
  const decorate = () => {
    scheduled = false;
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card || card.hidden || !inventoryCommand(card)) return;
    if (card.querySelector('.inventory-rich-layout')) {
      card.dataset.inventoryRichCard = 'true';
      card.dataset.richCardKind = 'inventory';
      return;
    }
    renderInventoryCard(card, { documentRef });
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(decorate);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(stream, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-rich-card-kind'] });
  schedule();
  return () => observer.disconnect();
}

if (typeof document !== 'undefined') {
  const uninstall = installInventoryRichCard();
  window.addEventListener('beforeunload', uninstall, { once: true });
}
