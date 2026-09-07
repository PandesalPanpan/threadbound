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
  <a href="#dungeon" data-view="play"><strong>⚔</strong><span>Play</span></a>
  <a href="#inventory" data-view="gear"><strong>◇</strong><span>Gear</span></a>
  <a href="#party" data-view="party"><strong>♟</strong><span>Party</span></a>
  <a href="#world" data-view="world"><strong>◎</strong><span>World</span></a>
  <a href="/codex"><strong>⌘</strong><span>Codex</span></a>
`;
document.body.append(mobileNav);

let lastDashboard = null;
let actionFeedback = null;
let recentReward = null;
let activeView = 'play';
let refreshPromise = null;
let refreshQueued = false;
let autoAttackTimer = null;
let autoAttackBusy = false;
let intentTicker = null;
let sse = null;
const AUTO_ATTACK_MS = 1800;
const RARITY_TIERS = Object.freeze({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 });

function setStatus(message, { ready = false } = {}) {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-ready', ready);
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
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

function achievementUnlocked(data, name) {
  return data.achievements.some((achievement) => achievement.name === name);
}

function rarityMeta(item) {
  const rarity = String(item?.rarity || 'common').toLowerCase();
  return { rarity, tier: item?.rarityTier || RARITY_TIERS[rarity] || 1, label: rarity[0].toUpperCase() + rarity.slice(1) };
}

function feedbackFromOutcome(type, outcome) {
  const events = outcome.events || [];
  const defeated = events.find((event) => event.type === 'EnemyDefeated');
  const damagedPlayer = events.find((event) => event.type === 'PlayerDamaged');
  const interrupted = events.find((event) => event.type === 'EnemyInterrupted');
  const healed = events.find((event) => event.type === 'PlayerHealed');
  const revived = events.find((event) => event.type === 'PlayerRevived');

  if (type === 'attack') {
    return {
      type: 'attack', damage: outcome.damage || 0,
      retaliation: outcome.retaliation || damagedPlayer?.damage || 0,
      title: defeated ? `${defeated.isBoss ? 'Boss' : 'Enemy'} defeated` : `${outcome.damage || 0} damage`,
      detail: defeated ? (outcome.reward ? 'The Hollow yields a relic.' : 'The path opens deeper into the Hollow.') : (outcome.retaliation ? `The enemy retaliates for ${outcome.retaliation}.` : 'Auto-strike lands cleanly.'),
    };
  }
  if (type === 'guard') {
    const prevented = Math.max(0, (damagedPlayer?.rawDamage || outcome.retaliation || 0) - (damagedPlayer?.damage || outcome.retaliation || 0));
    return { type: 'guard', retaliation: outcome.retaliation || 0, prevented, title: prevented > 0 ? `Guard absorbed ${prevented}` : 'Guard raised', detail: outcome.retaliation ? `You take ${outcome.retaliation} while holding the line.` : 'You brace for the next retaliation.' };
  }
  if (type === 'interrupt') return { type: 'interrupt', title: 'Interrupted!', detail: interrupted ? 'The enemy heavy attack collapses before it lands.' : 'Enemy action stopped.' };
  if (type === 'mend') return { type: 'support', title: `Mended ${outcome.healed || healed?.amount || 0} HP`, detail: outcome.retaliation ? `The enemy retaliates for ${outcome.retaliation}.` : 'Ally restored.' };
  if (type === 'revive') return { type: 'support', title: 'Ally revived', detail: `Restored ${outcome.restoredHp || revived?.restoredHp || 0} HP.` };
  if (type === 'upgrade') return { type: 'upgrade', title: 'The weave changes', detail: 'Your choice lasts for the rest of this run.' };
  return null;
}

async function act(type, path, options = {}, { quiet = false } = {}) {
  const outcome = await api(path, options);
  actionFeedback = feedbackFromOutcome(type, outcome);
  if (outcome.reward) {
    recentReward = { item: outcome.reward, dungeonId: outcome.state?.dungeonId || 'frayed-hollow', attackBeforeEquip: lastDashboard?.character?.attackPower ?? null, equipped: false };
  }
  await refresh({ quiet });
  return outcome;
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
    input.maxLength = 6;
    input.dataset.testid = 'party-code-input';
    input.setAttribute('aria-label', 'Party invite code');
    partyEl.append(input);
    partyEl.append(button('Join Party', async () => { await api('/api/party/join', { method: 'POST', body: JSON.stringify({ joinCode: input.value }) }); await refresh(); }, 'join-party'));
    partyEl.insertAdjacentHTML('beforeend', '<p class="muted">Party state now syncs live. Invite a Weaver, ready up, and both screens update automatically.</p>');
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
    row.innerHTML = `<span class="member-avatar">${member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>${member.displayName}${member.playerId === party.leaderPlayerId ? ' · Leader' : ''}</strong><small>${member.ready ? 'Ready' : 'Not ready'}</small></div>`;
    roster.append(row);
  }
  partyEl.append(roster);

  if (party.status === 'forming') {
    const me = party.members.find((member) => member.playerId === data.character.id);
    partyEl.append(button(me?.ready ? 'Set Not Ready' : 'Ready Up', async () => { await api('/api/party/ready', { method: 'POST', body: JSON.stringify({ ready: !me?.ready }) }); await refresh(); }, 'toggle-ready', { className: me?.ready ? '' : 'primary-action' }));
    partyEl.append(button(party.isLeader ? 'Disband Party' : 'Leave Party', async () => { await api('/api/party/leave', { method: 'POST' }); await refresh(); }, 'leave-party'));
    partyEl.insertAdjacentHTML('beforeend', `<p data-testid="party-readiness" class="party-readiness">${party.allReady ? 'All members ready.' : 'Waiting for all members to ready up.'}</p>`);
  } else {
    partyEl.insertAdjacentHTML('beforeend', '<p data-testid="party-readiness" class="party-readiness">Party locked while the shared dungeon is active.</p>');
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
    support.append(button(`Mend · ${viewer.mendCharges}`, async () => { await act('mend', `/api/runs/${run.id}/mend`, { method: 'POST', body: JSON.stringify({ targetPlayerId: select.value }) }); }, 'mend', { className: 'skill-button support-skill' }));
  } else support.insertAdjacentHTML('beforeend', `<span class="muted" data-testid="mend-unavailable">${viewer.mendCharges > 0 ? 'Mend appears when an ally is wounded.' : 'Mend used this encounter.'}</span>`);

  if (downed.length > 0 && viewer.reviveCharges > 0) {
    const select = targetSelect(downed, 'revive-target');
    support.append(select);
    support.append(button(`Revive · ${viewer.reviveCharges}`, async () => { await act('revive', `/api/runs/${run.id}/revive`, { method: 'POST', body: JSON.stringify({ targetPlayerId: select.value }) }); }, 'revive', { className: 'skill-button revive-skill' }));
  } else support.insertAdjacentHTML('beforeend', `<span class="muted" data-testid="revive-unavailable">${viewer.reviveCharges > 0 ? 'Revive appears when an ally falls.' : 'Revive used this run.'}</span>`);
  dungeonEl.append(support);
}

function renderActionFeedback(run) {
  if (!actionFeedback) return;
  const feedback = document.createElement('div');
  feedback.className = `combat-feedback ${actionFeedback.type}`;
  feedback.dataset.testid = 'combat-feedback';
  feedback.setAttribute('role', 'status');
  feedback.innerHTML = `<strong>${actionFeedback.title}</strong><span>${actionFeedback.detail}</span>`;
  dungeonEl.append(feedback);
  if (run?.enemy && actionFeedback.type === 'attack' && actionFeedback.damage > 0) {
    const enemy = dungeonEl.querySelector('[data-testid="enemy-card"]');
    if (enemy) {
      enemy.classList.add('impact-hit');
      enemy.insertAdjacentHTML('beforeend', `<span class="damage-pop" data-testid="damage-feedback">-${actionFeedback.damage}</span>`);
    }
  }
  if (run?.viewer && actionFeedback.retaliation > 0) {
    const viewer = dungeonEl.querySelector(`[data-testid="run-participant"][data-player-id="${run.viewer.playerId}"]`);
    if (viewer) viewer.insertAdjacentHTML('beforeend', `<span class="retaliation-pop" data-testid="retaliation-feedback">-${actionFeedback.retaliation} HP</span>`);
  }
}

function renderIntent(run) {
  clearInterval(intentTicker);
  intentTicker = null;
  if (!run.enemyIntent) return;
  const intent = document.createElement('div');
  intent.className = 'enemy-intent';
  intent.dataset.testid = 'enemy-intent';
  intent.innerHTML = `<div><span>ENEMY TELEGRAPH</span><strong>${run.enemyIntent.name}</strong><small>${run.enemyIntent.damage} incoming damage</small></div><div class="intent-timer" data-testid="intent-timer"></div>`;
  intent.append(button('Interrupt', async () => { await act('interrupt', `/api/runs/${run.id}/interrupt`, { method: 'POST' }); }, 'interrupt', { className: 'skill-button interrupt-skill' }));
  dungeonEl.append(intent);
  const timer = intent.querySelector('[data-testid="intent-timer"]');
  const draw = () => {
    const left = Math.max(0, new Date(run.enemyIntent.dueAt).getTime() - Date.now());
    timer.textContent = `${(left / 1000).toFixed(1)}s`;
    timer.style.setProperty('--intent-progress', `${Math.min(100, (left / 3000) * 100)}%`);
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
  const currentAttack = data.character.attackPower;
  const comparison = recentReward.equipped && recentReward.attackBeforeEquip !== null
    ? `<p class="power-gain" data-testid="reward-power-gain">Attack ${recentReward.attackBeforeEquip} → <strong>${currentAttack}</strong></p>`
    : `<p class="power-gain">+${item.attackBonus} attack while equipped</p>`;
  reveal.innerHTML = `<span class="reward-kicker">RELIC RECOVERED</span><span class="rarity-badge">${meta.label} · Tier ${meta.tier}</span><h3 data-testid="reward-name">${item.name}</h3>${comparison}<p><strong>${item.effect?.name || 'Plain Weave'}</strong> — ${item.effect?.description || 'No special combat effect.'}</p>`;
  const actions = document.createElement('div');
  actions.className = 'reward-actions';
  if (!recentReward.equipped) actions.append(button('Equip now', async () => { await api(`/api/items/${item.id}/equip`, { method: 'POST' }); recentReward.equipped = true; actionFeedback = { type: 'reward', title: `${item.name} equipped`, detail: 'Your permanent attack has increased.' }; await refresh(); }, 'reward-equip', { className: 'primary-action' }));
  const canRunAgain = !data.party || data.party.canStart;
  if (canRunAgain) actions.append(button('Run Frayed Hollow again', async () => { const dungeonId = recentReward.dungeonId; recentReward = null; actionFeedback = null; await api(`/api/dungeons/${dungeonId}/start`, { method: 'POST' }); await refresh(); }, 'run-again'));
  else actions.insertAdjacentHTML('beforeend', '<span class="muted">Ready the party to run again.</span>');
  reveal.append(actions);
  dungeonEl.append(reveal);
}

function enemyVisual(enemy) {
  const spriteName = enemy?.isBoss ? 'boss' : enemy?.id || 'enemy';
  return `<div class="combat-sprite sprite-${spriteName}" aria-hidden="true"><span></span></div>`;
}

function renderDungeon(data) {
  dungeonEl.innerHTML = '<div class="section-heading"><span>EXPEDITION</span><h2>Play</h2></div>';
  if (!data.activeRun) {
    const firstRun = !achievementUnlocked(data, 'Hollow Cleared');
    if (firstRun) dungeonEl.insertAdjacentHTML('beforeend', '<div class="first-run-guide" data-testid="first-run-guide"><span>FIRST THREAD</span><strong>Enter Frayed Hollow</strong><p>Your basic strikes fire automatically. Watch enemy telegraphs and use skills when they matter.</p></div>');
    else if (!recentReward) dungeonEl.insertAdjacentHTML('beforeend', '<p class="loop-prompt" data-testid="loop-prompt"><strong>Your Weaver remembers.</strong> Return to the Hollow to test your stronger build.</p>');
    renderRewardReveal(data);
    if (recentReward) return;
    const canStart = !data.party || data.party.canStart;
    if (data.party && !data.party.canStart) dungeonEl.insertAdjacentHTML('beforeend', `<p data-testid="start-waiting">${data.party.isLeader ? 'All party members must be ready before the leader can start.' : 'Waiting for the party leader to start.'}</p>`);
    for (const [index, dungeon] of data.dungeons.entries()) {
      const row = document.createElement('div');
      row.className = 'item dungeon-card';
      row.dataset.testid = 'dungeon-option';
      row.innerHTML = `<div class="dungeon-art" aria-hidden="true"><span>✦</span></div><div class="dungeon-copy"><strong>${dungeon.name}</strong><span>${dungeon.arcTitle || 'Unknown arc'}</span><small>Recommended ${dungeon.recommendedPlayers} · Soloable · ${dungeon.minPlayers}–${dungeon.maxPlayers} players</small></div>`;
      if (canStart) {
        const testId = index === 0 ? 'start-dungeon' : `start-dungeon-${dungeon.id}`;
        const label = data.party ? `${firstRun ? 'Enter' : 'Run'} ${dungeon.name} · ${data.party.members.length} players` : `${firstRun ? 'Enter' : 'Run'} ${dungeon.name}${firstRun ? '' : ' Again'}`;
        row.append(button(label, async () => { recentReward = null; actionFeedback = null; await api(`/api/dungeons/${dungeon.id}/start`, { method: 'POST' }); await refresh(); }, testId, { className: 'primary-action' }));
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
    enemy.innerHTML = `${enemyVisual(run.enemy)}<div class="enemy-body"><div class="enemy-name"><span>${run.enemy.name}${run.enemy.isBoss ? '<small>BOSS</small>' : ''}</span><span>${run.enemy.hp}/${run.enemy.maxHp} HP</span></div>${progressBar(run.enemy.hp, run.enemy.maxHp)}</div>`;
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
    row.innerHTML = `<div class="participant-head"><span>${participant.displayName}${participant.guarding ? '<span class="guarding-badge">GUARDING</span>' : ''}</span><span>HP ${participant.hp}/${participant.maxHp}</span></div>${progressBar(participant.hp, participant.maxHp)}<div class="participant-stats">damage ${participant.contributionDamage} · healing ${participant.healingDone} · revives ${participant.revives} · prevented ${participant.damagePrevented} · threat ${participant.threat}</div>`;
    partyStrip.append(row);
  }
  dungeonEl.append(partyStrip);

  renderActionFeedback(run);

  if (['combat', 'boss'].includes(run.phase)) {
    if (run.viewer?.hp > 0) {
      const firstDecision = run.encounterIndex === 0 && run.viewer.contributionDamage === 0;
      if (firstDecision) dungeonEl.insertAdjacentHTML('beforeend', '<div class="combat-coach" data-testid="combat-coach"><strong>Auto Strike is active.</strong> Guard a telegraph, Interrupt it before the timer expires, or use support skills when your party needs them.</div>');
      const cadence = document.createElement('div');
      cadence.className = 'auto-attack-cadence';
      cadence.dataset.testid = 'auto-attack-status';
      cadence.innerHTML = `<span class="pulse-dot"></span><strong>AUTO STRIKE ON</strong><small>Basic hit every ${(AUTO_ATTACK_MS / 1000).toFixed(1)}s</small>`;
      dungeonEl.append(cadence);
      const actions = document.createElement('div');
      actions.className = 'actions combat-dock';
      actions.dataset.testid = 'combat-actions';
      actions.append(button('Strike now', async () => { await act('attack', `/api/runs/${run.id}/attack`, { method: 'POST' }); }, 'attack', { className: 'manual-strike' }));
      actions.append(button(run.enemyIntent ? 'Guard Heavy' : 'Guard', async () => { await act('guard', `/api/runs/${run.id}/guard`, { method: 'POST' }); }, 'guard', { className: 'skill-button guard-skill' }));
      dungeonEl.append(actions);
      renderSupportActions(run);
      dungeonEl.insertAdjacentHTML('beforeend', '<p class="muted" data-testid="combat-help">Basic strikes are automatic. Guard halves the hit it catches; Interrupt cancels telegraphed heavy attacks. Mend and Revive are co-op support skills.</p>');
    } else dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="defeated-player">You are down. An ally can Revive you, or your party can continue without you.</p>');
  }

  if (run.phase === 'upgrade') {
    if (run.isLeader) {
      dungeonEl.insertAdjacentHTML('beforeend', '<div class="choice-intro" data-testid="upgrade-intro"><span>RUN CHOICE</span><strong>Choose what the boss fight becomes.</strong><p>This choice lasts only for this dungeon run.</p></div>');
      const upgrades = document.createElement('div');
      upgrades.className = 'upgrade-grid';
      for (const upgrade of data.runUpgrades) {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        const effectText = upgrade.attackBonus > 0 ? `+${upgrade.attackBonus} attack for every strike this run.` : `Restore ${upgrade.heal} HP to every party member before the boss.`;
        card.innerHTML = `<span>${upgrade.attackBonus > 0 ? 'OFFENSE' : 'SURVIVAL'}</span><h3>${upgrade.name}</h3><p>${effectText}</p>`;
        card.append(button(upgrade.attackBonus > 0 ? `Choose +${upgrade.attackBonus} Attack` : `Choose +${upgrade.heal} HP`, async () => { await act('upgrade', `/api/runs/${run.id}/upgrade`, { method: 'POST', body: JSON.stringify({ upgradeId: upgrade.id }) }); }, `upgrade-${upgrade.id}`, { className: 'primary-action' }));
        upgrades.append(card);
      }
      dungeonEl.append(upgrades);
    } else dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="upgrade-waiting">Waiting for the party leader to choose the shared upgrade.</p>');
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
    row.innerHTML = `<div class="gear-card-top"><span class="rarity-badge">${meta.label} · T${meta.tier}</span>${equipped ? '<span class="equipped-chip">EQUIPPED</span>' : ''}</div><div class="gear-icon" aria-hidden="true">◇</div><h3>${item.name}</h3><p class="gear-power">+${item.attackBonus} Attack ${!equipped && delta ? `<small class="${delta > 0 ? 'positive' : 'negative'}">${delta > 0 ? '+' : ''}${delta} vs equipped</small>` : ''}</p><p><strong>${item.effect.name}</strong><br><span class="muted">${item.effect.description}</span></p>`;
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
      item.innerHTML = `<span class="achievement-medal">✦</span><div><strong>${achievement.name}</strong><p>${achievement.description}</p></div>`;
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
  if (newest) recentReward = { item: newest, dungeonId: previous.activeRun.dungeonId, attackBeforeEquip: previous.character.attackPower, equipped: newest.id === next.character.equippedItem?.id };
}

function scheduleAutoAttack(data) {
  clearTimeout(autoAttackTimer);
  autoAttackTimer = null;
  const run = data.activeRun;
  if (!run || !['combat', 'boss'].includes(run.phase) || !run.viewer || run.viewer.hp <= 0) return;
  autoAttackTimer = setTimeout(async () => {
    if (autoAttackBusy) return scheduleAutoAttack(lastDashboard || data);
    autoAttackBusy = true;
    try {
      await act('attack', `/api/runs/${run.id}/attack`, { method: 'POST' }, { quiet: true });
    } catch (error) {
      if (error.code !== 'stale_run_version' && error.status !== 409) setStatus(error.message);
      else await refresh({ quiet: true });
    } finally {
      autoAttackBusy = false;
      if (lastDashboard) scheduleAutoAttack(lastDashboard);
    }
  }, AUTO_ATTACK_MS);
}

async function doRefresh({ quiet = false } = {}) {
  const previous = lastDashboard;
  const data = await api('/api/dashboard');
  detectRemoteReward(previous, data);
  lastDashboard = data;
  if (!quiet) setStatus('Ready', { ready: true });
  else if (statusEl.textContent === 'Working…' || statusEl.textContent === 'Loading…') setStatus('Ready', { ready: true });

  const sourceLabel = data.authSource === 'local' ? 'Local Weaver' : 'Threaded Weaver';
  identityEl.innerHTML = `<div class="identity-pill"><span>${sourceLabel}</span><strong data-testid="threaded-user">${data.threadedUser.name || data.threadedUser.username || data.threadedUser.id}</strong><small data-testid="auth-source">${data.authSource}</small></div>`;
  characterEl.innerHTML = `<div class="section-heading"><span>YOUR WEAVER</span><h2>${data.character.displayName}</h2></div><div class="weaver-summary"><div class="weaver-avatar" aria-hidden="true"><span>W</span></div><div class="stat-strip"><div class="stat-chip attack-stat"><span>Attack</span><strong data-testid="attack-power">${data.character.attackPower}</strong></div><div class="stat-chip"><span>Health</span><strong>${data.character.maxHealth}</strong></div><div class="stat-chip dust-stat"><span>Dust</span><strong data-testid="thread-dust">${data.character.threadDust}</strong></div></div></div><p class="equipped-summary">Equipped: <strong data-testid="equipped-item">${data.character.equippedItem?.name || 'None'}</strong></p>`;
  renderDungeon(data);
  renderParty(data);
  renderGear(data);
  renderMetaSections(data);
  applyView(activeView);
  scheduleAutoAttack(data);
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
  clearTimeout(autoAttackTimer);
  clearInterval(intentTicker);
  sse?.close();
});

refresh().then(() => {
  connectRealtime();
  setInterval(() => refresh({ quiet: true }).catch(() => {}), 12000);
}).catch((error) => setStatus(error.message));
