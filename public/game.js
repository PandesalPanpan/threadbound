document.documentElement.classList.add('threadbound-player-root');
document.body.classList.add('threadbound-player');
const gameStyles = document.createElement('link');
gameStyles.rel = 'stylesheet';
gameStyles.href = '/game.css';
document.head.append(gameStyles);
const feelStyles = document.createElement('link');
feelStyles.rel = 'stylesheet';
feelStyles.href = '/game-feel.css';
document.head.append(feelStyles);

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

let lastDashboard = null;
let actionFeedback = null;
let recentReward = null;

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

function achievementUnlocked(data, name) {
  return data.achievements.some((achievement) => achievement.name === name);
}

function feedbackFromOutcome(type, outcome) {
  const events = outcome.events || [];
  const defeated = events.find((event) => event.type === 'EnemyDefeated');
  const damagedPlayer = events.find((event) => event.type === 'PlayerDamaged');
  const healed = events.find((event) => event.type === 'PlayerHealed');
  const revived = events.find((event) => event.type === 'PlayerRevived');

  if (type === 'attack') {
    return {
      type: 'attack',
      damage: outcome.damage || 0,
      retaliation: outcome.retaliation || damagedPlayer?.damage || 0,
      title: defeated ? `${defeated.isBoss ? 'Boss' : 'Enemy'} defeated` : `${outcome.damage || 0} damage`,
      detail: defeated
        ? (outcome.reward ? 'The Hollow yields a relic.' : 'The path opens deeper into the Hollow.')
        : (outcome.retaliation ? `The enemy retaliates for ${outcome.retaliation}.` : 'Clean hit. No retaliation.'),
    };
  }

  if (type === 'guard') {
    const prevented = Math.max(0, (damagedPlayer?.rawDamage || outcome.retaliation || 0) - (damagedPlayer?.damage || outcome.retaliation || 0));
    return {
      type: 'guard',
      retaliation: outcome.retaliation || 0,
      prevented,
      title: prevented > 0 ? `Guard absorbed ${prevented}` : 'Guard raised',
      detail: outcome.retaliation ? `You take ${outcome.retaliation} while holding the line.` : 'You brace for the next retaliation.',
    };
  }

  if (type === 'mend') {
    return { type: 'support', title: `Mended ${outcome.healed || healed?.amount || 0} HP`, detail: outcome.retaliation ? `The enemy retaliates for ${outcome.retaliation}.` : 'Ally restored.' };
  }

  if (type === 'revive') {
    return { type: 'support', title: 'Ally revived', detail: `Restored ${outcome.restoredHp || revived?.restoredHp || 0} HP.` };
  }

  if (type === 'upgrade') {
    return { type: 'upgrade', title: 'The weave changes', detail: 'Your choice lasts for the rest of this run.' };
  }

  return null;
}

async function act(type, path, options = {}) {
  const outcome = await api(path, options);
  actionFeedback = feedbackFromOutcome(type, outcome);
  if (outcome.reward) {
    recentReward = {
      item: outcome.reward,
      dungeonId: outcome.state?.dungeonId || 'frayed-hollow',
      attackBeforeEquip: lastDashboard?.character?.attackPower ?? null,
      equipped: false,
    };
  }
  await refresh();
  return outcome;
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
      await act('mend', `/api/runs/${run.id}/mend`, { method: 'POST', body: JSON.stringify({ targetPlayerId: select.value }) });
    }, 'mend'));
  } else {
    support.insertAdjacentHTML('beforeend', `<span class="muted" data-testid="mend-unavailable">${viewer.mendCharges > 0 ? 'No ally currently needs Mend.' : 'Mend used for this encounter.'}</span>`);
  }

  if (downed.length > 0 && viewer.reviveCharges > 0) {
    const select = targetSelect(downed, 'revive-target');
    support.append(select);
    support.append(button(`Revive · ${viewer.reviveCharges} charge`, async () => {
      await act('revive', `/api/runs/${run.id}/revive`, { method: 'POST', body: JSON.stringify({ targetPlayerId: select.value }) });
    }, 'revive'));
  } else {
    support.insertAdjacentHTML('beforeend', `<span class="muted" data-testid="revive-unavailable">${viewer.reviveCharges > 0 ? 'No ally is down.' : 'Revive used for this run.'}</span>`);
  }
  dungeonEl.append(support);
}

