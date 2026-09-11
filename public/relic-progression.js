const commandCard = document.querySelector('[data-testid="stream-command-card"]');
const inventory = document.querySelector('#inventory');

if (commandCard || inventory) {
  const style = document.createElement('style');
  style.textContent = `
    .relic-progress-meta { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
    .relic-progress-chip { display:inline-flex; min-height:24px; align-items:center; padding:3px 7px; border:1px solid rgba(179,109,255,.25); border-radius:8px; background:rgba(179,109,255,.08); color:#d9b8ff; font-size:.63rem; font-weight:900; }
    .relic-progress-chip.master { border-color:rgba(255,209,102,.32); background:rgba(255,209,102,.09); color:#ffe097; }
    .relic-temper-actions { display:grid; gap:6px; width:100%; margin-top:7px; }
    .relic-temper-actions button { min-height:44px; margin:0 !important; }
    .relic-temper-note { margin:0; color:var(--muted); font-size:.62rem; line-height:1.35; }
    .relic-temper-error { margin:0; padding:6px 8px; border-radius:8px; background:rgba(255,100,124,.08); color:#ff9cac; font-size:.65rem; }
    .relic-temper-success { margin:0; padding:6px 8px; border-radius:8px; background:rgba(100,230,169,.08); color:#9ff2c4; font-size:.65rem; }
    .derived-stat-strip { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; margin:0 2px 12px; }
    .derived-stat-chip { min-width:0; padding:7px 5px; border:1px solid rgba(179,109,255,.2); border-radius:9px; background:rgba(179,109,255,.06); text-align:center; }
    .derived-stat-chip span { display:block; color:var(--muted); font-size:.55rem; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
    .derived-stat-chip strong { display:block; margin-top:2px; font-size:.82rem; }
    @media (max-width:520px) { .derived-stat-strip { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  `;
  document.head.append(style);

  let refreshTimer = null;
  let acting = false;

  async function dashboard() {
    const response = await fetch('/api/dashboard', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Could not read equipment progression.');
    return response.json();
  }

  function clearOwned(container) {
    container.querySelectorAll('[data-relic-progression-owned="true"]').forEach((node) => node.remove());
  }

  function renderCharacterStats(data) {
    if (!inventory || !data.character?.stats) return;
    inventory.querySelector('[data-derived-stats="true"]')?.remove();
    const stats = data.character.stats;
    const values = [
      ['Attack', stats.attack],
      ['Defense', stats.defense],
      ['Max HP', stats.maxHp],
      ['Speed', stats.speed],
      ['Crit', `${stats.critChancePercent}%`],
    ];
    const strip = document.createElement('div');
    strip.className = 'derived-stat-strip';
    strip.dataset.derivedStats = 'true';
    strip.dataset.relicProgressionOwned = 'true';
    strip.dataset.testid = 'character-derived-stats';
    strip.setAttribute('aria-label', 'Character stats');
    for (const [label, value] of values) {
      const chip = document.createElement('div');
      chip.className = 'derived-stat-chip';
      chip.dataset.testid = `character-stat-${label.toLowerCase().replace(/\s+/g, '-')}`;
      const name = document.createElement('span');
      name.textContent = label;
      const amount = document.createElement('strong');
      amount.textContent = String(value);
      chip.append(name, amount);
      strip.append(chip);
    }
    const heading = inventory.querySelector('.section-heading');
    if (heading) heading.after(strip);
    else inventory.prepend(strip);
  }

  function itemSlot(item) {
    return String(item?.slot || 'weapon').trim().toLowerCase();
  }

  function slotLabel(item) {
    const slot = itemSlot(item);
    return slot ? slot[0].toUpperCase() + slot.slice(1) : 'Equipment';
  }

  function equippedForItem(data, item) {
    const slot = itemSlot(item);
    return data.character.equipment?.[slot] || (slot === 'weapon' ? data.character.equippedItem : null);
  }

  function isEquipped(data, item) {
    return equippedForItem(data, item)?.id === item.id;
  }

  function progressionMeta(item) {
    const wrap = document.createElement('div');
    wrap.className = 'relic-progress-meta';
    wrap.dataset.relicProgressionOwned = 'true';
    wrap.dataset.testid = `equipment-progress-${item.id}`;
    const slot = document.createElement('span');
    slot.className = 'relic-progress-chip';
    slot.textContent = slotLabel(item);
    slot.dataset.testid = `equipment-slot-${item.id}`;
    wrap.append(slot);
    const upgrade = document.createElement('span');
    upgrade.className = `relic-progress-chip${item.progression?.canUpgrade ? '' : ' master'}`;
    upgrade.textContent = item.progression?.canUpgrade
      ? `UPGRADE ${item.progression.level}/${item.progression.maxLevel}`
      : `MAX ${item.progression?.level || 0}/${item.progression?.maxLevel || 0}`;
    wrap.append(upgrade);
    // Old persisted tactical items may still carry an attunement. Keep it readable for
    // compatibility, but new default equipment never asks the player to choose one.
    if (item.progression?.attunement) {
      const legacy = document.createElement('span');
      legacy.className = 'relic-progress-chip';
      legacy.textContent = `Legacy effect · ${item.progression.attunement.name}`;
      wrap.append(legacy);
    }
    return wrap;
  }

  async function upgradeItem(item, host, button) {
    if (acting) return;
    acting = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    host.querySelector('.relic-temper-error')?.remove();
    host.querySelector('.relic-temper-success')?.remove();
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(item.id)}/upgrade`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || `Upgrade failed (${response.status})`);
      const success = document.createElement('p');
      success.className = 'relic-temper-success';
      success.dataset.relicProgressionOwned = 'true';
      success.textContent = `${payload.upgraded.name} reached Upgrade ${payload.upgraded.effect?.upgradeLevel || 1}.`;
      host.append(success);
      scheduleRefresh(40);
    } catch (error) {
      const message = document.createElement('p');
      message.className = 'relic-temper-error';
      message.dataset.relicProgressionOwned = 'true';
      message.textContent = error.message;
      host.append(message);
    } finally {
      acting = false;
      button.removeAttribute('aria-busy');
    }
  }

  function upgradeActions(item, data, host) {
    const progression = item.progression;
    if (!progression?.canUpgrade) return null;
    const wrap = document.createElement('div');
    wrap.className = 'relic-temper-actions';
    wrap.dataset.relicProgressionOwned = 'true';
    const gold = Number(data.character.gold ?? data.character.threadDust ?? 0);
    const canAfford = gold >= Number(progression.nextCost || 0);
    if (data.activeRun) {
      const note = document.createElement('p');
      note.className = 'relic-temper-note';
      note.textContent = 'Finish the active dungeon before upgrading or changing equipment.';
      wrap.append(note);
      return wrap;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.testid = `upgrade-${item.id}`;
    button.disabled = !canAfford || acting;
    button.textContent = canAfford
      ? `Upgrade ${progression.level + 1}/${progression.maxLevel} · +1 Attack · ${progression.nextCost} Gold`
      : `Need ${progression.nextCost} Gold to Upgrade`;
    button.addEventListener('click', () => upgradeItem(item, host, button));
    wrap.append(button);
    return wrap;
  }

  function syncEquipState(row, item, data, { stream = false } = {}) {
    const testId = `${stream ? 'stream-equip' : 'equip'}-${item.id}`;
    const equip = [...row.querySelectorAll('button')].find((button) => button.dataset.testid === testId);
    if (!equip) return;
    const equipped = isEquipped(data, item);
    if (equipped) {
      equip.dataset.relicCanonicalEquipped = 'true';
      equip.dataset.relicEquipOriginalText = equip.dataset.relicEquipOriginalText || equip.textContent || 'Equip';
      equip.disabled = true;
      equip.textContent = `Equipped · ${slotLabel(item)}`;
      equip.title = `${slotLabel(item)} slot currently uses this item.`;
      return;
    }
    if (equip.dataset.relicCanonicalEquipped === 'true') {
      equip.textContent = equip.dataset.relicEquipOriginalText || 'Equip';
      equip.disabled = false;
      equip.title = '';
      delete equip.dataset.relicCanonicalEquipped;
      delete equip.dataset.relicEquipOriginalText;
    }
  }

  function syncEquipLock(row, item, data, { stream = false } = {}) {
    if (isEquipped(data, item)) return;
    const testId = `${stream ? 'stream-equip' : 'equip'}-${item.id}`;
    const equip = [...row.querySelectorAll('button')].find((button) => button.dataset.testid === testId);
    if (!equip) return;

    if (data.activeRun && equip.dataset.relicEquipLocked !== 'true') {
      equip.dataset.relicEquipLocked = 'true';
      equip.dataset.relicEquipOriginalDisabled = String(equip.disabled);
      equip.dataset.relicEquipOriginalTitle = equip.title || '';
      equip.disabled = true;
      equip.title = 'Finish the active dungeon before changing equipped items.';
    } else if (!data.activeRun && equip.dataset.relicEquipLocked === 'true') {
      equip.disabled = equip.dataset.relicEquipOriginalDisabled === 'true';
      equip.title = equip.dataset.relicEquipOriginalTitle || '';
      delete equip.dataset.relicEquipLocked;
      delete equip.dataset.relicEquipOriginalDisabled;
      delete equip.dataset.relicEquipOriginalTitle;
    }
  }

  function enhanceRows(rows, data, { stream = false } = {}) {
    rows.forEach((row, index) => {
      const item = data.inventory?.[index];
      if (!item) return;
      clearOwned(row);
      const copy = stream ? row.querySelector('.thread-gear-copy') : row;
      copy?.append(progressionMeta(item));
      const host = stream ? row.querySelector('.thread-gear-actions') || row : row;
      const actions = upgradeActions(item, data, host);
      if (actions) host.append(actions);
      syncEquipState(row, item, data, { stream });
      syncEquipLock(row, item, data, { stream });
    });
  }

  async function refreshEquipment() {
    try {
      const data = await dashboard();
      renderCharacterStats(data);
      if (commandCard && !commandCard.hidden) {
        const rows = [...commandCard.querySelectorAll('.thread-gear-row')];
        if (rows.length) enhanceRows(rows, data, { stream: true });
      }
      if (inventory) {
        const rows = [...inventory.querySelectorAll('[data-testid="inventory-item"]')];
        if (rows.length) enhanceRows(rows, data);
      }
    } catch {
      // The owner surfaces connection failures. This enhancer disappears rather than
      // rendering progression from stale client state.
    }
  }

  function scheduleRefresh(delay = 70) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshEquipment, delay);
  }

  function mutationIsOwned(mutation) {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.length > 0 && nodes.every((node) => node.nodeType === Node.ELEMENT_NODE && node.dataset?.relicProgressionOwned === 'true');
  }

  const observers = [];
  for (const target of [commandCard, inventory].filter(Boolean)) {
    const observer = new MutationObserver((mutations) => {
      // Ignore the chips/actions this module adds and removes itself. Without this guard,
      // the observer schedules another dashboard fetch after every enhancement pass.
      if (mutations.length > 0 && mutations.every(mutationIsOwned)) return;
      scheduleRefresh();
    });
    observer.observe(target, { childList: true, subtree: true });
    observers.push(observer);
  }
  scheduleRefresh(0);
  window.addEventListener('beforeunload', () => {
    clearTimeout(refreshTimer);
    observers.forEach((observer) => observer.disconnect());
  }, { once: true });
}
