const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const composer = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const commandCard = stream.querySelector('[data-testid="stream-command-card"]');
  const errorEl = stream.querySelector('[data-testid="stream-error"]');

  const style = document.createElement('style');
  style.textContent = `
    body.threadbound-player #stream .stream-combat-dock { display:none !important; }
    body.threadbound-player #stream .stream-entry-system p { white-space:pre-line; }
    body.threadbound-player #stream .stream-suggestions.simple-loop-controls {
      display:grid !important;
      grid-template-columns:repeat(3,minmax(0,1fr)) !important;
      gap:7px !important;
    }
    body.threadbound-player #stream .stream-suggestions.simple-loop-controls > button:not(.simple-loop-action) {
      display:none !important;
    }
    body.threadbound-player #stream .simple-loop-action {
      display:inline-flex !important;
      align-items:center !important;
      justify-content:center !important;
      min-width:0 !important;
      min-height:44px !important;
      padding:7px 8px !important;
      border:1px solid #292c34 !important;
      border-radius:9px !important;
      background:#202228 !important;
      color:#d6d7dc !important;
      box-shadow:none !important;
      font-size:.68rem !important;
      font-weight:650 !important;
      white-space:nowrap !important;
    }
    body.threadbound-player #stream .simple-loop-action[data-kind="hunt"] { color:#9b7bff !important; }
    body.threadbound-player #stream .simple-loop-action[data-kind="attack"] { color:#ff7080 !important; }
    body.threadbound-player #stream .simple-loop-action[data-kind="dungeon"] { color:#f0b541 !important; }
    body.threadbound-player #stream .simple-loop-action[data-kind="inventory"] { color:#58aaff !important; }
    body.threadbound-player #stream .simple-loop-action:disabled { opacity:.55 !important; }
    body.threadbound-player #stream .simple-loop-gear-warning {
      grid-column:1 / -1;
      margin:0;
      color:#8d909b;
      font-size:.56rem;
      text-align:center;
    }
    body.threadbound-player #stream .simple-loop-help {
      margin:4px 0 0;
      padding:7px 0;
      border-top:1px solid #292c34;
      color:#b8bac3;
      font-size:.67rem;
      line-height:1.45;
    }
    @media (max-width:390px) {
      body.threadbound-player #stream .simple-loop-action { font-size:.63rem !important; padding-inline:5px !important; }
    }
  `;
  document.head.append(style);

  let dashboard = null;
  let syncing = false;
  let scheduled = null;
  let acting = false;
  let lastSignature = '';

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

  function showError(message = '') {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function legacyTestId(button) {
    const testId = button.dataset.testid;
    if (!testId || button.classList.contains('simple-loop-action')) return;
    if (['stream-start-dungeon', 'stream-attack', 'stream-guard', 'stream-interrupt'].includes(testId)) {
      button.dataset.testid = `${testId}-legacy`;
    }
  }

  function addButton(label, kind, onClick, testId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'simple-loop-action';
    button.dataset.kind = kind;
    button.dataset.testid = testId;
    button.textContent = label;
    button.disabled = acting;
    button.addEventListener('click', async () => {
      if (acting) return;
      acting = true;
      showError('');
      button.disabled = true;
      try {
        await onClick();
        await sync({ force: true });
      } catch (error) {
        showError(error.message);
      } finally {
        acting = false;
        button.disabled = false;
      }
    });
    suggestions.append(button);
    return button;
  }

  function openInventory() {
    const gear = document.querySelector('.mobile-game-nav a[data-view="gear"]');
    if (gear) gear.click();
    else {
      document.body.dataset.gameView = 'gear';
      document.querySelector('#inventory')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  function firstDungeon() {
    const dungeon = dashboard?.dungeons?.[0];
    const readiness = dashboard?.simpleLoop?.dungeonReadiness?.find((entry) => entry.dungeonId === dungeon?.id);
    return { dungeon, readiness };
  }

  async function hunt() {
    await api('/api/hunt', { method: 'POST' });
  }

  async function startDungeon() {
    const { dungeon } = firstDungeon();
    if (!dungeon) throw new Error('No dungeon is available.');
    await api(`/api/dungeons/${encodeURIComponent(dungeon.id)}/start-simple`, { method: 'POST' });
  }

  async function attack() {
    const run = dashboard?.activeRun;
    if (!run) throw new Error('No active dungeon.');
    await api(`/api/runs/${encodeURIComponent(run.id)}/attack`, { method: 'POST' });
  }

  function renderHelp() {
    if (!commandCard) return;
    commandCard.hidden = false;
    commandCard.innerHTML = '';
    const help = document.createElement('div');
    help.className = 'simple-loop-help';
    help.innerHTML = '<strong>Simple loop</strong><br>/hunt — quick solo battle for Dust and gear<br>/dungeon — enter the harder stat-check dungeon<br>/attack — attack the current dungeon enemy<br>/inventory — view and equip permanent gear';
    commandCard.append(help);
  }

  function renderControls() {
    if (!suggestions || !dashboard) return;
    const simple = Boolean(dashboard.activeRun?.simpleCombat);
    const noRun = !dashboard.activeRun;

    // Existing Adventure Stream controls remain in the DOM as a compatibility source for
    // legacy runs, but the new player loop owns the visible controls whenever no old run
    // is being resumed.
    suggestions.classList.toggle('simple-loop-controls', noRun || simple);
    for (const button of suggestions.querySelectorAll('button:not(.simple-loop-action)')) legacyTestId(button);
    suggestions.querySelectorAll('.simple-loop-action,.simple-loop-gear-warning').forEach((node) => node.remove());

    if (!noRun && !simple) return;

    if (noRun) {
      addButton('/hunt', 'hunt', hunt, 'stream-hunt');
      const { dungeon, readiness } = firstDungeon();
      if (dungeon) {
        const viewer = readiness?.members?.find((member) => member.playerId === dashboard.character.id) || readiness?.members?.[0];
        const current = Number(viewer?.attackPower ?? dashboard.character.attackPower ?? 0);
        const recommended = Number(readiness?.recommendedAttack ?? 9);
        addButton(`/dungeon · ${current}/${recommended}`, 'dungeon', startDungeon, 'stream-start-dungeon');
      }
      addButton('/inventory', 'inventory', async () => openInventory(), 'stream-inventory');
      return;
    }

    if (['combat', 'boss'].includes(dashboard.activeRun.phase) && dashboard.activeRun.viewer?.hp > 0) {
      addButton('/attack', 'attack', attack, 'stream-attack');
      const hint = document.createElement('p');
      hint.className = 'simple-loop-gear-warning';
      hint.textContent = `${dashboard.activeRun.enemy?.name || 'Enemy'} · ${dashboard.activeRun.enemy?.hp ?? 0}/${dashboard.activeRun.enemy?.maxHp ?? 0} HP · no temporary combat buffs`;
      suggestions.append(hint);
    }
  }

  async function sync({ force = false } = {}) {
    if (syncing) return;
    syncing = true;
    try {
      dashboard = await api('/api/dashboard');
      const signature = JSON.stringify([
        dashboard.activeRun?.id || null,
        dashboard.activeRun?.version ?? null,
        dashboard.activeRun?.phase || null,
        dashboard.activeRun?.simpleCombat || false,
        dashboard.character?.attackPower || 0,
        dashboard.inventory?.length || 0,
      ]);
      if (force || signature !== lastSignature) {
        lastSignature = signature;
        renderControls();
      } else if (suggestions && !suggestions.querySelector('.simple-loop-action') && (!dashboard.activeRun || dashboard.activeRun.simpleCombat)) {
        renderControls();
      }
      if (input) input.placeholder = dashboard.activeRun?.simpleCombat ? 'Message party or /attack…' : 'Message party or /hunt…';
      document.body.classList.toggle('simple-gameplay-loop', !dashboard.activeRun || Boolean(dashboard.activeRun.simpleCombat));
    } finally {
      syncing = false;
    }
  }

  function scheduleSync(delay = 45) {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => sync().catch(() => {}), delay);
  }

  if (composer && input) {
    composer.addEventListener('submit', async (event) => {
      const raw = input.value.trim();
      if (!raw.startsWith('/')) return;
      const [command] = raw.toLowerCase().split(/\s+/);
      const simple = !dashboard?.activeRun || dashboard?.activeRun?.simpleCombat;
      if (!simple) return;

      if (['/hunt', '/dungeon', '/run', '/attack', '/help'].includes(command)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = '';
        showError('');
        try {
          if (command === '/hunt') await hunt();
          else if (command === '/dungeon' || command === '/run') await startDungeon();
          else if (command === '/attack') await attack();
          else renderHelp();
          await sync({ force: true });
        } catch (error) {
          showError(error.message);
        }
        input.focus();
        return;
      }

      if (['/guard', '/interrupt', '/mend', '/revive', '/upgrade', '/skill'].includes(command)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = '';
        showError('The new combat loop uses /attack only. Hunt for stronger permanent gear if a dungeon is too difficult.');
        input.focus();
      }
    }, { capture: true });
  }

  const observer = suggestions ? new MutationObserver(() => scheduleSync()) : null;
  if (suggestions) observer.observe(suggestions, { childList: true });

  // Realtime stream entries/state changes mutate the stream even if suggestion markup does
  // not change immediately, so this keeps the tiny control row in sync with authoritative state.
  const streamObserver = new MutationObserver(() => scheduleSync(70));
  streamObserver.observe(stream, { childList: true, subtree: true });

  sync({ force: true }).catch((error) => showError(error.message));
  window.addEventListener('beforeunload', () => {
    clearTimeout(scheduled);
    observer?.disconnect();
    streamObserver.disconnect();
  }, { once: true });
}
