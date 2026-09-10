const stream = document.querySelector('[data-testid="adventure-stream"]');
const inventory = document.querySelector('#inventory');

if (stream || inventory) {
  const style = document.createElement('style');
  style.textContent = `
    .relic-progress-meta { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
    .relic-progress-chip { display:inline-flex; min-height:24px; align-items:center; padding:3px 7px; border:1px solid rgba(179,109,255,.25); border-radius:8px; background:rgba(179,109,255,.08); color:#d9b8ff; font-size:.63rem; font-weight:900; }
    .relic-progress-chip.master { border-color:rgba(255,209,102,.32); background:rgba(255,209,102,.09); color:#ffe097; }
    .relic-temper-actions { display:grid; gap:6px; width:100%; margin-top:7px; }
    .relic-temper-actions button { min-height:44px; margin:0 !important; }
    .relic-attunement-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
    .relic-attunement-button { display:grid; gap:2px; align-content:center; text-align:left; padding:7px 9px !important; border-color:rgba(179,109,255,.28) !important; background:rgba(179,109,255,.07) !important; }
    .relic-attunement-button strong { font-size:.69rem; }
    .relic-attunement-button small { color:var(--muted); font-size:.57rem; line-height:1.25; }
    .relic-temper-note { margin:0; color:var(--muted); font-size:.62rem; line-height:1.35; }
    .relic-temper-error { margin:0; padding:6px 8px; border-radius:8px; background:rgba(255,100,124,.08); color:#ff9cac; font-size:.65rem; }
    .relic-temper-success { margin:0; padding:6px 8px; border-radius:8px; background:rgba(100,230,169,.08); color:#9ff2c4; font-size:.65rem; }
    @media (max-width:520px) { .relic-attunement-grid { grid-template-columns:1fr; } }
  `;
  document.head.append(style);

  let refreshTimer = null;
  let acting = false;

  async function dashboard() {
    const response = await fetch('/api/dashboard', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Could not read relic progression.');
    return response.json();
  }

  function clearOwned(container) {
    container.querySelectorAll('[data-relic-progression-owned="true"]').forEach((node) => node.remove());
  }

  function progressionMeta(item) {
    const wrap = document.createElement('div');
    wrap.className = 'relic-progress-meta';
    wrap.dataset.relicProgressionOwned = 'true';
    wrap.dataset.testid = `relic-progress-${item.id}`;
    const temper = document.createElement('span');
    temper.className = `relic-progress-chip${item.progression?.canUpgrade ? '' : ' master'}`;
    temper.textContent = item.progression?.canUpgrade
      ? `TEMPER ${item.progression.level}/${item.progression.maxLevel}`
      : `MASTERWORK ${item.progression?.level || 0}/${item.progression?.maxLevel || 0}`;
    wrap.append(temper);
    if (item.progression?.attunement) {
      const attuned = document.createElement('span');
      attuned.className = 'relic-progress-chip';
      attuned.textContent = `◇ ${item.progression.attunement.name}`;
      wrap.append(attuned);
    }
    return wrap;
  }

  async function temper(item, attunementCode, host, button) {
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
        body: JSON.stringify({ attunementCode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || `Temper failed (${response.status})`);
      const success = document.createElement('p');
      success.className = 'relic-temper-success';
      success.dataset.relicProgressionOwned = 'true';
      success.textContent = `${payload.upgraded.name} reached Temper ${payload.upgraded.effect?.upgradeLevel || 1}.`;
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

  function temperActions(item, data, host) {
    const progression = item.progression;
    if (!progression?.canUpgrade) return null;
    const wrap = document.createElement('div');
    wrap.className = 'relic-temper-actions';
    wrap.dataset.relicProgressionOwned = 'true';
    const canAfford = Number(data.character.threadDust || 0) >= Number(progression.nextCost || 0);
    if (data.activeRun) {
      const note = document.createElement('p');
      note.className = 'relic-temper-note';
      note.textContent = 'Finish the active dungeon before Tempering or changing gear.';
      wrap.append(note);
      return wrap;
    }

    if (progression.needsAttunement) {
      const note = document.createElement('p');
      note.className = 'relic-temper-note';
      note.textContent = `First Temper costs ${progression.nextCost} Dust and permanently chooses this relic’s build path.`;
      wrap.append(note);
      const grid = document.createElement('div');
      grid.className = 'relic-attunement-grid';
      for (const attunement of data.relicAttunements || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'relic-attunement-button';
        button.dataset.testid = `temper-${item.id}-${attunement.code}`;
        button.disabled = !canAfford || acting;
        const title = document.createElement('strong');
        title.textContent = `${attunement.name} · ${progression.nextCost} Dust`;
        const copy = document.createElement('small');
        copy.textContent = `${attunement.playstyle} — ${attunement.description}`;
        button.append(title, copy);
        button.addEventListener('click', () => temper(item, attunement.code, host, button));
        grid.append(button);
      }
      wrap.append(grid);
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.testid = `temper-${item.id}`;
      button.disabled = !canAfford || acting;
      button.textContent = canAfford
        ? `Temper ${progression.level + 1}/${progression.maxLevel} · +1 Attack · ${progression.nextCost} Dust`
        : `Need ${progression.nextCost} Dust to Temper`;
      button.addEventListener('click', () => temper(item, progression.attunementCode, host, button));
      wrap.append(button);
    }
    return wrap;
  }

  function syncEquipLock(row, item, data, { stream = false } = {}) {
    if (item.id === data.character.equippedItem?.id) return;
    const testId = `${stream ? 'stream-equip' : 'equip'}-${item.id}`;
    const equip = [...row.querySelectorAll('button')].find((button) => button.dataset.testid === testId);
    if (!equip) return;

    if (data.activeRun && equip.dataset.relicEquipLocked !== 'true') {
      equip.dataset.relicEquipLocked = 'true';
      equip.dataset.relicEquipOriginalDisabled = String(equip.disabled);
      equip.dataset.relicEquipOriginalTitle = equip.title || '';
      equip.disabled = true;
      equip.title = 'Finish the active dungeon before changing equipped relics.';
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
      const fingerprint = JSON.stringify({
        level:item.progression?.level || 0,
        attunement:item.progression?.attunementCode || null,
        canUpgrade:Boolean(item.progression?.canUpgrade),
        nextCost:item.progression?.nextCost || 0,
        dust:data.character.threadDust || 0,
        activeRun:Boolean(data.activeRun),
        equipped:item.id === data.character.equippedItem?.id,
      });
      if (row.dataset.relicProgressionFingerprint === fingerprint) {
        syncEquipLock(row, item, data, { stream });
        return;
      }
      clearOwned(row);
      const copy = stream ? row.querySelector('.thread-gear-copy') : row;
      copy?.append(progressionMeta(item));
      const host = stream ? row.querySelector('.thread-gear-actions') || row : row;
      const actions = temperActions(item, data, host);
      if (actions) host.append(actions);
      syncEquipLock(row, item, data, { stream });
      row.dataset.relicProgressionFingerprint = fingerprint;
    });
  }

  async function refreshRelics() {
    try {
      const data = await dashboard();
      const commandCard = document.querySelector('[data-testid="stream-command-card"]');
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
    refreshTimer = setTimeout(refreshRelics, delay);
  }

  function mutationIsOwned(mutation) {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.length > 0 && nodes.every((node) => node.nodeType === Node.ELEMENT_NODE && node.dataset?.relicProgressionOwned === 'true');
  }

  const observers = [];
  for (const target of [stream, inventory].filter(Boolean)) {
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
