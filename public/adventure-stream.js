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
  let source = null;

  function showError(message = '') {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function timeLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  function connect() {
    if (!('EventSource' in window)) {
      connectionEl.textContent = 'Polling fallback';
      return;
    }
    source?.close();
    source = new EventSource('/api/events');
    source.onopen = () => {
      connectionEl.textContent = 'Live';
      connectionEl.classList.add('is-live');
    };
    source.onmessage = (event) => {
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (payload.type === 'connected') {
        connectionEl.textContent = 'Live';
        connectionEl.classList.add('is-live');
        return;
      }
      if (payload.type === 'stream_entry') appendEntry(payload.entry);
    };
    source.onerror = () => {
      connectionEl.textContent = 'Reconnecting…';
      connectionEl.classList.remove('is-live');
    };
  }

  window.addEventListener('beforeunload', () => source?.close());
  loadInitial().then(connect).catch((error) => {
    connectionEl.textContent = 'Unavailable';
    showError(error.message);
  });
}
