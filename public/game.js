const statusEl = document.querySelector('#status');
const identityEl = document.querySelector('#identity');
const characterEl = document.querySelector('#character');
const dungeonEl = document.querySelector('#dungeon');
const inventoryEl = document.querySelector('#inventory');
const achievementsEl = document.querySelector('#achievements');
const worldEl = document.querySelector('#world');
const honeyEl = document.querySelector('#honey');

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function button(label, onClick, testId) {
  const element = document.createElement('button');
  element.textContent = label;
  if (testId) element.dataset.testid = testId;
  element.addEventListener('click', async () => {
    element.disabled = true;
    try { await onClick(); } catch (error) { statusEl.textContent = error.message; } finally { element.disabled = false; }
  });
  return element;
}

async function refresh() {
  const data = await api('/api/dashboard');
  statusEl.textContent = 'Ready';
  identityEl.innerHTML = `<h2>Threaded</h2><p data-testid="threaded-user">${data.threadedUser.name || data.threadedUser.username || data.threadedUser.id}</p><p>Honey: <strong data-testid="honey-balance">${data.wallet.balance}</strong></p>`;
  characterEl.innerHTML = `<h2>Character</h2><p>${data.character.displayName}</p><p>Attack: <strong data-testid="attack-power">${data.character.attackPower}</strong> · HP: ${data.character.maxHealth} · Thread Dust: <span data-testid="thread-dust">${data.character.threadDust}</span></p><p>Equipped: <span data-testid="equipped-item">${data.character.equippedItem?.name || 'None'}</span></p>`;

  dungeonEl.innerHTML = '<h2>Dungeon</h2>';
  if (!data.activeRun) {
    const dungeon = data.dungeons[0];
    dungeonEl.append(document.createTextNode(`${dungeon.name} · recommended ${dungeon.recommendedPlayers} player`));
    dungeonEl.append(document.createElement('br'));
    dungeonEl.append(button('Start Frayed Hollow', async () => { await api(`/api/dungeons/${dungeon.id}/start`, { method: 'POST' }); await refresh(); }, 'start-dungeon'));
  } else {
    const run = data.activeRun;
    const summary = document.createElement('p');
    summary.dataset.testid = 'run-state';
    summary.textContent = `Phase: ${run.phase} · HP ${run.playerHp}${run.enemy ? ` · ${run.enemy.name} ${run.enemy.hp}/${run.enemy.maxHp}` : ''}`;
    dungeonEl.append(summary);
    if (['combat', 'boss'].includes(run.phase)) dungeonEl.append(button('Strike', async () => { await api(`/api/runs/${run.id}/attack`, { method: 'POST' }); await refresh(); }, 'attack'));
    if (run.phase === 'upgrade') {
      for (const upgrade of data.runUpgrades) dungeonEl.append(button(upgrade.name, async () => { await api(`/api/runs/${run.id}/upgrade`, { method: 'POST', body: JSON.stringify({ upgradeId: upgrade.id }) }); await refresh(); }, `upgrade-${upgrade.id}`));
    }
  }

  inventoryEl.innerHTML = '<h2>Inventory</h2>';
  if (data.inventory.length === 0) inventoryEl.insertAdjacentHTML('beforeend', '<p data-testid="inventory-empty">No items yet.</p>');
  for (const item of data.inventory) {
    const row = document.createElement('div');
    row.className = `item ${item.rarity}`;
    row.dataset.testid = 'inventory-item';
    row.innerHTML = `<strong>${item.name}</strong> · +${item.attackBonus} attack · ${item.effect.name}<br><span class="muted">${item.effect.description}</span>`;
    row.append(document.createElement('br'));
    row.append(button('Equip', async () => { await api(`/api/items/${item.id}/equip`, { method: 'POST' }); await refresh(); }, `equip-${item.id}`));
    inventoryEl.append(row);
  }

  achievementsEl.innerHTML = `<h2>Achievements</h2>${data.achievements.length ? `<ul>${data.achievements.map((a) => `<li data-testid="achievement"><strong>${a.name}</strong> — ${a.description}</li>`).join('')}</ul>` : '<p>No achievements yet.</p>'}`;
  worldEl.innerHTML = `<h2>World Arc</h2><p>${data.world.arcName}</p><p>Community Frayed Hollow clears: <strong data-testid="world-progress">${data.world.frayedHollowClears}</strong> / ${data.world.target}</p>`;
  honeyEl.innerHTML = '<h2>Honey integration</h2><p>Honey remains authoritative in Threaded. This purchase continuously verifies idempotent cross-app spending.</p>';
  honeyEl.append(button('Buy Training Cache · 25 Honey', async () => {
    const key = `ui-${crypto.randomUUID()}`;
    await api('/api/honey/purchases/training-cache', { method: 'POST', headers: { 'Idempotency-Key': key } });
    await refresh();
  }, 'buy-training-cache'));
}

refresh().catch((error) => { statusEl.textContent = error.message; });
