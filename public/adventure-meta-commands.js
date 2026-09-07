const stream = document.querySelector('#stream');

if (stream) {
  const form = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const send = stream.querySelector('[data-testid="stream-send"]');
  const card = stream.querySelector('[data-testid="stream-command-card"]');
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const error = stream.querySelector('[data-testid="stream-error"]');
  const hint = stream.querySelector('.stream-hint');

  // The legacy encounter dock used to duplicate Attack/Guard controls. Remove it from
  // the presentation DOM entirely; adventure-stream.js may retain a detached reference
  // during this migration, but only the contextual suggestion row is user-facing.
  stream.querySelector('[data-testid="stream-combat-dock"]')?.remove();

  const style = document.createElement('style');
  style.textContent = `
    body.threadbound-player[data-game-view="play"] #stream .stream-combat-dock,
    body.threadbound-player #stream .stream-combat-dock { display: none !important; }
    body.threadbound-player #dungeon button { display: none !important; }
    .stream-suggestions { position: relative; padding-top: 22px; }
    .stream-suggestions::before { content: 'YOUR NEXT ACTION'; position: absolute; top: 2px; left: 2px; font-size: 10px; font-weight: 800; letter-spacing: .12em; opacity: .66; }
    .stream-entry-system .stream-entry-content > p { font-weight: 650; line-height: 1.48; }
    .stream-entry-system:last-of-type { box-shadow: 0 0 0 1px rgba(255,255,255,.04), 0 12px 30px rgba(0,0,0,.14); }
    .thread-dungeon-list { display:grid; gap:8px; }
    .thread-dungeon-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:10px; border:1px solid var(--line-soft); border-radius:12px; background:rgba(5,10,20,.58); }
    .thread-dungeon-row strong, .thread-dungeon-row small { display:block; }
    .thread-dungeon-row small { margin-top:3px; color:var(--muted); font-size:.73rem; }
    .thread-dungeon-row button { min-height:44px; margin:0 !important; }
    @media (max-width:520px) { .thread-dungeon-row { grid-template-columns:1fr; } .thread-dungeon-row button { width:100%; } }
  `;
  document.head.append(style);

  if (input) input.placeholder = 'Message your party…';
  if (hint) hint.textContent = 'Threadbound posts the result of every action here. Tap your next action below, or chat normally.';

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

  async function renderDungeons() {
    const data = await api('/api/dashboard');
    const reply = openReply('dungeons', 'Available adventures', data.activeRun ? 'Finish your current adventure before entering another.' : 'Choose where the thread goes next.');
    const list = document.createElement('div');
    list.className = 'thread-dungeon-list';
    list.dataset.testid = 'stream-dungeon-list';

    for (const dungeon of data.dungeons || []) {
      const row = document.createElement('article');
      row.className = 'thread-dungeon-row';
      const copy = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = dungeon.name;
      const meta = document.createElement('small');
      meta.textContent = dungeon.arcName || dungeon.sourceManifestTitle || 'Threadbound adventure';
      copy.append(name, meta);

      const enter = document.createElement('button');
      enter.type = 'button';
      enter.className = 'primary-action';
      enter.dataset.testid = `stream-enter-${dungeon.id}`;
      enter.textContent = `Enter ${dungeon.name}`;
      enter.disabled = Boolean(data.activeRun);
      enter.addEventListener('click', async () => {
        enter.disabled = true;
        showError('');
        try {
          await api(`/api/dungeons/${encodeURIComponent(dungeon.id)}/start`, { method: 'POST' });
          card.hidden = true;
          card.innerHTML = '';
        } catch (caught) {
          showError(caught.message);
          enter.disabled = false;
        }
      });
      row.append(copy, enter);
      list.append(row);
    }

    if (!list.children.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No adventures are currently available.';
      list.append(empty);
    }
    reply.append(list);
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
    if (command === '/dungeons' || command === '/adventures') {
      await renderDungeons();
      return true;
    }
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

  form?.addEventListener('submit', async (event) => {
    const command = input.value.trim().toLowerCase().split(/\s+/)[0];
    if (!['/dungeons', '/adventures', '/world', '/achievements', '/honey', '/wallet'].includes(command)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    send.textContent = 'Send';
    showError('');
    try { await executeMetaCommand(command); }
    catch (caught) { showError(caught.message); }
    input.focus();
  }, true);

  function addSuggestion(label, command, testId, { prepend = false } = {}) {
    if (!suggestions || suggestions.querySelector(`[data-meta-command="${command}"]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.metaCommand = command;
    button.dataset.testid = testId;
    button.addEventListener('click', () => executeMetaCommand(command).catch((caught) => showError(caught.message)));
    if (prepend && suggestions.firstChild) suggestions.insertBefore(button, suggestions.firstChild);
    else suggestions.append(button);
  }

  function normalizeSuggestions() {
    for (const button of suggestions?.querySelectorAll('button[data-command]') || []) {
      if (button.dataset.command === '/attack') button.textContent = 'Attack';
      if (button.dataset.command === '/guard') button.textContent = 'Guard';
    }
    addSuggestion('Dungeons', '/dungeons', 'stream-dungeons', { prepend: true });
    addSuggestion('World', '/world', 'stream-world');
    addSuggestion('Honey', '/honey', 'stream-honey');
  }

  normalizeSuggestions();
  const observer = new MutationObserver(() => normalizeSuggestions());
  if (suggestions) observer.observe(suggestions, { childList: true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
