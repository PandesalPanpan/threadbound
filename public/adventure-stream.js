const streamEl = document.querySelector('#stream');

if (streamEl) {
  streamEl.innerHTML = `
    <div class="section-heading stream-heading">
      <div><span>LIVE THREAD</span><h2>Adventure Stream</h2></div>
      <small data-testid="stream-connection">Connecting…</small>
    </div>
    <p class="stream-hint">Chat freely while combat, loot, party, and dungeon events flow into the same shared timeline.</p>
    <div class="adventure-stream-log" data-testid="adventure-stream-log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <form class="adventure-stream-composer" data-testid="stream-composer">
      <label class="sr-only" for="stream-message">Message the shared stream</label>
      <input id="stream-message" data-testid="stream-message" maxlength="500" autocomplete="off" placeholder="Message the shared stream…">
      <button type="submit" data-testid="stream-send">Send</button>
    </form>
    <p class="stream-error" data-testid="stream-error" role="alert" hidden></p>
  `;

  const logEl = streamEl.querySelector('[data-testid="adventure-stream-log"]');
  const formEl = streamEl.querySelector('[data-testid="stream-composer"]');
  const inputEl = streamEl.querySelector('[data-testid="stream-message"]');
  const sendEl = streamEl.querySelector('[data-testid="stream-send"]');
  const connectionEl = streamEl.querySelector('[data-testid="stream-connection"]');
  const errorEl = streamEl.querySelector('[data-testid="stream-error"]');
  const seen = new Set();
  let socket = null;
  let source = null;
  let reconnectTimer = null;

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

  function appendEntry(entry, { initial = false } = {}) {
    if (!entry?.id || seen.has(entry.id)) return;
    seen.add(entry.id);
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

  function handleRealtimePayload(payload) {
    if (payload.type === 'connected') {
      const transport = payload.transport === 'websocket' ? 'WebSocket live' : 'Live';
      setConnection(transport, { live: true });
      return;
    }
    if (payload.type === 'stream_entry') appendEntry(payload.entry);
  }

  async function loadInitial() {
    const response = await fetch('/api/stream?limit=100', { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Could not load the adventure stream.');
    for (const entry of payload.entries || []) appendEntry(entry, { initial: true });
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
    if (!('EventSource' in window)) {
      setConnection('Polling fallback');
      return;
    }
    source?.close();
    source = new EventSource('/api/events');
    source.onopen = () => setConnection('SSE live', { live: true });
    source.onmessage = (event) => {
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }
      handleRealtimePayload(payload);
    };
    source.onerror = () => setConnection('Reconnecting…');
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
      let opened = false;
      socket.addEventListener('open', () => {
        opened = true;
        source?.close();
        source = null;
        setConnection('WebSocket live', { live: true });
      });
      socket.addEventListener('message', (event) => {
        let realtimePayload;
        try { realtimePayload = JSON.parse(event.data); } catch { return; }
        handleRealtimePayload(realtimePayload);
      });
      socket.addEventListener('close', () => {
        setConnection('Reconnecting…');
        if (!opened) connectSseFallback();
        reconnectTimer = setTimeout(() => connectWebSocket().catch(() => connectSseFallback()), 1500);
      });
      socket.addEventListener('error', () => {
        if (!opened) connectSseFallback();
      });
    } catch {
      connectSseFallback();
      reconnectTimer = setTimeout(() => connectWebSocket().catch(() => {}), 3000);
    }
  }

  window.addEventListener('beforeunload', () => {
    clearTimeout(reconnectTimer);
    socket?.close();
    source?.close();
  });

  loadInitial().then(connectWebSocket).catch((error) => {
    setConnection('Unavailable');
    showError(error.message);
  });
}
