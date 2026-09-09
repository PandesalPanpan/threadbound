const INITIAL_STREAM_LIMIT = 30;
const HISTORY_PAGE_SIZE = 24;

const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const style = document.createElement('style');
  style.textContent = `
    /* Action previews stay presentation-only; authoritative numbers come from /api/dashboard. */
    .stream-suggestions button[data-preview-label]::after {
      content: attr(data-preview-label);
      display:inline-block;
      margin-left:6px;
      padding:2px 5px;
      border-radius:999px;
      background:rgba(255,157,72,.12);
      color:#ffbd76;
      font-size:.62rem;
      font-weight:950;
      letter-spacing:.02em;
      vertical-align:1px;
    }
    .combat-skill[data-preview-label]::after {
      content: attr(data-preview-label);
      display:block;
      width:max-content;
      max-width:100%;
      margin-top:2px;
      padding:2px 5px;
      border-radius:6px;
      background:rgba(255,157,72,.11);
      color:#ffbd76;
      font-size:.58rem;
      font-weight:950;
    }
    .stream-health-track { position:relative; }
    .stream-health-track > span:not(.stream-health-preview) {
      position:relative;
      z-index:1;
      transition:width .36s cubic-bezier(.2,.8,.2,1);
    }
    .stream-health-preview {
      position:absolute !important;
      z-index:3 !important;
      top:0;
      bottom:0;
      height:100%;
      border-radius:999px;
      background:linear-gradient(90deg,#ff9f43,#ffd166) !important;
      box-shadow:0 0 10px rgba(255,159,67,.62);
      pointer-events:none;
      animation:threadbound-preview-pulse .9s ease-in-out infinite alternate;
    }
    .stream-health-preview-copy {
      display:block;
      grid-column:1 / -1;
      margin-top:3px;
      color:#ffbd76;
      font-size:.59rem;
      font-weight:950;
      text-align:right;
    }
    @keyframes threadbound-preview-pulse { from { opacity:.72; } to { opacity:1; } }

    /* Run powers read as draft cards instead of unlabeled command pills. */
    .stream-suggestions button.run-power-card {
      display:grid;
      grid-template-columns:1fr;
      align-content:start;
      gap:3px;
      width:min(232px,78vw);
      min-height:92px;
      padding:9px 11px !important;
      border-radius:13px;
      text-align:left;
      white-space:normal;
      background:linear-gradient(145deg,rgba(37,22,57,.96),rgba(11,18,32,.98));
      border-color:rgba(179,109,255,.34);
      box-shadow:inset 0 2px 0 rgba(255,255,255,.035);
    }
    .run-power-card .run-power-category { color:#d9b8ff; font-size:.54rem; font-weight:950; letter-spacing:.12em; }
    .run-power-card .run-power-name { color:var(--text); font-size:.78rem; font-weight:950; }
    .run-power-card .run-power-description { color:var(--muted); font-size:.62rem; line-height:1.3; }
    .run-power-card .run-power-effects { display:flex; flex-wrap:wrap; gap:4px; margin-top:2px; }
    .run-power-card .run-power-effect {
      padding:2px 5px;
      border-radius:6px;
      background:rgba(255,255,255,.055);
      color:#ffe097;
      font-size:.55rem;
      font-weight:900;
    }

    .stream-exchange-count {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      padding-top:2px;
      color:var(--muted);
      font-size:.58rem;
      font-weight:850;
    }
    .stream-exchange-count button {
      min-height:28px;
      margin:0 !important;
      padding:3px 7px !important;
      border-radius:8px;
      font-size:.57rem;
    }
    .stream-entry.is-condensed-receipt:not(.is-expanded-receipt) { display:none; }
    .stream-entry.is-condensed-receipt.is-expanded-receipt { opacity:.72; }

    .stream-history-entry { opacity:.82; }
    .stream-history-entry .stream-system-tag::after { content:' · HISTORY'; }
    .stream-history-loader {
      position:sticky;
      top:0;
      z-index:4;
      width:max-content;
      margin:0 auto 5px;
      padding:4px 8px;
      border:1px solid rgba(85,214,255,.18);
      border-radius:999px;
      background:rgba(8,13,26,.94);
      color:var(--muted);
      font-size:.58rem;
      font-weight:900;
      pointer-events:none;
    }

    @media (prefers-reduced-motion:reduce) {
      .stream-health-track > span, .stream-health-preview { transition:none !important; animation:none !important; }
    }
  `;
  document.head.append(style);

  const previewByButton = new WeakMap();
  let dashboardTimer = null;
  let receiptTimer = null;
  let historyLoading = false;
  let historyHasMore = true;
  let historyBeforeId = null;
  let latestDashboard = null;

  function waitFor(selector, timeoutMs = 4000) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (!element) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve(element);
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeoutMs);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async function json(path) {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function previewLabel(preview) {
    if (!preview?.available) return '';
    if (Number(preview.damage || 0) > 0) return `−${preview.damage} HP`;
    if (Number(preview.healed || 0) > 0) return `+${preview.healed} HP`;
    if (Number(preview.retaliation || 0) > 0) return `take ${preview.retaliation}`;
    return '';
  }

  function clearHealthPreview() {
    document.querySelectorAll('.stream-health-preview,.stream-health-preview-copy').forEach((node) => node.remove());
  }

  function showHealthPreview(preview) {
    clearHealthPreview();
    if (!preview?.available || Number(preview.damage || 0) <= 0) return;
    const units = [...document.querySelectorAll('[data-testid="adventure-stream-log"] .stream-health-unit.enemy')];
    const unit = units.at(-1);
    const track = unit?.querySelector('.stream-health-track');
    if (!unit || !track || preview.enemyHpBefore === null || preview.enemyMaxHp === null || preview.enemyHpAfter === null) return;
    const max = Math.max(1, Number(preview.enemyMaxHp));
    const before = Math.max(0, Math.min(max, Number(preview.enemyHpBefore)));
    const after = Math.max(0, Math.min(max, Number(preview.enemyHpAfter)));
    if (before <= after) return;
    const beforePercent = (before / max) * 100;
    const afterPercent = (after / max) * 100;
    const ghost = document.createElement('span');
    ghost.className = 'stream-health-preview';
    ghost.dataset.testid = 'enemy-damage-preview';
    ghost.style.left = `${afterPercent}%`;
    ghost.style.width = `${Math.max(0, beforePercent - afterPercent)}%`;
    track.append(ghost);
    const copy = document.createElement('span');
    copy.className = 'stream-health-preview-copy';
    copy.dataset.testid = 'enemy-damage-preview-copy';
    copy.textContent = `${before} → ${after} HP if used now`;
    unit.append(copy);
  }

  function wirePreview(button, preview) {
    if (!button) return;
    previewByButton.set(button, preview);
    const label = previewLabel(preview);
    if (label) button.dataset.previewLabel = label;
    else delete button.dataset.previewLabel;
    if (preview?.available && Number(preview.damage || 0) > 0) button.dataset.previewDamage = String(preview.damage);
    else delete button.dataset.previewDamage;
    if (button.dataset.previewWired === 'true') return;
    button.dataset.previewWired = 'true';
    const show = () => showHealthPreview(previewByButton.get(button));
    button.addEventListener('pointerenter', show);
    button.addEventListener('focus', show);
    button.addEventListener('pointerleave', clearHealthPreview);
    button.addEventListener('blur', clearHealthPreview);
  }

  function decorateRunPowerButtons(data, suggestions) {
    const byId = new Map((data.runUpgrades || []).map((upgrade) => [upgrade.id, upgrade]));
    for (const button of suggestions.querySelectorAll('button[data-command^="/upgrade "]')) {
      const id = String(button.dataset.command || '').split(/\s+/)[1] || '';
      const upgrade = byId.get(id);
      if (!upgrade) continue;
      const revision = JSON.stringify([upgrade.name, upgrade.description, upgrade.effectSummary]);
      if (button.dataset.upgradeRevision === revision) continue;
      button.dataset.upgradeRevision = revision;
      button.dataset.upgradeCard = id;
      button.classList.add('run-power-card');
      button.setAttribute('aria-label', upgrade.name);
      button.innerHTML = '';
      const category = document.createElement('span');
      category.className = 'run-power-category';
      category.textContent = `✦ ${upgrade.category || 'RUN POWER'}`;
      const name = document.createElement('strong');
      name.className = 'run-power-name';
      name.textContent = upgrade.name;
      const description = document.createElement('small');
      description.className = 'run-power-description';
      description.dataset.testid = `upgrade-description-${id}`;
      description.textContent = upgrade.description || 'Temporary power for this run.';
      const effects = document.createElement('span');
      effects.className = 'run-power-effects';
      for (const effect of upgrade.effectSummary || []) {
        const chip = document.createElement('span');
        chip.className = 'run-power-effect';
        chip.textContent = effect;
        effects.append(chip);
      }
      button.append(category, name, description);
      if (effects.children.length) button.append(effects);
    }
  }

  async function refreshDashboardPresentation(log, suggestions) {
    try {
      const data = await json('/api/dashboard');
      latestDashboard = data;
      const previews = data.actionPreviews;
      wirePreview(suggestions.querySelector('[data-testid="stream-attack"]'), previews?.actions?.attack);
      wirePreview(suggestions.querySelector('[data-testid="stream-guard"]'), previews?.actions?.guard);
      wirePreview(suggestions.querySelector('[data-testid="stream-interrupt"]'), previews?.actions?.interrupt);
      wirePreview(suggestions.querySelector('[data-testid="stream-mend"]'), previews?.actions?.mend);
      wirePreview(suggestions.querySelector('[data-testid="stream-revive"]'), previews?.actions?.revive);
      for (const [skillId, preview] of Object.entries(previews?.skills || {})) {
        wirePreview(document.querySelector(`[data-testid="skill-${CSS.escape(skillId)}"]`), preview);
      }
      decorateRunPowerButtons(data, suggestions);
      if (!data.activeRun || !['combat', 'boss'].includes(data.activeRun.phase)) clearHealthPreview();
      if (!historyBeforeId) historyBeforeId = log.querySelector('.stream-entry[data-entry-id]')?.dataset.entryId || null;
    } catch {
      // The core Adventure Stream owns connection and error messaging.
    }
  }

  function scheduleDashboard(log, suggestions, delay = 80) {
    clearTimeout(dashboardTimer);
    dashboardTimer = setTimeout(() => refreshDashboardPresentation(log, suggestions), delay);
  }

  function animateUnitFrom(unit, oldHp, maxHp) {
    if (!unit || oldHp === null || maxHp === null || Number(maxHp) <= 0) return;
    const fill = unit.querySelector('.stream-health-track > span:not(.stream-health-preview)');
    const value = unit.querySelector('.stream-health-value');
    if (!fill) return;
    const targetWidth = fill.style.width;
    const start = Math.max(0, Math.min(100, (Number(oldHp) / Number(maxHp)) * 100));
    fill.style.transition = 'none';
    fill.style.width = `${start}%`;
    if (value) value.dataset.previousHp = String(oldHp);
    fill.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.transition = '';
      fill.style.width = targetWidth;
    }));
  }

  function installExchangeToggle(row, count) {
    row.querySelector('.stream-exchange-count')?.remove();
    const footer = document.createElement('div');
    footer.className = 'stream-exchange-count';
    footer.dataset.testid = 'stream-exchange-count';
    const label = document.createElement('span');
    label.textContent = `LIVE EXCHANGE · ${count} actions condensed`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Show previous';
    toggle.addEventListener('click', () => {
      const id = row.dataset.entryId;
      const previous = [...document.querySelectorAll(`[data-condensed-into="${CSS.escape(id)}"]`)];
      const expand = previous.some((candidate) => !candidate.classList.contains('is-expanded-receipt'));
      for (const candidate of previous) candidate.classList.toggle('is-expanded-receipt', expand);
      toggle.textContent = expand ? 'Hide previous' : 'Show previous';
    });
    footer.append(label, toggle);
    row.querySelector('.stream-rich-receipt')?.append(footer);
  }

  function condenseInto(currentRow, previousRow, currentEntry, previousEntry) {
    if (!currentRow || !previousRow || !currentEntry || !previousEntry) return;
    if (currentEntry.eventType !== 'CombatActionResolved' || previousEntry.eventType !== 'CombatActionResolved') return;
    if (!currentEntry.runId || currentEntry.runId !== previousEntry.runId) return;
    if (previousEntry.metadata?.defeatedEnemyId) return;
    if (currentEntry.metadata?.enemyId && previousEntry.metadata?.enemyId && currentEntry.metadata.enemyId !== previousEntry.metadata.enemyId) return;

    const currentId = currentRow.dataset.entryId;
    const previousId = previousRow.dataset.entryId;
    const inherited = [...document.querySelectorAll(`[data-condensed-into="${CSS.escape(previousId)}"]`)];
    for (const row of inherited) row.dataset.condensedInto = currentId;
    previousRow.dataset.condensedInto = currentId;
    previousRow.classList.add('is-condensed-receipt');
    previousRow.classList.remove('is-expanded-receipt');

    const previousCount = Math.max(1, Number(previousRow.dataset.coalescedCount || 1));
    const count = previousCount + 1;
    currentRow.dataset.coalescedCount = String(count);
    currentRow.dataset.testid = 'stream-live-combat-receipt';
    installExchangeToggle(currentRow, count);

    animateUnitFrom(
      currentRow.querySelector('.stream-health-unit.enemy'),
      previousEntry.metadata?.enemyHp ?? null,
      currentEntry.metadata?.enemyMaxHp ?? previousEntry.metadata?.enemyMaxHp ?? null,
    );
    animateUnitFrom(
      currentRow.querySelector('.stream-health-unit:not(.enemy)'),
      previousEntry.metadata?.actorHp ?? null,
      currentEntry.metadata?.actorMaxHp ?? previousEntry.metadata?.actorMaxHp ?? null,
    );
  }

  async function syncReceipts(log) {
    try {
      const page = await json(`/api/stream?limit=${INITIAL_STREAM_LIMIT}`);
      const entries = new Map((page.entries || []).map((entry) => [entry.id, entry]));
      const rows = [...log.querySelectorAll('.stream-entry-rich[data-entry-id]:not([data-feel-processed="true"])')];
      for (const row of rows) {
        const entry = entries.get(row.dataset.entryId);
        if (!entry) {
          row.dataset.feelProcessed = 'true';
          continue;
        }
        row.dataset.feelProcessed = 'true';
        row.dataset.feelEventType = entry.eventType || '';
        row.dataset.feelRunId = entry.runId || '';
        if (entry.eventType !== 'CombatActionResolved') continue;
        let previousRow = row.previousElementSibling;
        while (previousRow?.classList.contains('is-condensed-receipt')) previousRow = previousRow.previousElementSibling;
        const previousEntry = previousRow?.dataset?.entryId ? entries.get(previousRow.dataset.entryId) : null;
        condenseInto(row, previousRow, entry, previousEntry);
      }
    } catch {
      // Presentation enhancement is non-blocking; durable stream remains readable.
    }
  }

  function scheduleReceipts(log, delay = 120) {
    clearTimeout(receiptTimer);
    receiptTimer = setTimeout(() => syncReceipts(log), delay);
  }

  function historyTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function historyRow(entry) {
    const row = document.createElement('article');
    row.dataset.entryId = entry.id;
    row.dataset.testid = entry.kind === 'chat' ? 'stream-chat-entry' : 'stream-system-entry';
    row.className = `stream-entry stream-entry-${entry.kind} stream-history-entry`;
    if (entry.kind === 'system') row.dataset.richFormatted = 'true';
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
    time.textContent = historyTime(entry.createdAt);
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
    return row;
  }

  async function loadOlder(log) {
    if (historyLoading || !historyHasMore) return;
    const first = log.querySelector('.stream-entry[data-entry-id]');
    const before = historyBeforeId || first?.dataset.entryId;
    if (!before) return;
    historyLoading = true;
    const loader = document.createElement('div');
    loader.className = 'stream-history-loader';
    loader.textContent = 'LOADING EARLIER THREAD…';
    log.prepend(loader);
    const oldHeight = log.scrollHeight;
    try {
      const page = await json(`/api/stream?limit=${HISTORY_PAGE_SIZE}&before=${encodeURIComponent(before)}`);
      const entries = page.entries || [];
      historyHasMore = Boolean(page.hasMore);
      if (entries.length) {
        const fragment = document.createDocumentFragment();
        for (const entry of entries) fragment.append(historyRow(entry));
        loader.replaceWith(fragment);
        historyBeforeId = entries[0].id;
        const addedHeight = log.scrollHeight - oldHeight;
        log.scrollTop += Math.max(0, addedHeight);
      } else {
        loader.remove();
        historyHasMore = false;
      }
    } catch {
      loader.textContent = 'EARLIER THREAD UNAVAILABLE · SCROLL UP TO RETRY';
      setTimeout(() => loader.remove(), 1400);
    } finally {
      historyLoading = false;
    }
  }

  Promise.all([
    waitFor('[data-testid="adventure-stream-log"]'),
    waitFor('[data-testid="stream-suggestions"]'),
  ]).then(([log, suggestions]) => {
    if (!log || !suggestions) return;
    historyBeforeId = log.querySelector('.stream-entry[data-entry-id]')?.dataset.entryId || null;
    scheduleDashboard(log, suggestions, 0);
    scheduleReceipts(log, 140);

    log.addEventListener('scroll', () => {
      if (log.scrollTop <= 64) loadOlder(log);
    }, { passive: true });

    const observer = new MutationObserver((mutations) => {
      const changed = mutations.some((mutation) => mutation.type === 'childList');
      if (!changed) return;
      scheduleDashboard(log, suggestions);
      scheduleReceipts(log);
      if (!historyBeforeId) historyBeforeId = log.querySelector('.stream-entry[data-entry-id]')?.dataset.entryId || null;
    });
    observer.observe(stream, { childList: true, subtree: true });

    window.addEventListener('beforeunload', () => {
      clearTimeout(dashboardTimer);
      clearTimeout(receiptTimer);
      observer.disconnect();
      clearHealthPreview();
    }, { once: true });
  });
}
