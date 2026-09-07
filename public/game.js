const statusEl = document.querySelector('#status');
const identityEl = document.querySelector('#identity');
const characterEl = document.querySelector('#character');
const partyEl = document.querySelector('#party');
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
    statusEl.textContent = 'Working…';
    try { await onClick(); } catch (error) { statusEl.textContent = error.message; } finally { element.disabled = false; }
  });
  return element;
}

function renderParty(data) {
  partyEl.innerHTML = '<h2>Party</h2>';
  if (!data.party) {
    if (data.activeRun) {
      partyEl.insertAdjacentHTML('beforeend', '<p class="muted">Party changes are unavailable during an active dungeon.</p>');
      return;
    }
    partyEl.append(button('Create Party', async () => { await api('/api/party/create', { method: 'POST' }); await refresh(); }, 'create-party'));
    const input = document.createElement('input');
    input.placeholder = 'Invite code';
    input.maxLength = 6;
    input.dataset.testid = 'party-code-input';
    partyEl.append(input);
    partyEl.append(button('Join Party', async () => {
      await api('/api/party/join', { method: 'POST', body: JSON.stringify({ joinCode: input.value }) });
      await refresh();
    }, 'join-party'));
    partyEl.insertAdjacentHTML('beforeend', '<p class="muted">No party required: Frayed Hollow remains soloable.</p>');
    return;
  }

  const party = data.party;
  partyEl.insertAdjacentHTML('beforeend', `<p>Status: <strong>${party.status}</strong> · Invite code: <strong data-testid="party-code">${party.joinCode}</strong></p>`);
  for (const member of party.members) {
    const row = document.createElement('div');
    row.className = 'member';
    row.dataset.testid = 'party-member';
    row.textContent = `${member.displayName}${member.playerId === party.leaderPlayerId ? ' · Leader' : ''} · ${member.ready ? 'Ready' : 'Not ready'}`;
    partyEl.append(row);
  }

  if (party.status === 'forming') {
    const me = party.members.find((member) => member.playerId === data.character.id);
    partyEl.append(button(me?.ready ? 'Set Not Ready' : 'Ready Up', async () => {
      await api('/api/party/ready', { method: 'POST', body: JSON.stringify({ ready: !me?.ready }) });
      await refresh();
    }, 'toggle-ready'));
    partyEl.append(button(party.isLeader ? 'Disband Party' : 'Leave Party', async () => {
      await api('/api/party/leave', { method: 'POST' });
      await refresh();
    }, 'leave-party'));
    partyEl.insertAdjacentHTML('beforeend', `<p data-testid="party-readiness">${party.allReady ? 'All members ready.' : 'Waiting for all members to ready up.'}</p>`);
  } else {
    partyEl.insertAdjacentHTML('beforeend', '<p data-testid="party-readiness">Party locked while the shared dungeon is active.</p>');
  }
}

function renderDungeon(data) {
  dungeonEl.innerHTML = '<h2>Dungeon</h2>';
  if (!data.activeRun) {
    const dungeon = data.dungeons[0];
    dungeonEl.insertAdjacentHTML('beforeend', `<p>${dungeon.name} · recommended ${dungeon.recommendedPlayers} players · supports ${dungeon.minPlayers}–${dungeon.maxPlayers}</p>`);
    if (!data.party) {
      dungeonEl.append(button('Start Frayed Hollow Solo', async () => { await api(`/api/dungeons/${dungeon.id}/start`, { method: 'POST' }); await refresh(); }, 'start-dungeon'));
    } else if (data.party.canStart) {
      dungeonEl.append(button(`Start Frayed Hollow · ${data.party.members.length} players`, async () => { await api(`/api/dungeons/${dungeon.id}/start`, { method: 'POST' }); await refresh(); }, 'start-dungeon'));
    } else if (data.party.isLeader) {
      dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="start-waiting">All party members must be ready before the leader can start.</p>');
    } else {
      dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="start-waiting">Waiting for the party leader to start.</p>');
    }
    return;
  }

  const run = data.activeRun;
  const summary = document.createElement('p');
  summary.dataset.testid = 'run-state';
  summary.textContent = `Phase: ${run.phase} · ${run.participants.length} player${run.participants.length === 1 ? '' : 's'}${run.enemy ? ` · ${run.enemy.name} ${run.enemy.hp}/${run.enemy.maxHp}` : ''}`;
  dungeonEl.append(summary);
  dungeonEl.insertAdjacentHTML('beforeend', `<p data-testid="run-scaling">Enemy HP ×${run.scaling.enemyHealthMultiplier} · retaliation ×${run.scaling.retaliationMultiplier}</p>`);

  for (const participant of run.participants) {
    const row = document.createElement('div');
    row.className = 'member';
    row.dataset.testid = 'run-participant';
    row.textContent = `${participant.displayName} · HP ${participant.hp}/${participant.maxHp} · contribution ${participant.contributionDamage}`;
    dungeonEl.append(row);
  }

  if (['combat', 'boss'].includes(run.phase)) {
    if (run.viewer?.hp > 0) dungeonEl.append(button('Strike', async () => { await api(`/api/runs/${run.id}/attack`, { method: 'POST' }); await refresh(); }, 'attack'));
    else dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="defeated-player">You are down. Your party can still finish the encounter.</p>');
  }
  if (run.phase === 'upgrade') {
    if (run.isLeader) {
      for (const upgrade of data.runUpgrades) dungeonEl.append(button(upgrade.name, async () => { await api(`/api/runs/${run.id}/upgrade`, { method: 'POST', body: JSON.stringify({ upgradeId: upgrade.id }) }); await refresh(); }, `upgrade-${upgrade.id}`));
    } else {
      dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="upgrade-waiting">Waiting for the party leader to choose the shared upgrade.</p>');
    }
  }
}

async function refresh() {
  const data = await api('/api/dashboard');
  statusEl.textContent = 'Ready';
  identityEl.innerHTML = `<h2>Threaded</h2><p data-testid="threaded-user">${data.threadedUser.name || data.threadedUser.username || data.threadedUser.id}</p><p>Honey: <strong data-testid="honey-balance">${data.wallet.balance}</strong></p>`;
  characterEl.innerHTML = `<h2>Character</h2><p>${data.character.displayName}</p><p>Attack: <strong data-testid="attack-power">${data.character.attackPower}</strong> · HP: ${data.character.maxHealth} · Thread Dust: <span data-testid="thread-dust">${data.character.threadDust}</span></p><p>Equipped: <span data-testid="equipped-item">${data.character.equippedItem?.name || 'None'}</span></p>`;

  renderParty(data);
  renderDungeon(data);

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
