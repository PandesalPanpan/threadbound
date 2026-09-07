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

function targetSelect(candidates, testId) {
  const select = document.createElement('select');
  select.dataset.testid = testId;
  for (const participant of candidates) {
    const option = document.createElement('option');
    option.value = participant.playerId;
    option.textContent = `${participant.displayName} · HP ${participant.hp}/${participant.maxHp}`;
    select.append(option);
  }
  return select;
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
    partyEl.insertAdjacentHTML('beforeend', '<p class="muted">No party required: every dungeon remains soloable, though some recommend co-op.</p>');
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

function renderSupportActions(run) {
  const viewer = run.viewer;
  const allies = run.participants.filter((participant) => participant.playerId !== viewer.playerId);
  if (allies.length === 0) return;
  const wounded = allies.filter((participant) => participant.hp > 0 && participant.hp < participant.maxHp);
  const downed = allies.filter((participant) => participant.hp === 0);
  const support = document.createElement('div');
  support.dataset.testid = 'support-actions';

  if (wounded.length > 0 && viewer.mendCharges > 0) {
    const select = targetSelect(wounded, 'mend-target');
    support.append(select);
    support.append(button(`Mend · ${viewer.mendCharges} charge`, async () => {
      await api(`/api/runs/${run.id}/mend`, { method: 'POST', body: JSON.stringify({ targetPlayerId: select.value }) });
      await refresh();
    }, 'mend'));
  } else {
    support.insertAdjacentHTML('beforeend', `<span class="muted" data-testid="mend-unavailable">${viewer.mendCharges > 0 ? 'No ally currently needs Mend.' : 'Mend used for this encounter.'}</span>`);
  }

  if (downed.length > 0 && viewer.reviveCharges > 0) {
    const select = targetSelect(downed, 'revive-target');
    support.append(select);
    support.append(button(`Revive · ${viewer.reviveCharges} charge`, async () => {
      await api(`/api/runs/${run.id}/revive`, { method: 'POST', body: JSON.stringify({ targetPlayerId: select.value }) });
      await refresh();
    }, 'revive'));
  } else {
    support.insertAdjacentHTML('beforeend', `<span class="muted" data-testid="revive-unavailable">${viewer.reviveCharges > 0 ? 'No ally is down.' : 'Revive used for this run.'}</span>`);
  }
  dungeonEl.append(support);
}

function renderDungeon(data) {
  dungeonEl.innerHTML = '<h2>Dungeon</h2>';
  if (!data.activeRun) {
    const canStart = !data.party || data.party.canStart;
    if (data.party && !data.party.canStart) {
      dungeonEl.insertAdjacentHTML('beforeend', `<p data-testid="start-waiting">${data.party.isLeader ? 'All party members must be ready before the leader can start.' : 'Waiting for the party leader to start.'}</p>`);
    }
    for (const [index, dungeon] of data.dungeons.entries()) {
      const row = document.createElement('div');
      row.className = 'item';
      row.dataset.testid = 'dungeon-option';
      row.innerHTML = `<strong>${dungeon.name}</strong><br><span class="muted">${dungeon.arcTitle || 'Unknown arc'} · recommended ${dungeon.recommendedPlayers} players · supports ${dungeon.minPlayers}–${dungeon.maxPlayers}${dungeon.sourceManifestRevision ? ` · manifest r${dungeon.sourceManifestRevision}` : ''}</span>`;
      if (canStart) {
        const label = data.party ? `Start ${dungeon.name} · ${data.party.members.length} players` : `Start ${dungeon.name} Solo`;
        const testId = index === 0 ? 'start-dungeon' : `start-dungeon-${dungeon.id}`;
        row.append(document.createElement('br'));
        row.append(button(label, async () => { await api(`/api/dungeons/${dungeon.id}/start`, { method: 'POST' }); await refresh(); }, testId));
      }
      dungeonEl.append(row);
    }
    return;
  }

  const run = data.activeRun;
  const summary = document.createElement('p');
  summary.dataset.testid = 'run-state';
  summary.textContent = `Phase: ${run.phase} · v${run.version} · ${run.participants.length} player${run.participants.length === 1 ? '' : 's'}${run.enemy ? ` · ${run.enemy.name} ${run.enemy.hp}/${run.enemy.maxHp}` : ''}`;
  dungeonEl.append(summary);
  dungeonEl.insertAdjacentHTML('beforeend', `<p data-testid="run-scaling">Enemy HP ×${run.scaling.enemyHealthMultiplier} · retaliation ×${run.scaling.retaliationMultiplier}</p>`);

  for (const participant of run.participants) {
    const row = document.createElement('div');
    row.className = 'member';
    row.dataset.testid = 'run-participant';
    row.dataset.playerId = participant.playerId;
    row.textContent = `${participant.displayName} · HP ${participant.hp}/${participant.maxHp} · damage ${participant.contributionDamage} · healing ${participant.healingDone} · revives ${participant.revives} · prevented ${participant.damagePrevented} · threat ${participant.threat}${participant.guarding ? ' · GUARDING' : ''}`;
    dungeonEl.append(row);
  }

  if (['combat', 'boss'].includes(run.phase)) {
    if (run.viewer?.hp > 0) {
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.dataset.testid = 'combat-actions';
      actions.append(button('Strike', async () => { await api(`/api/runs/${run.id}/attack`, { method: 'POST' }); await refresh(); }, 'attack'));
      actions.append(button('Guard', async () => { await api(`/api/runs/${run.id}/guard`, { method: 'POST' }); await refresh(); }, 'guard'));
      dungeonEl.append(actions);
      renderSupportActions(run);
      dungeonEl.insertAdjacentHTML('beforeend', '<p class="muted" data-testid="combat-help">Guard adds threat and halves the next retaliation that hits you. Mend heals an ally once per encounter. Revive restores a downed ally once per run.</p>');
    } else {
      dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="defeated-player">You are down. An ally can Revive you, or your party can continue without you.</p>');
    }
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
  const sourceLabel = data.authSource === 'local' ? 'Local development identity' : 'Threaded';
  const walletText = data.authSource === 'local' ? 'Honey unavailable in local mode' : `Honey: <strong data-testid="honey-balance">${data.wallet.balance}</strong>`;
  identityEl.innerHTML = `<h2>${sourceLabel}</h2><p data-testid="threaded-user">${data.threadedUser.name || data.threadedUser.username || data.threadedUser.id}</p><p data-testid="auth-source">${data.authSource}</p><p>${walletText}</p>`;
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

  honeyEl.innerHTML = '<h2>Honey integration</h2>';
  if (data.authSource === 'local') {
    honeyEl.insertAdjacentHTML('beforeend', '<p data-testid="local-honey-disabled">Disabled in standalone local mode. Threaded stays the only authoritative owner of Honey.</p>');
  } else {
    honeyEl.insertAdjacentHTML('beforeend', '<p>Honey remains authoritative in Threaded. This purchase continuously verifies idempotent cross-app spending.</p>');
    honeyEl.append(button('Buy Training Cache · 25 Honey', async () => {
      const key = `ui-${crypto.randomUUID()}`;
      await api('/api/honey/purchases/training-cache', { method: 'POST', headers: { 'Idempotency-Key': key } });
      await refresh();
    }, 'buy-training-cache'));
  }
}

refresh().catch((error) => { statusEl.textContent = error.message; });
