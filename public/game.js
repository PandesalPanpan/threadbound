import { enemySprite, weaverSprite } from './sprite-catalog.js';

document.documentElement.classList.add('threadbound-player-root');
document.body.classList.add('threadbound-player');
for (const href of ['/game.css', '/game-feel.css']) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

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
  <a href="#stream" data-view="play"><strong>⚔</strong><span>Play</span></a>
  <a href="#inventory" data-view="gear"><strong>◇</strong><span>Gear</span></a>
  <a href="#party" data-view="party"><strong>♟</strong><span>Party</span></a>
  <a href="#world" data-view="world"><strong>◎</strong><span>World</span></a>
  <a href="/codex"><strong>⌘</strong><span>Codex</span></a>
`;
document.body.append(mobileNav);

let lastDashboard = null;
let recentReward = null;
let activeView = 'play';
let refreshPromise = null;
let refreshQueued = false;
let intentTicker = null;
let sse = null;
const RARITY_TIERS = Object.freeze({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 });

function setStatus(message, { ready = false } = {}) {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-ready', ready);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = payload.error;
    throw error;
  }
  return payload;
}

function clampPercent(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function progressBar(value, max, className = 'health-bar') {
  return `<div class="${className}" aria-hidden="true"><span style="--progress:${clampPercent(value, max)}%"></span></div>`;
}

function button(label, onClick, testId, { className = '', disabled = false } = {}) {
  const element = document.createElement('button');
  element.textContent = label;
  element.className = className;
  element.disabled = disabled;
  if (testId) element.dataset.testid = testId;
  element.addEventListener('click', async () => {
    if (element.disabled) return;
    element.disabled = true;
    element.setAttribute('aria-busy', 'true');
    setStatus('Working…');
    try { await onClick(); }
    catch (error) { setStatus(error.message); }
    finally {
      element.disabled = disabled;
      element.removeAttribute('aria-busy');
    }
  });
  return element;
}

function rarityMeta(item) {
  const rarity = String(item?.rarity || 'common').toLowerCase();
  return { rarity, tier: item?.rarityTier || RARITY_TIERS[rarity] || 1, label: rarity[0].toUpperCase() + rarity.slice(1) };
}

function achievementUnlocked(data, name) {
  return data.achievements.some((achievement) => achievement.name === name);
}

function applyView(view = activeView) {
  activeView = view;
  document.body.dataset.gameView = view;
  for (const link of mobileNav.querySelectorAll('[data-view]')) link.toggleAttribute('aria-current', link.dataset.view === view);
}

for (const link of mobileNav.querySelectorAll('[data-view]')) {
  link.addEventListener('click', (event) => {
    if (window.matchMedia('(max-width: 720px)').matches) {
      event.preventDefault();
      applyView(link.dataset.view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

function renderParty(data) {
  partyEl.innerHTML = '<div class="section-heading"><span>CO-OP</span><h2>Party</h2></div>';
  if (!data.party) {
    if (data.activeRun) {
      partyEl.insertAdjacentHTML('beforeend', '<p class="muted">Party changes are unavailable during an active dungeon.</p>');
      return;
    }
    partyEl.append(button('Create Party', async () => { await api('/api/party/create', { method: 'POST' }); await refresh(); }, 'create-party', { className: 'primary-action' }));
    const input = document.createElement('input');
    input.placeholder = 'Invite code';
    input.maxLength = 12;
    input.dataset.testid = 'party-code-input';
    input.setAttribute('aria-label', 'Party invite code');
    partyEl.append(input);
    partyEl.append(button('Join Party', async () => { await api('/api/party/join', { method: 'POST', body: JSON.stringify({ joinCode: input.value.trim() }) }); await refresh(); }, 'join-party'));
    partyEl.insertAdjacentHTML('beforeend', '<p class="muted">You can also manage the party from the Adventure Stream.</p>');
    return;
  }

  const party = data.party;
  partyEl.insertAdjacentHTML('beforeend', `<div class="party-code-card"><span>INVITE CODE</span><strong data-testid="party-code">${party.joinCode}</strong><small>${party.status === 'forming' ? 'Forming party' : 'Dungeon active'}</small></div>`);
  const roster = document.createElement('div');
  roster.className = 'party-roster';
  for (const member of party.members) {
    const row = document.createElement('div');
    row.className = `member ${member.ready ? 'is-ready-member' : ''}`;
    row.dataset.testid = 'party-member';
    const avatar = document.createElement('img');
    avatar.className = 'member-avatar';
    avatar.src = weaverSprite(member.playerId);
    avatar.alt = '';
    avatar.dataset.testid = 'party-member-sprite';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = `${member.displayName}${member.playerId === party.leaderPlayerId ? ' · Leader' : ''}`;
    const ready = document.createElement('small');
    ready.textContent = member.ready ? 'Ready' : 'Not ready';
    copy.append(name, ready);
    row.append(avatar, copy);
    roster.append(row);
  }
  partyEl.append(roster);

  if (party.status === 'forming') {
    const me = party.members.find((member) => member.playerId === data.character.id);
    partyEl.append(button(me?.ready ? 'Set Not Ready' : 'Ready Up', async () => { await api('/api/party/ready', { method: 'POST', body: JSON.stringify({ ready: !me?.ready }) }); await refresh(); }, 'toggle-ready', { className: me?.ready ? '' : 'primary-action' }));
    partyEl.append(button(party.isLeader ? 'Disband Party' : 'Leave Party', async () => { await api('/api/party/leave', { method: 'POST' }); await refresh(); }, 'leave-party'));
    partyEl.insertAdjacentHTML('beforeend', `<p data-testid="party-readiness" class="party-readiness">${party.allReady ? 'All members ready.' : 'Waiting for all members to ready up.'}</p>`);
  } else partyEl.insertAdjacentHTML('beforeend', '<p data-testid="party-readiness" class="party-readiness">Party locked while the shared dungeon is active.</p>');
}

function renderIntent(run) {
  clearInterval(intentTicker);
  intentTicker = null;
  if (!run.enemyIntent) return;
  const intent = document.createElement('div');
  intent.className = `enemy-intent counter-${run.enemyIntent.counter || 'interrupt'}`;
  intent.dataset.testid = 'enemy-intent';
  const payload = run.enemyIntent.kind === 'fortify' ? 'fortifies for the next hits' : `${run.enemyIntent.damage} incoming damage`;
  intent.innerHTML = `<div><span>ENEMY TELEGRAPH</span><strong>${run.enemyIntent.name}</strong><small>${payload} · <b>Counter: ${run.enemyIntent.counterLabel || run.enemyIntent.counter}</b></small><em>${run.enemyIntent.hint || 'Answer from the thread.'}</em></div><div class="intent-timer" data-testid="intent-timer"></div>`;
  dungeonEl.append(intent);
  const timer = intent.querySelector('[data-testid="intent-timer"]');
  const draw = () => {
    const left = Math.max(0, new Date(run.enemyIntent.dueAt).getTime() - Date.now());
    timer.textContent = `${(left / 1000).toFixed(1)}s`;
    timer.style.setProperty('--intent-progress', `${Math.min(100, (left / 4500) * 100)}%`);
  };
  draw();
  intentTicker = setInterval(draw, 100);
}

function renderRewardReveal(data) {
  if (!recentReward) return;
  const { item } = recentReward;
  const meta = rarityMeta(item);
  const reveal = document.createElement('div');
  reveal.className = `reward-reveal rarity-${meta.rarity}`;
  reveal.dataset.testid = 'reward-reveal';
  reveal.innerHTML = `<span class="reward-kicker">RELIC RECOVERED</span><span class="rarity-badge">${meta.label} · Tier ${meta.tier}</span><h3 data-testid="reward-name"></h3><p class="power-gain">+${item.attackBonus} attack while equipped</p><p><strong></strong> — <span></span></p>`;
  reveal.querySelector('[data-testid="reward-name"]').textContent = item.name;
  reveal.querySelector('p strong').textContent = item.effect?.name || 'Plain Weave';
  reveal.querySelector('p span').textContent = item.effect?.description || 'No special combat effect.';
  reveal.insertAdjacentHTML('beforeend', '<p class="muted">Equip, compare, salvage, and start the next adventure from the thread below.</p>');
  dungeonEl.append(reveal);
}

function renderDungeon(data) {
  dungeonEl.innerHTML = '<div class="section-heading"><span>STATE MIRROR</span><h2>Current Adventure</h2></div>';
  if (!data.activeRun) {
    const firstRun = !achievementUnlocked(data, 'Hollow Cleared');
    if (firstRun) dungeonEl.insertAdjacentHTML('beforeend', '<div class="first-run-guide" data-testid="first-run-guide"><span>FIRST THREAD</span><strong>Enter Frayed Hollow from the Adventure Stream</strong><p>Each attack is a deliberate turn. Threadbound posts the result, HP, foe state, and next choices back into the shared timeline.</p></div>');
    else if (!recentReward) dungeonEl.insertAdjacentHTML('beforeend', '<p class="loop-prompt" data-testid="loop-prompt"><strong>Your Weaver remembers.</strong> Choose the next adventure from the shared thread.</p>');
    renderRewardReveal(data);
    const canStart = !data.party || data.party.canStart;
    for (const [index, dungeon] of data.dungeons.entries()) {
      const row = document.createElement('div');
      row.className = 'item dungeon-card';
      row.dataset.testid = 'dungeon-option';
      row.innerHTML = `<div class="dungeon-art" aria-hidden="true"><span>✦</span></div><div class="dungeon-copy"><strong></strong><span></span><small></small></div>`;
      row.querySelector('strong').textContent = dungeon.name;
      row.querySelector('.dungeon-copy span').textContent = dungeon.arcTitle || 'Unknown arc';
      row.querySelector('small').textContent = `Recommended ${dungeon.recommendedPlayers} · Soloable · ${dungeon.minPlayers}–${dungeon.maxPlayers} players`;
      if (canStart) {
        const testId = index === 0 ? 'start-dungeon' : `start-dungeon-${dungeon.id}`;
        row.append(button(`Enter ${dungeon.name}`, async () => { recentReward = null; await api(`/api/dungeons/${dungeon.id}/start`, { method: 'POST' }); await refresh(); }, testId, { className: 'primary-action' }));
      }
      dungeonEl.append(row);
    }
    return;
  }

  const run = data.activeRun;
  const summary = document.createElement('p');
  summary.className = 'run-summary';
  summary.dataset.testid = 'run-state';
  summary.innerHTML = `<span class="phase-chip">Phase: ${run.phase}</span><span class="run-meta">${run.participants.length} Weaver${run.participants.length === 1 ? '' : 's'}${run.enemy ? ` · ${run.enemy.name}` : ''}</span>`;
  dungeonEl.append(summary);
  dungeonEl.insertAdjacentHTML('beforeend', `<p class="muted run-debug" data-testid="run-scaling">Enemy HP ×${run.scaling.enemyHealthMultiplier} · retaliation ×${run.scaling.retaliationMultiplier}</p>`);

  if (run.enemy) {
    const enemy = document.createElement('div');
    enemy.className = `enemy-card ${run.enemy.isBoss ? 'boss-card' : ''}`;
    enemy.dataset.testid = 'enemy-card';
    enemy.innerHTML = `<img src="${enemySprite(run.enemy)}" alt="" class="thread-sprite"><div class="enemy-body"><div class="enemy-name"><span></span><span>${run.enemy.hp}/${run.enemy.maxHp} HP</span></div>${progressBar(run.enemy.hp, run.enemy.maxHp)}</div>`;
    enemy.querySelector('.enemy-name span').textContent = `${run.enemy.name}${run.enemy.isBoss ? ' · BOSS' : ''}`;
    dungeonEl.append(enemy);
  }

  renderIntent(run);
  const partyStrip = document.createElement('div');
  partyStrip.className = 'combat-party-strip';
  for (const participant of run.participants) {
    const row = document.createElement('div');
    row.className = `member participant-card ${participant.playerId === run.viewer?.playerId ? 'is-you' : ''}`;
    row.dataset.testid = 'run-participant';
    row.dataset.playerId = participant.playerId;
    row.innerHTML = `<div class="participant-head"><span></span><span>HP ${participant.hp}/${participant.maxHp}</span></div>${progressBar(participant.hp, participant.maxHp)}<div class="participant-stats">Focus ${participant.focus}/${participant.maxFocus} · damage ${participant.contributionDamage} · healing ${participant.healingDone} · revives ${participant.revives} · prevented ${participant.damagePrevented}${participant.riposteBonus ? ` · Riposte +${participant.riposteBonus}` : ''}</div>`;
    row.querySelector('.participant-head span').textContent = `${participant.displayName}${participant.guarding ? ' · GUARDING' : ''}`;
    partyStrip.append(row);
  }
  dungeonEl.append(partyStrip);

  if (['combat', 'boss'].includes(run.phase)) {
    if (run.viewer?.hp > 0) dungeonEl.insertAdjacentHTML('beforeend', '<div class="combat-coach" data-testid="combat-coach"><strong>Your turn is waiting in the thread.</strong><span>Attack builds Focus. Spend it on Power Strike, or answer telegraphs with Guard and Interrupt. Mend and Revive keep the party moving. Nothing attacks automatically.</span></div><p class="muted" data-testid="combat-help">Every combat action is explicit and server-authoritative; the shared thread records the result.</p>');
    else dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="defeated-player">You are down. An ally can Revive you from the thread.</p>');
  }

  if (run.phase === 'upgrade') {
    dungeonEl.insertAdjacentHTML('beforeend', `<div class="choice-intro" data-testid="upgrade-intro"><span>RUN CHOICE</span><strong>${run.isLeader ? 'Choose the shared upgrade from the thread.' : 'Waiting for the leader to choose in the thread.'}</strong></div>`);
  }
}

function renderGear(data) {
  inventoryEl.innerHTML = '<div class="section-heading"><span>ARSENAL</span><h2>Gear</h2></div>';
  if (data.inventory.length === 0) {
    inventoryEl.insertAdjacentHTML('beforeend', '<p data-testid="inventory-empty">No relics yet. Clear a dungeon to earn your first weapon.</p>');
    return;
  }
  const equippedId = data.character.equippedItem?.id || null;
  const equippedPower = data.character.equippedItem?.attackBonus || 0;
  const grid = document.createElement('div');
  grid.className = 'gear-grid';
  for (const item of data.inventory) {
    const meta = rarityMeta(item);
    const equipped = item.id === equippedId;
    const delta = item.attackBonus - equippedPower;
    const row = document.createElement('article');
    row.className = `item gear-card rarity-${meta.rarity} ${equipped ? 'is-equipped' : ''}`;
    row.dataset.testid = 'inventory-item';
    row.innerHTML = `<div class="gear-card-top"><span class="rarity-badge">${meta.label} · T${meta.tier}</span>${equipped ? '<span class="equipped-chip">EQUIPPED</span>' : ''}</div><img class="thread-sprite small" src="/sprites/relic.svg" alt=""><h3></h3><p class="gear-power">+${item.attackBonus} Attack ${!equipped && delta ? `<small class="${delta > 0 ? 'positive' : 'negative'}">${delta > 0 ? '+' : ''}${delta} vs equipped</small>` : ''}</p><p><strong></strong><br><span class="muted"></span></p>`;
    row.querySelector('h3').textContent = item.name;
    row.querySelector('p strong').textContent = item.effect.name;
    row.querySelector('p .muted').textContent = item.effect.description;
    if (equipped) row.append(button('Equipped', async () => {}, `equip-${item.id}`, { disabled: true, className: 'equipped-button' }));
    else row.append(button(delta > 0 ? `Equip · +${delta} upgrade` : 'Equip', async () => { await api(`/api/items/${item.id}/equip`, { method: 'POST' }); await refresh(); }, `equip-${item.id}`, { className: delta > 0 ? 'primary-action' : '' }));
    grid.append(row);
  }
  inventoryEl.append(grid);
}

function renderMetaSections(data) {
  achievementsEl.innerHTML = '<div class="section-heading"><span>MILESTONES</span><h2>Achievements</h2></div>';
  if (data.achievements.length) {
    const grid = document.createElement('div');
    grid.className = 'achievement-grid';
    for (const achievement of data.achievements) {
      const item = document.createElement('article');
      item.className = 'achievement-card unlocked';
      item.dataset.testid = 'achievement';
      const medal = document.createElement('span');
      medal.className = 'achievement-medal';
      medal.textContent = '✦';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = achievement.name;
      const body = document.createElement('p');
      body.textContent = achievement.description;
      copy.append(title, body);
      item.append(medal, copy);
      grid.append(item);
    }
    achievementsEl.append(grid);
  } else achievementsEl.insertAdjacentHTML('beforeend', '<p class="muted">Your first milestones will appear here.</p>');

  const progress = clampPercent(data.world.frayedHollowClears, data.world.target);
  worldEl.innerHTML = `<div class="section-heading"><span>SHARED WORLD</span><h2>World Arc</h2></div><div class="world-arc-card"><span class="arc-status">ACTIVE</span><h3>${data.world.arcName}</h3><div class="world-progress-label"><span>Community Frayed Hollow clears</span><span><strong data-testid="world-progress">${data.world.frayedHollowClears}</strong> / ${data.world.target}</span></div><div class="progress-bar" aria-hidden="true"><span style="--progress:${progress}%"></span></div></div>`;

  honeyEl.innerHTML = '<div class="section-heading"><span>PREMIUM</span><h2>Honey</h2></div>';
  if (data.authSource === 'local') honeyEl.insertAdjacentHTML('beforeend', '<p class="muted" data-testid="local-honey-disabled">Unavailable in standalone local mode. Threaded remains the authoritative Honey wallet.</p>');
  else {
    honeyEl.insertAdjacentHTML('beforeend', `<div class="honey-balance-card"><span>Balance</span><strong data-testid="honey-balance">${data.wallet.balance}</strong></div><p class="muted">Premium purchases use your Threaded Honey balance.</p>`);
    honeyEl.append(button('Buy Training Cache · 25 Honey', async () => { const key = `ui-${crypto.randomUUID()}`; await api('/api/honey/purchases/training-cache', { method: 'POST', headers: { 'Idempotency-Key': key } }); await refresh(); }, 'buy-training-cache'));
  }
}

function detectRemoteReward(previous, next) {
  if (!previous?.activeRun || next.activeRun || recentReward) return;
  const oldIds = new Set((previous.inventory || []).map((item) => item.id));
  const newest = (next.inventory || []).find((item) => !oldIds.has(item.id));
  if (newest) recentReward = { item: newest, dungeonId: previous.activeRun.dungeonId };
}

async function doRefresh({ quiet = false } = {}) {
  const previous = lastDashboard;
  const data = await api('/api/dashboard');
  detectRemoteReward(previous, data);
  lastDashboard = data;
  if (!quiet) setStatus('Ready', { ready: true });
  else if (statusEl.textContent === 'Working…' || statusEl.textContent === 'Loading…') setStatus('Ready', { ready: true });

  const sourceLabel = data.authSource === 'local' ? 'Local Weaver' : 'Threaded Weaver';
  identityEl.innerHTML = `<div class="identity-pill"><span>${sourceLabel}</span><strong data-testid="threaded-user"></strong><small data-testid="auth-source">${data.authSource}</small></div>`;
  identityEl.querySelector('[data-testid="threaded-user"]').textContent = data.threadedUser.name || data.threadedUser.username || data.threadedUser.id;
  characterEl.innerHTML = `<div class="section-heading"><span>YOUR WEAVER</span><h2></h2></div><div class="weaver-summary"><img src="${weaverSprite(data.character.id)}" alt="" class="thread-sprite" data-testid="weaver-character-sprite"><div class="stat-strip"><div class="stat-chip attack-stat"><span>Attack</span><strong data-testid="attack-power">${data.character.attackPower}</strong></div><div class="stat-chip"><span>Health</span><strong>${data.character.maxHealth}</strong></div><div class="stat-chip dust-stat"><span>Dust</span><strong data-testid="thread-dust">${data.character.threadDust}</strong></div></div></div><p class="equipped-summary">Equipped: <strong data-testid="equipped-item"></strong></p>`;
  characterEl.querySelector('h2').textContent = data.character.displayName;
  characterEl.querySelector('[data-testid="equipped-item"]').textContent = data.character.equippedItem?.name || 'None';
  renderDungeon(data);
  renderParty(data);
  renderGear(data);
  renderMetaSections(data);
  applyView(activeView);
  return data;
}

async function refresh(options = {}) {
  if (refreshPromise) {
    refreshQueued = true;
    return refreshPromise;
  }
  refreshPromise = doRefresh(options).finally(async () => {
    refreshPromise = null;
    if (refreshQueued) {
      refreshQueued = false;
      await refresh({ quiet: true });
    }
  });
  return refreshPromise;
}

function connectRealtime() {
  if (!('EventSource' in window)) return;
  sse?.close();
  sse = new EventSource('/api/events');
  let timer = null;
  sse.onmessage = (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (payload.type !== 'state_changed') return;
    clearTimeout(timer);
    timer = setTimeout(() => refresh({ quiet: true }).catch(() => {}), 80);
  };
  sse.onerror = () => {
    document.body.classList.add('realtime-reconnecting');
    setTimeout(() => document.body.classList.remove('realtime-reconnecting'), 1500);
  };
}

window.addEventListener('beforeunload', () => {
  clearInterval(intentTicker);
  sse?.close();
});

refresh().then(() => {
  connectRealtime();
  setInterval(() => refresh({ quiet: true }).catch(() => {}), 12000);
}).catch((error) => setStatus(error.message));
