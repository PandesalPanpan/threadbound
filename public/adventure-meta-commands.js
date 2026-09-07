const stream = document.querySelector('#stream');

if (stream) {
  const form = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const send = stream.querySelector('[data-testid="stream-send"]');
  const card = stream.querySelector('[data-testid="stream-command-card"]');
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const error = stream.querySelector('[data-testid="stream-error"]');

  function showError(message = '') {
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
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

  function openReply(command, title, subtitle = '') {
    card.hidden = false;
    card.innerHTML = '';
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
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    header.append(copy, close);
    card.append(header);
    return card;
  }

  function progressBar(value, max) {
    const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    const track = document.createElement('div');
    track.className = 'thread-meta-progress';
    const fill = document.createElement('span');
    fill.style.width = `${percent}%`;
    track.append(fill);
    return track;
  }

  async function renderWorld() {
    const data = await api('/api/dashboard');
    const world = data.world;
    const reply = openReply('world', world.arcName, 'Shared world progression');
    const panel = document.createElement('div');
    panel.className = 'thread-world-card';
    const label = document.createElement('span');
    label.textContent = 'ACTIVE WORLD ARC';
    const progress = document.createElement('strong');
    progress.dataset.testid = 'stream-world-progress';
    progress.textContent = `${world.frayedHollowClears} / ${world.target} Frayed Hollow clears`;
    panel.append(label, progress, progressBar(world.frayedHollowClears, world.target));
    reply.append(panel);

    const achievements = document.createElement('div');
    achievements.className = 'thread-achievement-list';
    const title = document.createElement('strong');
    title.textContent = 'Your milestones';
    achievements.append(title);
    if (data.achievements?.length) {
      for (const achievement of data.achievements.slice(-5).reverse()) {
        const row = document.createElement('div');
        row.textContent = `✦ ${achievement.name} — ${achievement.description}`;
        achievements.append(row);
      }
    } else {
      const empty = document.createElement('small');
      empty.textContent = 'Your first achievements will appear here.';
      achievements.append(empty);
    }
    reply.append(achievements);
  }

  async function renderHoney() {
    const data = await api('/api/dashboard');
    const isLocal = data.authSource === 'local';
    const reply = openReply('honey', 'Honey wallet', isLocal ? 'Owned by Threaded; unavailable in standalone local mode' : 'Threaded-authoritative premium wallet');
    const wallet = document.createElement('div');
    wallet.className = 'thread-honey-card';
    const label = document.createElement('span');
    label.textContent = 'BALANCE';
    const balance = document.createElement('strong');
    balance.dataset.testid = 'stream-honey-balance';
    balance.textContent = isLocal ? '—' : String(data.wallet?.balance ?? 0);
    wallet.append(label, balance);
    reply.append(wallet);

    if (isLocal) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'Threadbound will not mint Honey locally. Connect through Threaded to spend the authoritative wallet.';
      reply.append(note);
      return;
    }

    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Training Cache costs 25 Honey and uses the same idempotent Threaded wallet transaction as the secondary Honey view.';
    reply.append(note);
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'primary-action';
    buy.dataset.testid = 'stream-buy-training-cache';
    buy.textContent = 'Buy Training Cache · 25 Honey';
    buy.addEventListener('click', async () => {
      buy.disabled = true;
      showError('');
      try {
        await api('/api/honey/purchases/training-cache', {
          method: 'POST',
          headers: { 'Idempotency-Key': `ui-${crypto.randomUUID()}` },
        });
        await renderHoney();
      } catch (caught) {
        showError(caught.message);
      } finally {
        buy.disabled = false;
      }
    });
    reply.append(buy);
  }

  async function executeMetaCommand(command) {
    if (command === '/world' || command === '/achievements') {
      await renderWorld();
      return true;
    }
    if (command === '/honey' || command === '/wallet') {
      await renderHoney();
      return true;
    }
    return false;
  }

  // Capture only the commands this presentation extension owns. The primary stream
  // module continues to handle normal chat and all combat/inventory/party commands.
  form?.addEventListener('submit', async (event) => {
    const command = input.value.trim().toLowerCase().split(/\s+/)[0];
    if (!['/world', '/achievements', '/honey', '/wallet'].includes(command)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const raw = input.value.trim();
    input.value = '';
    send.textContent = 'Send';
    showError('');
    try {
      await executeMetaCommand(raw.toLowerCase().split(/\s+/)[0]);
    } catch (caught) {
      showError(caught.message);
    }
    input.focus();
  }, true);

  function addSuggestion(label, command, testId) {
    if (!suggestions || suggestions.querySelector(`[data-meta-command="${command}"]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.metaCommand = command;
    button.dataset.testid = testId;
    button.addEventListener('click', () => executeMetaCommand(command).catch((caught) => showError(caught.message)));
    suggestions.append(button);
  }

  function ensureSuggestions() {
    addSuggestion('World', '/world', 'stream-world');
    addSuggestion('Honey', '/honey', 'stream-honey');
  }

  ensureSuggestions();
  const observer = new MutationObserver(() => ensureSuggestions());
  if (suggestions) observer.observe(suggestions, { childList: true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
