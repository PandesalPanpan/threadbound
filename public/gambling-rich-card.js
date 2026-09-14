const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  if (!stream.querySelector('[data-testid="stream-composer"]')) {
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!stream.querySelector('[data-testid="stream-composer"]')) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(stream, { childList: true, subtree: true });
    });
  }

  const form = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const card = stream.querySelector('[data-testid="stream-command-card"]');
  const error = stream.querySelector('[data-testid="stream-error"]');
  let busy = false;

  function showError(message = '') {
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  function key(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  async function waitForEntry(entryId) {
    if (!entryId || !log) return;
    const exists = () => Boolean(log.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`));
    if (exists()) return;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(() => { if (exists()) finish(); });
      observer.observe(log, { childList: true, subtree: true });
      const timer = setTimeout(finish, 700);
    });
  }

  async function recordPlayerAction(body) {
    const payload = await api('/api/stream/messages', {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    await waitForEntry(payload.entry?.id);
  }

  async function showHelp(game) {
    const payload = await api('/api/gambling/help', {
      method: 'POST',
      body: JSON.stringify({ game }),
    });
    await waitForEntry(payload.entry?.id);
  }

  async function runCommand(raw) {
    const normalized = String(raw || '').trim().replace(/^\//, '');
    const [name = '', ...args] = normalized.split(/\s+/);
    const command = name.toLowerCase();
    const lowerArgs = args.map((part) => part.toLowerCase());

    await recordPlayerAction(String(raw || '').trim());

    if (command === 'gambling' || command === 'casino') {
      await showHelp('games');
      return;
    }

    if (command === 'blackjack') {
      if (!args.length) {
        await showHelp('blackjack');
        return;
      }
      const payload = await api('/api/gambling/blackjack', {
        method: 'POST',
        headers: { 'Idempotency-Key': key('blackjack-deal') },
        body: JSON.stringify({ wager: Number(args[0]) }),
      });
      await waitForEntry(payload.entry?.id);
      return;
    }

    if (command === 'hit' || command === 'stand') {
      const browse = await api('/api/gambling');
      const round = browse.blackjack?.round;
      if (!round || round.status !== 'active') throw new Error('No active Blackjack hand. Type blackjack <wager> to deal.');
      const payload = await api(`/api/gambling/blackjack/${encodeURIComponent(round.id)}/${command}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key(`blackjack-${command}`) },
      });
      await waitForEntry(payload.entry?.id);
      return;
    }

    if (command === 'coinflip') {
      if (!args.length) {
        await showHelp('coinflip');
        return;
      }
      const choice = lowerArgs[1];
      const payload = await api('/api/gambling/coinflip', {
        method: 'POST',
        headers: { 'Idempotency-Key': key('coinflip') },
        body: JSON.stringify({ wager: Number(args[0]), choice }),
      });
      await waitForEntry(payload.entry?.id);
      return;
    }

    if (command === 'slots') {
      if (!args.length) {
        await showHelp('slots');
        return;
      }
      const payload = await api('/api/gambling/slots', {
        method: 'POST',
        headers: { 'Idempotency-Key': key('slots') },
        body: JSON.stringify({ wager: Number(args[0]) }),
      });
      await waitForEntry(payload.entry?.id);
    }
  }

  function parsedCommand(value) {
    const normalized = String(value || '').trim().replace(/^\//, '');
    const [name = ''] = normalized.split(/\s+/);
    return ['gambling', 'casino', 'blackjack', 'hit', 'stand', 'coinflip', 'slots'].includes(name.toLowerCase());
  }

  form?.addEventListener('submit', async (event) => {
    const raw = String(input?.value || '').trim();
    if (!parsedCommand(raw)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy || !raw) return;
    busy = true;
    showError('');
    if (input) input.value = '';
    if (card?.dataset.richCardKind === 'gambling') {
      card.hidden = true;
      card.innerHTML = '';
      delete card.dataset.richCardKind;
      delete card.dataset.gamblingRichCard;
      delete card.dataset.gamblingView;
    }
    try {
      await runCommand(raw);
    } catch (caught) {
      showError(caught.message);
    } finally {
      busy = false;
      input?.focus({ preventScroll: true });
    }
  }, { capture: true });
}
