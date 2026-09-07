const streamEl = document.querySelector('#stream');

if (streamEl) {
  streamEl.innerHTML = `
    <div class="section-heading stream-heading">
      <div><span>LIVE THREAD</span><h2>Adventure Stream</h2></div>
      <small data-testid="stream-connection">Connecting…</small>
    </div>
    <p class="stream-hint">Chat freely while combat, loot, party, and dungeon events flow into the same shared timeline.</p>
    <section class="stream-combat-dock" data-testid="stream-combat-dock" aria-label="Live combat controls" hidden></section>
    <div class="adventure-stream-log" data-testid="adventure-stream-log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <form class="adventure-stream-composer" data-testid="stream-composer">
      <label class="sr-only" for="stream-message">Message the shared stream</label>
      <input id="stream-message" data-testid="stream-message" maxlength="500" autocomplete="off" placeholder="Message the shared stream…">
      <button type="submit" data-testid="stream-send">Send</button>
    </form>
    <p class="stream-error" data-testid="stream-error" role="alert" hidden></p>
  `;

  const logEl = streamEl.querySelector('[data-testid="adventure-stream-log"]');
  const combatDockEl = streamEl.querySelector('[data-testid="stream-combat-dock"]');
  const formEl = streamEl.querySelector('[data-testid="stream-composer"]');
  const inputEl = streamEl.querySelector('[data-testid="stream-message"]');
  const sendEl = streamEl.querySelector('[data-testid="stream-send"]');
  const connectionEl = streamEl.querySelector('[data-testid="stream-connection"]');
  const errorEl = streamEl.querySelector('[data-testid="stream-error"]');
  const dungeonEl = document.querySelector('#dungeon');
  const seen = new Set();
  const bufferedEntries = [];
  let initialLoaded = false;
  let socket = null;
  let source = null;
  let reconnectTimer = null;
  let combatRenderFrame = null;

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
    empty.innerHTML = '<strong>The thread is quiet.</strong><span>Say hello or enter a dungeon. Your party and world activity will appear here live.</span>';
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
    avatar.textContent = entry.kind === 'chat'
      ? (entry.actorName || '?').slice(0, 1).toUpperCase()
      : '✦';

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
    if (!initial || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 180) {
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function mirrorTargetSelect(actionId, originalSelect, container) {
    if (!originalSelect) return;
    const select = document.createElement('select');
    select.className = 'stream-target-select';
    select.dataset.testid = `stream-${actionId}-target`;
    select.setAttribute('aria-label', originalSelect.getAttribute('aria-label') || 'Choose party member');
    for (const option of originalSelect.options) {
      const clone = document.createElement('option');
      clone.value = option.value;
      clone.textContent = option.textContent;
      clone.selected = option.value === originalSelect.value;
      select.append(clone);
    }
    select.addEventListener('change', () => { originalSelect.value = select.value; });
    container.append(select);
  }

  function mirrorAction(actionId, container) {
    const original = dungeonEl?.querySelector(`[data-testid="${actionId}"]`);
    if (!original) return false;
    const group = document.createElement('div');
    group.className = 'stream-action-group';
    const target = dungeonEl.querySelector(`[data-testid="${actionId}-target"]`);
    mirrorTargetSelect(actionId, target, group);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = `stream-combat-action stream-combat-action-${actionId}`;
    action.dataset.testid = `stream-${actionId}`;
    action.textContent = original.textContent;
    action.disabled = original.disabled;
    action.addEventListener('click', () => {
      if (action.disabled || original.disabled || !original.isConnected) return;
      if (target) {
        const mirrored = group.querySelector('select');
        if (mirrored) target.value = mirrored.value;
      }
      action.disabled = true;
      original.click();
    });
    group.append(action);
    container.append(group);
    return true;
  }

  function renderCombatDock() {
    combatRenderFrame = null;
    if (!dungeonEl) return;
    const runState = dungeonEl.querySelector('[data-testid="run-state"]');
    const autoStatus = dungeonEl.querySelector('[data-testid="auto-attack-status"]');
    const defeated = dungeonEl.querySelector('[data-testid="defeated-player"]');
    if (!runState || (!autoStatus && !defeated)) {
      combatDockEl.hidden = true;
      combatDockEl.innerHTML = '';
      return;
    }

    combatDockEl.hidden = false;
    combatDockEl.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'stream-combat-header';
    const enemyName = dungeonEl.querySelector('[data-testid="enemy-card"] .enemy-name > span:first-child')?.textContent?.trim();
    const viewer = dungeonEl.querySelector('[data-testid="run-participant"].is-you .participant-head')?.textContent?.trim();
    const title = document.createElement('div');
    title.innerHTML = `<span>${defeated ? 'DOWNED' : 'LIVE ENCOUNTER'}</span><strong>${enemyName || 'Adventure in progress'}</strong>`;
    const status = document.createElement('small');
    status.dataset.testid = 'stream-combat-status';
    status.textContent = defeated ? 'Waiting for an ally to revive you.' : `${viewer || runState.textContent.trim()} · Auto Strike ON`;
    header.append(title, status);
    combatDockEl.append(header);

    if (defeated) return;
    const actions = document.createElement('div');
    actions.className = 'stream-combat-actions';
    actions.dataset.testid = 'stream-combat-actions';
    let count = 0;
    for (const actionId of ['guard', 'interrupt', 'mend', 'revive']) {
      if (mirrorAction(actionId, actions)) count += 1;
    }
    if (count > 0) combatDockEl.append(actions);
  }

  function queueCombatDock() {
    if (combatRenderFrame !== null) return;
    combatRenderFrame = requestAnimationFrame(renderCombatDock);
  }

  if (dungeonEl) {
    const observer = new MutationObserver(queueCombatDock);
    observer.observe(dungeonEl, { childList: true, subtree: true, attributes: true, characterData: true });
    window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
    queueCombatDock();
  }

  function handleRealtimePayload(payload) {
    if (payload.type === 'connected') {
      const transport = payload.transport === 'websocket' ? 'WebSocket live' : 'Live';
      setConnection(transport, { live: true });
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
  }

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = inputEl.value.trim();
    if (!body || sendEl.disabled) return;
    sendEl.disabled = true;
    inputEl.disabled = true;
    showError('');
    try {
      const response = await fetch('/api/stream/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Could not send message.');
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
        const open = () => {
          opened = true;
          source?.close();
          source = null;
          setConnection('WebSocket live', { live: true });
          resolve();
        };
        const failedBeforeOpen = () => {
          if (!opened) reject(new Error('WebSocket connection failed.'));
        };
        socket.addEventListener('open', open, { once: true });
        socket.addEventListener('error', failedBeforeOpen, { once: true });
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
    if (combatRenderFrame !== null) cancelAnimationFrame(combatRenderFrame);
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
