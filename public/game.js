document.documentElement.classList.add('threadbound-player-root');
document.body.classList.add('threadbound-player');
const gameStyles = document.createElement('link');
gameStyles.rel = 'stylesheet';
gameStyles.href = '/game.css';
document.head.append(gameStyles);

const statusEl = document.querySelector('#status');
const identityEl = document.querySelector('#identity');
const characterEl = document.querySelector('#character');
const partyEl = document.querySelector('#party');
const dungeonEl = document.querySelector('#dungeon');
const inventoryEl = document.querySelector('#inventory');
const achievementsEl = document.querySelector('#achievements');
const worldEl = document.querySelector('#world');
const honeyEl = document.querySelector('#honey');

statusEl.setAttribute('role', 'status');
statusEl.setAttribute('aria-live', 'polite');
characterEl.after(dungeonEl);
dungeonEl.after(partyEl);

const mobileNav = document.createElement('nav');
mobileNav.className = 'mobile-game-nav';
mobileNav.dataset.testid = 'mobile-game-nav';
mobileNav.setAttribute('aria-label', 'Game sections');
mobileNav.innerHTML = `
  <a href="#dungeon"><strong>⚔</strong><span>Play</span></a>
  <a href="#inventory"><strong>◇</strong><span>Gear</span></a>
  <a href="#party"><strong>♟</strong><span>Party</span></a>
  <a href="#world"><strong>◎</strong><span>World</span></a>
  <a href="/codex"><strong>⌘</strong><span>Codex</span></a>
`;
document.body.append(mobileNav);

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function clampPercent(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function progressBar(value, max, className = 'health-bar') {
  return `<div class="${className}" aria-hidden="true"><span style="--progress:${clampPercent(value, max)}%"></span></div>`;
}

function button(label, onClick, testId) {
  const element = document.createElement('button');
  element.textContent = label;
  if (testId) element.dataset.testid = testId;
  element.addEventListener('click', async () => {
    element.disabled = true;
    element.setAttribute('aria-busy', 'true');
    statusEl.textContent = 'Working…';
    try { await onClick(); } catch (error) { statusEl.textContent = error.message; } finally {
      element.disabled = false;
      element.removeAttribute('aria-busy');
    }
  });
  return element;
}

function targetSelect(candidates, testId) {
  const select = document.createElement('select');
  select.dataset.testid = testId;
  select.setAttribute('aria-label', 'Choose party member');
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
    input.setAttribute('aria-label', 'Party invite code');
    partyEl.append(input);
    partyEl.append(button('Join Party', async () => {
      await api('/api/party/join', { method: 'POST', body: JSON.stringify({ joinCode: input.value }) });
      await refresh();
    }, 'join-party'));
    partyEl.insertAdjacentHTML('beforeend', '<p class="muted">Every dungeon remains soloable. Party up when you want easier fights and support actions.</p>');
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
  support.className = 'support-actions';
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
      row.className = 'item dungeon-card';
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
  summary.className = 'run-summary';
  summary.dataset.testid = 'run-state';
  summary.innerHTML = `<span class="phase-chip">${run.phase}</span><span>v${run.version} · ${run.participants.length} player${run.participants.length === 1 ? '' : 's'}${run.enemy ? ` · ${run.enemy.name} ${run.enemy.hp}/${run.enemy.maxHp}` : ''}</span>`;
  dungeonEl.append(summary);
  dungeonEl.insertAdjacentHTML('beforeend', `<p class="muted" data-testid="run-scaling">Enemy HP ×${run.scaling.enemyHealthMultiplier} · retaliation ×${run.scaling.retaliationMultiplier}</p>`);

  if (run.enemy) {
    const enemy = document.createElement('div');
    enemy.className = 'enemy-card';
    enemy.dataset.testid = 'enemy-card';
    enemy.innerHTML = `<div class="enemy-name"><span>${run.enemy.name}</span><span>${run.enemy.hp}/${run.enemy.maxHp} HP</span></div>${progressBar(run.enemy.hp, run.enemy.maxHp)}`;
    dungeonEl.append(enemy);
  }

  for (const participant of run.participants) {
    const row = document.createElement('div');
    row.className = 'member participant-card';
    row.dataset.testid = 'run-participant';
    row.dataset.playerId = participant.playerId;
    row.innerHTML = `<div class="participant-head"><span>${participant.displayName}${participant.guarding ? '<span class="guarding-badge">GUARDING</span>' : ''}</span><span>HP ${participant.hp}/${participant.maxHp}</span></div>${progressBar(participant.hp, participant.maxHp)}<div class="participant-stats">damage ${participant.contributionDamage} · healing ${participant.healingDone} · revives ${participant.revives} · prevented ${participant.damagePrevented} · threat ${participant.threat}</div>`;
    dungeonEl.append(row);
  }

  if (['combat', 'boss'].includes(run.phase)) {
    if (run.viewer?.hp > 0) {
      const actions = document.createElement('div');
      actions.className = 'actions combat-dock';
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
      const upgrades = document.createElement('div');
      upgrades.className = 'upgrade-grid';
      for (const upgrade of data.runUpgrades) upgrades.append(button(upgrade.name, async () => { await api(`/api/runs/${run.id}/upgrade`, { method: 'POST', body: JSON.stringify({ upgradeId: upgrade.id }) }); await refresh(); }, `upgrade-${upgrade.id}`));
      dungeonEl.append(upgrades);
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
  characterEl.innerHTML = `<h2>Weaver</h2><p><strong>${data.character.displayName}</strong></p><div class="stat-strip"><div class="stat-chip"><span>Attack</span><strong data-testid="attack-power">${data.character.attackPower}</strong></div><div class="stat-chip"><span>Health</span><strong>${data.character.maxHealth}</strong></div><div class="stat-chip"><span>Dust</span><strong data-testid="thread-dust">${data.character.threadDust}</strong></div></div><p class="muted">Equipped: <span data-testid="equipped-item">${data.character.equippedItem?.name || 'None'}</span></p>`;
  renderDungeon(data);
  renderParty(data);

  inventoryEl.innerHTML = '<h2>Gear</h2>';
  if (data.inventory.length === 0) inventoryEl.insertAdjacentHTML('beforeend', '<p data-testid="inventory-empty">No items yet. Clear a dungeon to earn your first relic.</p>');
  for (const item of data.inventory) {
    const row = document.createElement('div');
    row.className = `item ${item.rarity}`;
    row.dataset.testid = 'inventory-item';
    row.innerHTML = `<strong>${item.name}</strong> · +${item.attackBonus} attack · ${item.effect.name}<br><span class="muted">${item.effect.description}</span>`;
    row.append(document.createElement('br'));
    row.append(button('Equip', async () => { await api(`/api/items/${item.id}/equip`, { method: 'POST' }); await refresh(); }, `equip-${item.id}`));
    inventoryEl.append(row);
  }

  achievementsEl.innerHTML = `<h2>Achievements</h2>${data.achievements.length ? `<ul>${data.achievements.map((a) => `<li data-testid="achievement"><strong>${a.name}</strong> — ${a.description}</li>`).join('')}</ul>` : '<p class="muted">Your first milestones will appear here.</p>'}`;
  const progress = clampPercent(data.world.frayedHollowClears, data.world.target);
  worldEl.innerHTML = `<h2>World Arc</h2><p><strong>${data.world.arcName}</strong></p><div class="world-progress-label"><span>Community Frayed Hollow clears</span><span><strong data-testid="world-progress">${data.world.frayedHollowClears}</strong> / ${data.world.target}</span></div><div class="progress-bar" aria-hidden="true"><span style="--progress:${progress}%"></span></div>`;

  honeyEl.innerHTML = '<h2>Honey</h2>';
  if (data.authSource === 'local') {
    honeyEl.insertAdjacentHTML('beforeend', '<p class="muted" data-testid="local-honey-disabled">Unavailable in standalone local mode. Threaded remains the authoritative Honey wallet.</p>');
  } else {
    honeyEl.insertAdjacentHTML('beforeend', '<p class="muted">Premium purchases use your Threaded Honey balance.</p>');
    honeyEl.append(button('Buy Training Cache · 25 Honey', async () => {
      const key = `ui-${crypto.randomUUID()}`;
      await api('/api/honey/purchases/training-cache', { method: 'POST', headers: { 'Idempotency-Key': key } });
      await refresh();
    }, 'buy-training-cache'));
  }
}

refresh().catch((error) => { statusEl.textContent = error.message; });
