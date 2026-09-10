import { enemySprite, weaverSprite } from './sprite-catalog.js';

const streamEl = document.querySelector('#stream');

if (streamEl) {
  streamEl.innerHTML = `
    <div class="section-heading stream-heading">
      <div><span>LIVE THREAD</span><h2>Adventure Stream</h2></div>
      <small data-testid="stream-connection">Connecting…</small>
    </div>
    <p class="stream-hint">Message your party or use the suggested actions. Type <strong>/</strong> to play entirely through the thread.</p>
    <section class="stream-combat-dock" data-testid="stream-combat-dock" aria-label="Live combat controls" hidden></section>
    <div class="adventure-stream-log" data-testid="adventure-stream-log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <section class="stream-command-card" data-testid="stream-command-card" aria-live="polite" hidden></section>
    <div class="stream-suggestions" data-testid="stream-suggestions" aria-label="Suggested actions"></div>
    <form class="adventure-stream-composer" data-testid="stream-composer">
      <label class="sr-only" for="stream-message">Message the shared stream or type a command</label>
      <input id="stream-message" data-testid="stream-message" maxlength="500" autocomplete="off" placeholder="Message party or /command…">
      <button type="submit" data-testid="stream-send" aria-label="Send message">›</button>
    </form>
    <p class="stream-error" data-testid="stream-error" role="alert" hidden></p>
  `;

  const logEl = streamEl.querySelector('[data-testid="adventure-stream-log"]');
  const combatDockEl = streamEl.querySelector('[data-testid="stream-combat-dock"]');
  const commandCardEl = streamEl.querySelector('[data-testid="stream-command-card"]');
  const suggestionsEl = streamEl.querySelector('[data-testid="stream-suggestions"]');
  const formEl = streamEl.querySelector('[data-testid="stream-composer"]');
  const inputEl = streamEl.querySelector('[data-testid="stream-message"]');
  const sendEl = streamEl.querySelector('[data-testid="stream-send"]');
  const connectionEl = streamEl.querySelector('[data-testid="stream-connection"]');
  const errorEl = streamEl.querySelector('[data-testid="stream-error"]');
  const seen = new Set();
  const bufferedEntries = [];
  let initialLoaded = false;
  let socket = null;
  let source = null;
  let reconnectTimer = null;
  let dashboard = null;
  let contextRefreshTimer = null;
  let activeLocalCommand = null;

  function showError(message = '') {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function timeLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function setConnection(label, { live = false } = {}) {
    connectionEl.textContent = label;
    connectionEl.classList.toggle('is-live', live);
  }

  function updateEmptyState() {
    const hasEntries = Boolean(logEl.querySelector('.stream-entry'));
    logEl.classList.toggle('is-empty', !hasEntries);
    const existing = logEl.querySelector('[data-testid="stream-empty"]');
    if (hasEntries) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const empty = document.createElement('div');
    empty.className = 'stream-empty';
    empty.dataset.testid = 'stream-empty';
    empty.innerHTML = '<strong>The thread is quiet.</strong><span>Say hello, type /status, or enter a dungeon. Activity appears here live.</span>';
    logEl.append(empty);
  }

  function appendEntry(entry, { initial = false } = {}) {
    if (!entry?.id || seen.has(entry.id)) return;
    seen.add(entry.id);
    logEl.querySelector('[data-testid="stream-empty"]')?.remove();
    logEl.classList.remove('is-empty');
    const row = document.createElement('article');
    row.dataset.entryId = entry.id;
    row.dataset.testid = entry.kind === 'chat' ? 'stream-chat-entry' : 'stream-system-entry';
    row.className = `stream-entry stream-entry-${entry.kind}`;

    const avatar = document.createElement('span');
    avatar.className = 'stream-avatar';
    avatar.textContent = entry.kind === 'chat' ? (entry.actorName || '?').slice(0, 1).toUpperCase() : '✦';

    const content = document.createElement('div');
    content.className = 'stream-entry-content';
    const meta = document.createElement('div');
    meta.className = 'stream-entry-meta';
    const author = document.createElement('strong');
    author.textContent = entry.kind === 'chat' ? (entry.actorName || 'Unknown Weaver') : 'THREADBOUND';
    const time = document.createElement('time');
    time.dateTime = entry.createdAt || '';
    time.textContent = timeLabel(entry.createdAt);
    meta.append(author, time);

    const body = document.createElement('p');
    body.textContent = entry.body || '';
    content.append(meta, body);
    if (entry.kind === 'system' && entry.eventType) {
      const tag = document.createElement('span');
      tag.className = 'stream-system-tag';
      tag.textContent = entry.eventType.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
      content.append(tag);
    }
    row.append(avatar, content);
    logEl.append(row);
    if (!initial || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 180) logEl.scrollTop = logEl.scrollHeight;
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

  function rarityLabel(item) {
    return String(item?.rarity || 'common').toUpperCase();
  }

  function spriteForEnemy(enemy) {
    return enemySprite(enemy);
  }

  function clearCommandCard() {
    activeLocalCommand = null;
    commandCardEl.hidden = true;
    commandCardEl.innerHTML = '';
  }

  function openCommandCard(command, title, subtitle = '') {
    activeLocalCommand = command;
    commandCardEl.hidden = false;
    commandCardEl.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'thread-reply-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = `PRIVATE THREAD REPLY · /${command}`;
    const heading = document.createElement('strong');
    heading.textContent = title;
    copy.append(kicker, heading);
    if (subtitle) {
      const small = document.createElement('small');
      small.textContent = subtitle;
      copy.append(small);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss private thread reply');
    close.textContent = '×';
    close.addEventListener('click', clearCommandCard);
    header.append(copy, close);
    commandCardEl.append(header);
    return commandCardEl;
  }

  function addActionButton(container, label, action, { testId = null, className = '', disabled = false } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.className = className;
    if (testId) button.dataset.testid = testId;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      showError('');
      try {
        await action();
      } catch (error) {
        showError(error.message);
      } finally {
        button.disabled = false;
      }
    });
    container.append(button);
    return button;
  }

  function renderStatusCard() {
    if (!dashboard) return;
    const run = dashboard.activeRun;
    const viewer = run?.viewer;
    const enemy = run?.enemy;
    const card = openCommandCard('status', 'Current adventure', run ? `${run.dungeonDefinition?.name || run.dungeonId} · ${run.phase}` : 'Not currently in a dungeon');
    const grid = document.createElement('div');
    grid.className = 'thread-status-grid';

    const hero = document.createElement('article');
    hero.className = 'thread-status-unit';
    hero.innerHTML = `<img src="${weaverSprite(dashboard.character.id)}" alt="" class="thread-sprite" data-testid="stream-weaver-sprite"><div><span>YOU</span><strong></strong><small></small></div>`;
    hero.querySelector('strong').textContent = dashboard.character.displayName;
    hero.querySelector('small').textContent = `HP ${viewer?.hp ?? dashboard.character.maxHealth}/${viewer?.maxHp ?? dashboard.character.maxHealth} · ATK ${dashboard.character.attackPower}`;
    grid.append(hero);

    if (enemy) {
      const foe = document.createElement('article');
      foe.className = 'thread-status-unit enemy';
      const image = document.createElement('img');
      image.src = spriteForEnemy(enemy);
      image.alt = '';
      image.className = 'thread-sprite';
      const info = document.createElement('div');
      const label = document.createElement('span');
      label.textContent = enemy.isBoss ? 'BOSS' : 'ENEMY';
      const name = document.createElement('strong');
      name.textContent = enemy.name;
      const hp = document.createElement('small');
      hp.textContent = `HP ${enemy.hp}/${enemy.maxHp}${run.enemyIntent ? ` · ${run.enemyIntent.name} incoming` : ''}`;
      info.append(label, name, hp);
      foe.append(image, info);
      grid.append(foe);
    }
    card.append(grid);

    const equipped = dashboard.character.equippedItem;
    const loadout = document.createElement('div');
    loadout.className = 'thread-loadout-line';
    loadout.innerHTML = '<img src="/sprites/relic.svg" alt=""><div><span>EQUIPPED</span><strong></strong><small></small></div>';
    loadout.querySelector('strong').textContent = equipped?.name || 'No relic equipped';
    loadout.querySelector('small').textContent = equipped ? `${rarityLabel(equipped)} · +${equipped.attackBonus} attack · ${equipped.effect?.name || 'No effect'}` : `${dashboard.character.threadDust} Thread Dust available`;
    card.append(loadout);
  }

  function salvageValue(item) {
    const base = { common: 4, uncommon: 7, rare: 12, epic: 20, legendary: 32 }[String(item.rarity || '').toLowerCase()] ?? 4;
    return base + Math.max(0, Math.floor(Number(item.attackBonus || 0) / 2));
  }

  function renderGearCard() {
    if (!dashboard) return;
    const card = openCommandCard('gear', 'Relic pouch', `${dashboard.inventory.length} item${dashboard.inventory.length === 1 ? '' : 's'} · ${dashboard.character.threadDust} Thread Dust`);
    if (!dashboard.inventory.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No relics yet. Clear a dungeon and recovered gear will appear here.';
      card.append(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'thread-gear-list';
    const equippedId = dashboard.character.equippedItem?.id;
    for (const item of dashboard.inventory) {
      const equipped = item.id === equippedId;
      const row = document.createElement('article');
      row.className = `thread-gear-row rarity-${String(item.rarity || 'common').toLowerCase()}`;
      row.dataset.testid = 'stream-gear-item';
      const image = document.createElement('img');
      image.src = '/sprites/relic.svg';
      image.alt = '';
      image.className = 'thread-sprite small';
      const copy = document.createElement('div');
      copy.className = 'thread-gear-copy';
      const top = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = item.name;
      const rarity = document.createElement('span');
      rarity.textContent = `${rarityLabel(item)}${equipped ? ' · EQUIPPED' : ''}`;
      top.append(name, rarity);
      const stats = document.createElement('small');
      stats.textContent = `+${item.attackBonus} attack · ${item.effect?.name || 'No effect'}`;
      copy.append(top, stats);
      const actions = document.createElement('div');
      actions.className = 'thread-gear-actions';
      if (!equipped) {
        addActionButton(actions, 'Equip', async () => {
          await api(`/api/items/${encodeURIComponent(item.id)}/equip`, { method: 'POST' });
          await refreshContext({ rerenderCommand: true });
        }, { testId: `stream-equip-${item.id}`, className: 'primary-action' });
        const salvage = addActionButton(actions, `Salvage +${salvageValue(item)} Dust`, async () => {
          if (salvage.dataset.confirmed !== 'true') {
            salvage.dataset.confirmed = 'true';
            salvage.textContent = `Confirm salvage +${salvageValue(item)} Dust`;
            salvage.disabled = false;
            return;
          }
          await api(`/api/items/${encodeURIComponent(item.id)}/salvage`, { method: 'POST' });
          await refreshContext({ rerenderCommand: true });
        }, { testId: `stream-salvage-${item.id}`, className: 'salvage-action' });
      } else {
        const badge = document.createElement('span');
        badge.className = 'thread-equipped-badge';
        badge.textContent = 'In use · equip another relic before salvaging';
        actions.append(badge);
      }
      row.append(image, copy, actions);
      list.append(row);
    }
    card.append(list);
  }

  function renderPartyCard() {
    if (!dashboard) return;
    const party = dashboard.party;
    const card = openCommandCard('party', party ? 'Party thread' : 'Adventure party', party ? `${party.members.length} Weaver${party.members.length === 1 ? '' : 's'} · code ${party.joinCode}` : 'Create a party or join with a code');
    if (party) {
      const members = document.createElement('div');
      members.className = 'thread-party-list';
      for (const member of party.members) {
        const row = document.createElement('div');
        row.className = 'thread-party-member';
        row.textContent = `${member.displayName} · ${member.ready ? 'Ready' : 'Not ready'}`;
        members.append(row);
      }
      card.append(members);
      const actions = document.createElement('div');
      actions.className = 'thread-card-actions';
      const viewer = party.members.find((member) => member.playerId === dashboard.character.id);
      addActionButton(actions, viewer?.ready ? 'Unready' : 'Ready', async () => {
        await api('/api/party/ready', { method: 'POST', body: JSON.stringify({ ready: !viewer?.ready }) });
        await refreshContext({ rerenderCommand: true });
      });
      addActionButton(actions, 'Leave party', async () => {
        await api('/api/party/leave', { method: 'POST' });
        await refreshContext({ rerenderCommand: true });
      });
      card.append(actions);
    } else {
      const actions = document.createElement('div');
      actions.className = 'thread-party-join';
      addActionButton(actions, 'Create party', async () => {
        await api('/api/party/create', { method: 'POST' });
        await refreshContext({ rerenderCommand: true });
      }, { className: 'primary-action' });
      const input = document.createElement('input');
      input.placeholder = 'Join code';
      input.maxLength = 12;
      input.dataset.testid = 'stream-party-code';
      actions.append(input);
      addActionButton(actions, 'Join', async () => {
        await api('/api/party/join', { method: 'POST', body: JSON.stringify({ joinCode: input.value.trim() }) });
        await refreshContext({ rerenderCommand: true });
      });
      card.append(actions);
    }
  }

  async function renderCodexCard(query = '') {
    const card = openCommandCard('codex', 'Living Codex', 'Search without leaving the adventure thread');
    const toolbar = document.createElement('form');
    toolbar.className = 'thread-codex-search';
    const input = document.createElement('input');
    input.value = query;
    input.placeholder = 'Search relics, enemies, lore…';
    input.dataset.testid = 'stream-codex-search';
    const button = document.createElement('button');
    button.textContent = 'Search';
    toolbar.append(input, button);
    card.append(toolbar);
    const results = document.createElement('div');
    results.className = 'thread-codex-results';
    card.append(results);
    const load = async (value) => {
      results.textContent = 'Searching…';
      const payload = await api(`/api/codex?category=all&q=${encodeURIComponent(value)}`);
      results.innerHTML = '';
      for (const entry of payload.entries.slice(0, 6)) {
        const row = document.createElement('article');
        const category = document.createElement('span');
        category.textContent = entry.category.toUpperCase();
        const title = document.createElement('strong');
        title.textContent = entry.title;
        const summary = document.createElement('small');
        summary.textContent = entry.summary;
        row.append(category, title, summary);
        results.append(row);
      }
      if (!payload.entries.length) results.textContent = 'No Codex records matched.';
    };
    toolbar.addEventListener('submit', (event) => {
      event.preventDefault();
      load(input.value.trim()).catch((error) => showError(error.message));
    });
    await load(query);
  }

  async function runCombatAction(action, targetPlayerId = null) {
    const run = dashboard?.activeRun;
    if (!run) throw new Error('No active dungeon.');
    const options = { method: 'POST' };
    if (targetPlayerId) options.body = JSON.stringify({ targetPlayerId });
    await api(`/api/runs/${encodeURIComponent(run.id)}/${action}`, options);
    await refreshContext({ rerenderCommand: activeLocalCommand === 'status' });
  }

  function addSuggestion(label, command, { primary = false, testId = null } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = primary ? 'is-primary' : '';
    button.dataset.command = command;
    if (testId) button.dataset.testid = testId;
    button.addEventListener('click', () => executeCommand(command));
    suggestionsEl.append(button);
  }

  function renderSuggestions() {
    suggestionsEl.innerHTML = '';
    if (!dashboard) return;
    const run = dashboard.activeRun;
    if (!run) {
      const dungeon = dashboard.dungeons?.[0];
      if (dungeon && (!dashboard.party || dashboard.party.canStart)) addSuggestion(`Enter ${dungeon.name}`, `/run ${dungeon.id}`, { primary: true, testId: 'stream-start-dungeon' });
    } else if (['combat', 'boss'].includes(run.phase) && run.viewer?.hp > 0) {
      addSuggestion('Attack now', '/attack', { primary: true, testId: 'stream-attack' });
      addSuggestion(run.enemyIntent ? 'Guard heavy' : 'Guard', '/guard', { testId: 'stream-guard' });
      if (run.enemyIntent) addSuggestion(`Interrupt ${run.enemyIntent.name}`, '/interrupt', { primary: true, testId: 'stream-interrupt' });
      if (run.viewer.mendCharges > 0 && run.participants.some((p) => p.hp > 0 && p.hp < p.maxHp)) addSuggestion('Mend ally', '/mend');
      if (run.viewer.reviveCharges > 0 && run.participants.some((p) => p.hp <= 0)) addSuggestion('Revive ally', '/revive');
    } else if (run.phase === 'upgrade' && run.isLeader) {
      for (const upgrade of dashboard.runUpgrades || []) addSuggestion(upgrade.name, `/upgrade ${upgrade.id}`, { primary: true });
    }
    addSuggestion('Status', '/status');
    addSuggestion('Gear', '/gear');
    addSuggestion('Party', '/party');
    addSuggestion('Codex', '/codex');
  }

  function renderCombatDock() {
    const run = dashboard?.activeRun;
    if (!run || !['combat', 'boss'].includes(run.phase)) {
      combatDockEl.hidden = true;
      combatDockEl.innerHTML = '';
      return;
    }
    combatDockEl.hidden = false;
    combatDockEl.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'stream-combat-header';
    const visual = document.createElement('img');
    visual.src = spriteForEnemy(run.enemy);
    visual.alt = '';
    visual.className = 'stream-enemy-sprite';
    const title = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = run.viewer?.hp > 0 ? 'LIVE ENCOUNTER' : 'DOWNED';
    const name = document.createElement('strong');
    name.textContent = run.enemy?.name || 'Encounter';
    const hp = document.createElement('small');
    hp.dataset.testid = 'stream-combat-status';
    hp.textContent = run.viewer?.hp > 0
      ? `You ${run.viewer.hp}/${run.viewer.maxHp} HP · ${run.enemy?.hp ?? 0}/${run.enemy?.maxHp ?? 0} enemy HP · Auto Strike ON`
      : 'Waiting for an ally to revive you.';
    title.append(kicker, name, hp);
    header.append(visual, title);
    combatDockEl.append(header);
    if (run.enemyIntent) {
      const intent = document.createElement('div');
      intent.className = 'stream-intent';
      intent.textContent = `${run.enemyIntent.name} incoming · ${run.enemyIntent.damage} damage`;
      combatDockEl.append(intent);
    }
    const actions = document.createElement('div');
    actions.className = 'stream-combat-actions';
    actions.dataset.testid = 'stream-combat-actions';
    const matching = suggestionsEl.querySelectorAll('button[data-command^="/attack"], button[data-command^="/guard"], button[data-command^="/interrupt"], button[data-command^="/mend"], button[data-command^="/revive"]');
    for (const suggestion of matching) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = suggestion.textContent;
      button.dataset.testid = suggestion.dataset.testid || `stream-${suggestion.dataset.command.slice(1).split(' ')[0]}`;
      button.addEventListener('click', () => executeCommand(suggestion.dataset.command));
      actions.append(button);
    }
    if (actions.children.length) combatDockEl.append(actions);
  }

  async function refreshContext({ rerenderCommand = false } = {}) {
    dashboard = await api('/api/dashboard');
    renderSuggestions();
    renderCombatDock();
    if (rerenderCommand && activeLocalCommand === 'gear') renderGearCard();
    else if (rerenderCommand && activeLocalCommand === 'status') renderStatusCard();
    else if (rerenderCommand && activeLocalCommand === 'party') renderPartyCard();
  }

  function scheduleContextRefresh() {
    clearTimeout(contextRefreshTimer);
    contextRefreshTimer = setTimeout(() => refreshContext({ rerenderCommand: Boolean(activeLocalCommand && activeLocalCommand !== 'codex') }).catch(() => {}), 60);
  }

  async function executeCommand(raw) {
    const [name, ...args] = String(raw || '').trim().split(/\s+/);
    const command = name.toLowerCase();
    showError('');
    if (!dashboard) await refreshContext();
    try {
      switch (command) {
        case '/':
        case '/help':
          openCommandCard('help', 'Thread commands', 'Tap a suggestion or type one directly.');
          commandCardEl.insertAdjacentHTML('beforeend', '<p><strong>/status</strong> HP + enemy · <strong>/item</strong> equip/salvage · <strong>/party</strong> co-op · <strong>/codex</strong> search · <strong>/strike</strong> <strong>/guard</strong> <strong>/interrupt</strong> during combat.</p>');
          break;
        case '/status': renderStatusCard(); break;
        case '/gear':
        case '/item':
        case '/inventory': renderGearCard(); break;
        case '/party': renderPartyCard(); break;
        case '/codex': await renderCodexCard(args.join(' ')); break;
        case '/attack':
        case '/strike': await runCombatAction('attack'); break;
        case '/guard': await runCombatAction('guard'); break;
        case '/interrupt': await runCombatAction('interrupt'); break;
        case '/mend': {
          const run = dashboard.activeRun;
          const target = run?.participants.find((p) => p.hp > 0 && p.hp < p.maxHp && p.playerId !== run.viewer?.playerId) || run?.participants.find((p) => p.hp > 0 && p.hp < p.maxHp);
          if (!target) throw new Error('No wounded party member needs Mend.');
          await runCombatAction('mend', target.playerId);
          break;
        }
        case '/revive': {
          const target = dashboard.activeRun?.participants.find((p) => p.hp <= 0);
          if (!target) throw new Error('No downed party member needs Revive.');
          await runCombatAction('revive', target.playerId);
          break;
        }
        case '/run': {
          const dungeonId = args[0] || dashboard.dungeons?.[0]?.id;
          if (!dungeonId) throw new Error('No dungeon is available.');
          await api(`/api/dungeons/${encodeURIComponent(dungeonId)}/start`, { method: 'POST' });
          await refreshContext({ rerenderCommand: activeLocalCommand === 'status' });
          break;
        }
        case '/upgrade': {
          const upgradeId = args[0];
          if (!upgradeId || !dashboard.activeRun) throw new Error('Choose an available run upgrade.');
          await api(`/api/runs/${encodeURIComponent(dashboard.activeRun.id)}/upgrade`, { method: 'POST', body: JSON.stringify({ upgradeId }) });
          await refreshContext({ rerenderCommand: activeLocalCommand === 'status' });
          break;
        }
        default: throw new Error(`Unknown command: ${command}. Type /help for actions.`);
      }
    } catch (error) {
      showError(error.message);
    }
  }

  function handleRealtimePayload(payload) {
    if (payload.type === 'connected') {
      const transport = payload.transport === 'websocket' ? 'WebSocket live' : 'Live';
      setConnection(transport, { live: true });
      return;
    }
    if (payload.type === 'state_changed') {
      scheduleContextRefresh();
      return;
    }
    if (payload.type === 'stream_entry') {
      if (!initialLoaded) bufferedEntries.push(payload.entry);
      else appendEntry(payload.entry);
    }
  }

  async function loadInitial() {
    const response = await fetch('/api/stream?limit=100', { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Could not load the adventure stream.');
    for (const entry of payload.entries || []) appendEntry(entry, { initial: true });
    initialLoaded = true;
    for (const entry of bufferedEntries.splice(0)) appendEntry(entry);
    updateEmptyState();
    logEl.scrollTop = logEl.scrollHeight;
    await refreshContext();
  }

  inputEl.addEventListener('input', () => {
    const commandMode = inputEl.value.trimStart().startsWith('/');
    sendEl.textContent = '›';
    sendEl.setAttribute('aria-label', commandMode ? 'Run command' : 'Send message');
    suggestionsEl.classList.toggle('command-mode', commandMode);
  });

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = inputEl.value.trim();
    if (!body || sendEl.disabled) return;
    if (body.startsWith('/')) {
      inputEl.value = '';
      sendEl.textContent = '›';
      await executeCommand(body);
      inputEl.focus();
      return;
    }
    sendEl.disabled = true;
    inputEl.disabled = true;
    showError('');
    try {
      const payload = await api('/api/stream/messages', { method: 'POST', body: JSON.stringify({ body }) });
      appendEntry(payload.entry);
      inputEl.value = '';
    } catch (error) {
      showError(error.message);
    } finally {
      inputEl.disabled = false;
      sendEl.disabled = false;
      inputEl.focus();
    }
  });

  function connectSseFallback() {
    return new Promise((resolve) => {
      if (!('EventSource' in window)) {
        setConnection('Polling fallback');
        resolve();
        return;
      }
      source?.close();
      source = new EventSource('/api/events');
      source.onopen = () => {
        setConnection('SSE live', { live: true });
        resolve();
      };
      source.onmessage = (event) => {
        let payload;
        try { payload = JSON.parse(event.data); } catch { return; }
        handleRealtimePayload(payload);
      };
      source.onerror = () => setConnection('Reconnecting…');
    });
  }

  async function connectWebSocket() {
    if (!('WebSocket' in window)) return connectSseFallback();
    clearTimeout(reconnectTimer);
    setConnection('Connecting…');
    try {
      const response = await fetch('/api/realtime-token', { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload.token) throw new Error(payload.message || 'Realtime token unavailable.');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket?.close();
      socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(payload.token)}`);
      await new Promise((resolve, reject) => {
        let opened = false;
        socket.addEventListener('open', () => {
          opened = true;
          source?.close();
          source = null;
          setConnection('WebSocket live', { live: true });
          resolve();
        }, { once: true });
        socket.addEventListener('error', () => { if (!opened) reject(new Error('WebSocket connection failed.')); }, { once: true });
        socket.addEventListener('message', (event) => {
          let realtimePayload;
          try { realtimePayload = JSON.parse(event.data); } catch { return; }
          handleRealtimePayload(realtimePayload);
        });
        socket.addEventListener('close', () => {
          setConnection('Reconnecting…');
          if (!opened) reject(new Error('WebSocket closed before opening.'));
          reconnectTimer = setTimeout(() => connectWebSocket().catch(() => connectSseFallback()), 1500);
        });
      });
    } catch {
      return connectSseFallback();
    }
  }

  window.addEventListener('beforeunload', () => {
    clearTimeout(reconnectTimer);
    clearTimeout(contextRefreshTimer);
    socket?.close();
    source?.close();
  });

  connectWebSocket()
    .then(loadInitial)
    .catch((error) => {
      setConnection('Unavailable');
      showError(error.message);
    });
}