function renderActionFeedback(run) {
  if (!actionFeedback) return;
  const feedback = document.createElement('div');
  feedback.className = `combat-feedback ${actionFeedback.type}`;
  feedback.dataset.testid = 'combat-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
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

function renderRewardReveal(data) {
  if (!recentReward) return;
  const { item } = recentReward;
  const reveal = document.createElement('div');
  reveal.className = `reward-reveal ${item.rarity || 'common'}`;
  reveal.dataset.testid = 'reward-reveal';
  const currentAttack = data.character.attackPower;
  const comparison = recentReward.equipped && recentReward.attackBeforeEquip !== null
    ? `<p class="power-gain" data-testid="reward-power-gain">Attack ${recentReward.attackBeforeEquip} → <strong>${currentAttack}</strong></p>`
    : `<p class="muted">+${item.attackBonus} permanent attack while equipped</p>`;
  reveal.innerHTML = `
    <span class="reward-kicker">Relic recovered · ${(item.rarity || 'common').toUpperCase()}</span>
    <h3 data-testid="reward-name">${item.name}</h3>
    ${comparison}
    <p><strong>${item.effect?.name || 'Plain Weave'}</strong> — ${item.effect?.description || 'No special combat effect.'}</p>
  `;

  const actions = document.createElement('div');
  actions.className = 'reward-actions';
  if (!recentReward.equipped) {
    actions.append(button('Equip now', async () => {
      await api(`/api/items/${item.id}/equip`, { method: 'POST' });
      recentReward.equipped = true;
      actionFeedback = { type: 'reward', title: `${item.name} equipped`, detail: 'Your permanent attack has increased.' };
      await refresh();
    }, 'reward-equip'));
  }

  const canRunAgain = !data.party || data.party.canStart;
  if (canRunAgain) {
    actions.append(button('Run Frayed Hollow again', async () => {
      const dungeonId = recentReward.dungeonId;
      recentReward = null;
      actionFeedback = null;
      await api(`/api/dungeons/${dungeonId}/start`, { method: 'POST' });
      await refresh();
    }, 'run-again'));
  } else {
    actions.insertAdjacentHTML('beforeend', '<span class="muted">Ready the party to run again.</span>');
  }
  reveal.append(actions);
  dungeonEl.append(reveal);
}

function renderDungeon(data) {
  dungeonEl.innerHTML = '<h2>Dungeon</h2>';
  if (!data.activeRun) {
    const firstRun = !achievementUnlocked(data, 'Hollow Cleared');
    if (firstRun) {
      dungeonEl.insertAdjacentHTML('beforeend', `
        <div class="first-run-guide" data-testid="first-run-guide">
          <span>FIRST THREAD</span>
          <strong>Enter Frayed Hollow</strong>
          <p>Fight through three encounters, choose one run upgrade, then defeat the boss and claim your first relic.</p>
        </div>
      `);
    } else if (!recentReward) {
      dungeonEl.insertAdjacentHTML('beforeend', '<p class="loop-prompt" data-testid="loop-prompt"><strong>Your Weaver remembers.</strong> Return to the Hollow to test your stronger build.</p>');
    }

    renderRewardReveal(data);

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
        const firstDungeon = index === 0;
        const label = data.party
          ? `${firstRun ? 'Enter' : 'Run'} ${dungeon.name} · ${data.party.members.length} players`
          : `${firstRun ? 'Enter' : 'Run'} ${dungeon.name}${firstRun ? '' : ' Again'}`;
        const testId = firstDungeon ? 'start-dungeon' : `start-dungeon-${dungeon.id}`;
        row.append(document.createElement('br'));
        row.append(button(label, async () => {
          recentReward = null;
          actionFeedback = null;
          await api(`/api/dungeons/${dungeon.id}/start`, { method: 'POST' });
          await refresh();
        }, testId));
      }
      dungeonEl.append(row);
    }
    return;
  }

  const run = data.activeRun;
  const summary = document.createElement('p');
  summary.className = 'run-summary';
  summary.dataset.testid = 'run-state';
  summary.innerHTML = `<span class="phase-chip">Phase: ${run.phase}</span><span>v${run.version} · ${run.participants.length} player${run.participants.length === 1 ? '' : 's'}${run.enemy ? ` · ${run.enemy.name} ${run.enemy.hp}/${run.enemy.maxHp}` : ''}</span>`;
  dungeonEl.append(summary);
  dungeonEl.insertAdjacentHTML('beforeend', `<p class="muted" data-testid="run-scaling">Enemy HP ×${run.scaling.enemyHealthMultiplier} · retaliation ×${run.scaling.retaliationMultiplier}</p>`);

  if (run.enemy) {
    const enemy = document.createElement('div');
    enemy.className = 'enemy-card';
    enemy.dataset.testid = 'enemy-card';
    enemy.innerHTML = `<div class="enemy-name"><span>${run.enemy.name}${run.enemy.isBoss ? '<small>BOSS</small>' : ''}</span><span>${run.enemy.hp}/${run.enemy.maxHp} HP</span></div>${progressBar(run.enemy.hp, run.enemy.maxHp)}`;
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

  renderActionFeedback(run);

  if (['combat', 'boss'].includes(run.phase)) {
    if (run.viewer?.hp > 0) {
      const firstDecision = run.encounterIndex === 0 && run.viewer.contributionDamage === 0;
      if (firstDecision) {
        dungeonEl.insertAdjacentHTML('beforeend', '<div class="combat-coach" data-testid="combat-coach"><strong>Strike</strong> hurts the enemy but draws retaliation. <strong>Guard</strong> halves the next hit that lands on you.</div>');
      }
      const actions = document.createElement('div');
      actions.className = 'actions combat-dock';
      actions.dataset.testid = 'combat-actions';
      actions.append(button('Strike', async () => { await act('attack', `/api/runs/${run.id}/attack`, { method: 'POST' }); }, 'attack'));
      actions.append(button('Guard', async () => { await act('guard', `/api/runs/${run.id}/guard`, { method: 'POST' }); }, 'guard'));
      dungeonEl.append(actions);
      renderSupportActions(run);
      dungeonEl.insertAdjacentHTML('beforeend', '<p class="muted" data-testid="combat-help">Guard adds threat and halves the next retaliation that hits you. Mend heals an ally once per encounter. Revive restores a downed ally once per run.</p>');
    } else {
      dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="defeated-player">You are down. An ally can Revive you, or your party can continue without you.</p>');
    }
  }

  if (run.phase === 'upgrade') {
    if (run.isLeader) {
      dungeonEl.insertAdjacentHTML('beforeend', '<div class="choice-intro" data-testid="upgrade-intro"><span>RUN CHOICE</span><strong>Choose what the boss fight becomes.</strong><p>This choice lasts only for this dungeon run.</p></div>');
      const upgrades = document.createElement('div');
      upgrades.className = 'upgrade-grid';
      for (const upgrade of data.runUpgrades) {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        const effectText = upgrade.attackBonus > 0
          ? `+${upgrade.attackBonus} attack for every strike this run.`
          : `Restore ${upgrade.heal} HP to every party member before the boss.`;
        card.innerHTML = `<h3>${upgrade.name}</h3><p>${effectText}</p>`;
        card.append(button(upgrade.attackBonus > 0 ? `Choose +${upgrade.attackBonus} Attack` : `Choose +${upgrade.heal} HP`, async () => {
          await act('upgrade', `/api/runs/${run.id}/upgrade`, { method: 'POST', body: JSON.stringify({ upgradeId: upgrade.id }) });
        }, `upgrade-${upgrade.id}`));
        upgrades.append(card);
      }
      dungeonEl.append(upgrades);
    } else {
      dungeonEl.insertAdjacentHTML('beforeend', '<p data-testid="upgrade-waiting">Waiting for the party leader to choose the shared upgrade.</p>');
    }
  }
}

async function refresh() {
  const data = await api('/api/dashboard');
  lastDashboard = data;
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

  achievementsEl.innerHTML = `<h2>Achievements</h2>${data.achievements.length ? `<ul>${data.achievements.map((achievement) => `<li data-testid="achievement"><strong>${achievement.name}</strong> — ${achievement.description}</li>`).join('')}</ul>` : '<p class="muted">Your first milestones will appear here.</p>'}`;
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
