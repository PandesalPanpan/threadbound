const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const composer = stream.querySelector('[data-testid="stream-composer"]');
  const commandCard = stream.querySelector('[data-testid="stream-command-card"]');
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const connection = stream.querySelector('[data-testid="stream-connection"]');

  if (log && composer && commandCard && suggestions) {
    document.body.dataset.threadFirst = 'true';
    stream.querySelector('.stream-hint')?.setAttribute('hidden', '');

    const header = document.createElement('header');
    header.className = 'thread-game-header';
    header.dataset.testid = 'thread-game-header';
    header.innerHTML = `
      <div class="thread-game-header-top">
        <img class="thread-game-crest" src="/sprites/thread-crest.svg" alt="">
        <div class="thread-game-title"><strong>THREADBOUND</strong><span data-testid="thread-game-location">Preparing the thread…</span></div>
        <div class="thread-game-live" data-testid="thread-game-live"></div>
      </div>
      <div class="thread-game-party" data-testid="thread-game-party">
        <span class="thread-game-player-avatar" data-testid="thread-game-player-avatar">W</span>
        <div class="thread-game-player-copy"><strong data-testid="thread-game-player-name">Weaver</strong><span data-testid="thread-game-player-hp">— / — HP</span></div>
        <div class="thread-game-health" role="meter" aria-label="Player health" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"><span data-testid="thread-game-health-fill"></span></div>
        <strong class="thread-game-party-count" data-testid="thread-game-party-count">1/1</strong>
      </div>`;
    if (connection) header.querySelector('.thread-game-live').append(connection);
    else header.querySelector('.thread-game-live').textContent = 'LIVE';
    stream.prepend(header);

    const actionDock = document.createElement('section');
    actionDock.className = 'thread-action-dock';
    actionDock.dataset.testid = 'thread-action-dock';
    actionDock.setAttribute('aria-label', 'Actions and party chat');
    composer.before(actionDock);

    const style = document.createElement('style');
    style.textContent = `
      body[data-thread-first="true"] {
        --thread-bg:#1e1f22; --thread-header:#0f1117; --thread-control:#2b2d31; --thread-control-active:#25262a;
        --thread-text:#eeeef0; --thread-muted:#9498a2; --thread-purple:#9e78ff; --thread-purple-soft:#a180f5;
        --thread-blue:#61adff; --thread-green:#59d18c; --thread-red:#ff5c66; --thread-amber:#f5b047;
        margin:0; overflow:hidden; background:var(--thread-bg); color:var(--thread-text);
        font-family:"42dot Sans",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
      }
      body[data-thread-first="true"] .threadbound-topnav,
      body[data-thread-first="true"] .threadbound-game-page > :not(#stream),
      body[data-thread-first="true"] .mobile-game-nav { display:none !important; }
      body[data-thread-first="true"] .threadbound-game-page { display:block !important; width:100%; max-width:720px; min-height:100dvh; margin:0 auto; padding:0; }
      body[data-thread-first="true"] #stream {
        display:grid; grid-template-rows:auto minmax(0,1fr) auto; width:100%; height:100dvh; max-width:none;
        margin:0; padding:0; overflow:hidden; border:0; border-radius:0; background:var(--thread-bg); box-shadow:none;
      }
      body[data-thread-first="true"] #stream > .stream-heading,
      body[data-thread-first="true"] #stream > .stream-hint,
      body[data-thread-first="true"] #stream > .stream-combat-dock { display:none !important; }

      .thread-game-header { display:grid; gap:8px; padding:14px 16px 12px; background:var(--thread-header); }
      .thread-game-header-top { display:flex; align-items:center; gap:10px; min-width:0; }
      .thread-game-crest { width:34px; height:34px; flex:0 0 34px; }
      .thread-game-title { display:grid; flex:1 1 auto; min-width:0; gap:1px; line-height:1.15; }
      .thread-game-title strong { color:#f0f0f5; font-size:15px; font-weight:700; }
      .thread-game-title span { overflow:hidden; color:#8f94a8; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
      .thread-game-live { display:flex; align-items:center; gap:5px; padding:5px 8px; border-radius:999px; background:#0f291c; }
      .thread-game-live::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--thread-green); }
      .thread-game-live small { color:var(--thread-green) !important; font-size:10px; font-weight:600; line-height:12px; }
      .thread-game-live small::before { content:none !important; }
      .thread-game-party { display:flex; align-items:center; gap:8px; min-width:0; }
      .thread-game-player-avatar { display:grid; place-items:center; width:24px; height:24px; flex:0 0 24px; border-radius:50%; background:var(--thread-blue); color:#f0f0f5; font-size:10px; font-weight:700; }
      .thread-game-player-copy { display:grid; flex:0 0 auto; min-width:54px; line-height:1.2; }
      .thread-game-player-copy strong { color:#f0f0f5; font-size:11px; font-weight:600; }
      .thread-game-player-copy span { color:#8f94a8; font-size:10px; }
      .thread-game-health { height:6px; flex:1 1 auto; min-width:30px; overflow:hidden; border-radius:999px; background:#24262e; }
      .thread-game-health > span { display:block; width:0; height:100%; border-radius:inherit; background:var(--thread-green); transition:width .2s ease; }
      .thread-game-party-count { flex:0 0 auto; color:#8f94a8; font-size:11px; font-weight:600; }

      body[data-thread-first="true"] .adventure-stream-log {
        height:auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:10px 0 8px;
        border:0; border-radius:0; background:var(--thread-bg); scroll-behavior:smooth;
      }
      body[data-thread-first="true"] .adventure-stream-log::before { content:"TODAY"; display:block; padding:3px 14px 10px; color:var(--thread-muted); font-size:9px; font-weight:600; line-height:13px; text-align:center; }
      body[data-thread-first="true"] .adventure-stream-log.is-empty { height:auto; min-height:0; }
      body[data-thread-first="true"] .stream-empty { min-height:150px; color:var(--thread-muted); }
      body[data-thread-first="true"] .stream-entry,
      body[data-thread-first="true"] .stream-entry.stream-entry-system {
        display:grid; grid-template-columns:34px minmax(0,1fr); gap:10px; align-items:start;
        margin:0; padding:5px 14px 9px; border:0; border-radius:0; background:transparent; box-shadow:none;
      }
      body[data-thread-first="true"] .stream-entry + .stream-entry { margin-top:0; }
      body[data-thread-first="true"] .stream-entry:hover { background:transparent; }
      body[data-thread-first="true"] .stream-avatar { display:grid; place-items:center; width:34px; height:34px; border-radius:50%; background:var(--thread-blue); color:#f0f0f5; font-size:13px; font-weight:700; }
      body[data-thread-first="true"] .stream-entry-system .stream-avatar { background:var(--thread-purple); color:#f0f0f5; }
      body[data-thread-first="true"] .stream-entry-content { min-width:0; }
      body[data-thread-first="true"] .stream-entry-meta { display:flex; align-items:center; justify-content:flex-start; gap:6px; min-height:16px; }
      body[data-thread-first="true"] .stream-entry-meta strong,
      body[data-thread-first="true"] .stream-entry-system .stream-entry-meta strong { color:var(--thread-blue); font-size:12px; font-weight:600; letter-spacing:0; }
      body[data-thread-first="true"] .stream-entry-system .stream-entry-meta strong { color:var(--thread-purple); }
      body[data-thread-first="true"] .stream-entry-meta time { order:3; color:var(--thread-muted); font-size:9px; }
      body[data-thread-first="true"] .stream-entry p { margin:2px 0 0; color:var(--thread-text); font-size:12px; font-weight:400; line-height:17px; }
      body[data-thread-first="true"] .stream-system-tag { order:2; display:inline-flex; margin:0; padding:1px 5px; border:0; border-radius:3px; background:var(--thread-purple); color:#fff; font-size:8px; font-weight:700; line-height:12px; letter-spacing:0; }
      body[data-thread-first="true"] .stream-entry-rich .stream-rich-receipt,
      body[data-thread-first="true"] .stream-entry-rich .stream-rich-header,
      body[data-thread-first="true"] .stream-entry-rich .stream-rich-body { border:0; background:transparent; box-shadow:none; }
      body[data-thread-first="true"] .stream-rich-receipt { gap:2px; }
      body[data-thread-first="true"] .stream-rich-kicker,
      body[data-thread-first="true"] .stream-rich-phase,
      body[data-thread-first="true"] .stream-health-grid,
      body[data-thread-first="true"] .stream-action-forecast,
      body[data-thread-first="true"] .stream-outcome-banner.upgrade { display:none !important; }
      body[data-thread-first="true"] .stream-rich-summary { margin:0; color:var(--thread-text); font-size:12px; font-weight:400; line-height:17px; }
      body[data-thread-first="true"] .stream-result-chips { gap:8px; }
      body[data-thread-first="true"] .stream-result-chip { min-height:0; padding:0; border:0; background:transparent !important; box-shadow:none !important; font-size:11px; }

      .thread-action-dock { display:grid; gap:8px; min-height:0; margin:0; padding:10px 12px 12px; border:0; background:var(--thread-bg); }
      .stream-thread-local { display:grid; min-width:0; padding:0; border:0; background:transparent; box-shadow:none; }
      .stream-thread-local-content { display:grid; gap:8px; min-width:0; }
      .stream-thread-local .stream-decision-snapshot { display:grid; gap:4px; margin:0; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; }
      .stream-thread-local .stream-decision-head,
      .stream-thread-local .stream-decision-label,
      .stream-thread-local .stream-party-vitals,
      .stream-thread-local .stream-action-section-head,
      .stream-thread-local .stream-meta-actions { display:none !important; }
      .stream-thread-local .stream-decision-grid { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
      .stream-thread-local .stream-intent-receipt { margin:0; padding:5px 8px; border:0; border-radius:6px; background:#352a20; color:#ffd0a3; font-size:10px; }
      .stream-thread-local .stream-primary-actions,
      .stream-thread-local .combat-skill-panel { margin:0 !important; padding:0 !important; border:0 !important; background:transparent !important; box-shadow:none !important; }
      .stream-thread-local .stream-suggestions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; margin:0; padding:0; overflow:visible; }
      .stream-thread-local .stream-suggestions::before { content:none !important; }
      .stream-thread-local .stream-suggestions button { position:relative; display:flex; align-items:center; justify-content:center; gap:6px; min-width:0; min-height:33px !important; margin:0 !important; padding:8px !important; overflow:hidden; border:0 !important; border-radius:7px !important; background:var(--thread-control) !important; color:#e0e3e8 !important; font-size:11px !important; font-weight:600 !important; text-overflow:ellipsis; white-space:nowrap; }
      .stream-thread-local .stream-suggestions button::before { content:""; position:static; width:8px; height:8px; flex:0 0 8px; border-radius:50%; background:var(--thread-blue); transform:none; }
      .stream-thread-local .stream-suggestions button[data-command^="/run"] { grid-column:1 / -1; }
      .stream-thread-local .stream-suggestions button[data-command="/attack"]::before { background:var(--thread-red); }
      .stream-thread-local .stream-suggestions button[data-command="/gear"]::before { background:var(--thread-amber); }
      .stream-thread-local .stream-suggestions button[data-thread-command="item"]::before { background:var(--thread-amber); }
      .stream-thread-local .stream-suggestions button[hidden] { display:none !important; }
      .stream-thread-local .stream-suggestions button:disabled { opacity:.45; }
      .stream-thread-local .stream-suggestions button[data-preview-wired="true"]::after,
      .stream-thread-local .combat-skill[data-preview-wired="true"]::after { display:none !important; }
      .stream-thread-local .combat-skill-panel { display:flex; gap:6px !important; overflow-x:auto; scrollbar-width:none; }
      .stream-thread-local .combat-skill-panel[hidden] { display:none !important; }
      .stream-thread-local .combat-skill-head,
      .stream-thread-local .combat-status-line { display:none !important; }
      .stream-thread-local .combat-skill-grid { display:flex; flex:1 0 auto; gap:6px; }
      .stream-thread-local .combat-skill { flex:1 0 112px; min-height:34px !important; padding:6px 8px !important; gap:0 !important; border:0 !important; border-radius:7px !important; background:#25262a !important; color:#dedee4 !important; }
      .stream-thread-local .combat-skill strong { font-size:10px; }
      .stream-thread-local .combat-skill small { font-size:9px; }
      .stream-thread-local .combat-skill small:last-child { display:none; }

      body[data-thread-first="true"] .adventure-stream-composer { display:flex; align-items:center; gap:8px; margin:0; padding:8px 8px 8px 12px; border-radius:8px; background:var(--thread-control-active); }
      body[data-thread-first="true"] .adventure-stream-composer input { min-width:0; min-height:28px; flex:1 1 auto; padding:0; border:0; border-radius:0; background:transparent; color:var(--thread-text); font-size:12px; box-shadow:none; }
      body[data-thread-first="true"] .adventure-stream-composer input::placeholder { color:var(--thread-muted); opacity:1; }
      body[data-thread-first="true"] .adventure-stream-composer button { display:grid; place-items:center; width:28px; min-width:28px; height:28px; min-height:28px; padding:0; border:0; border-radius:50%; background:var(--thread-purple-soft); color:#f0f0f5; font-size:18px; font-weight:600; }
      body[data-thread-first="true"] .stream-error { position:absolute; right:12px; bottom:112px; left:12px; z-index:40; margin:0; padding:7px 9px; border-radius:7px; background:#3a1f25; font-size:11px; }
      body[data-thread-first="true"] .stream-command-card { margin:5px 14px 9px 58px; padding:9px; border:1px solid #34353a; border-radius:7px; background:#25262a; box-shadow:none; }
      body[data-thread-first="true"] .thread-reply-header span { color:var(--thread-purple); }
      body[data-thread-first="true"] .thread-gear-list { max-height:none; overflow:visible; }

      @media (max-width:720px) {
        body[data-thread-first="true"] .threadbound-page { width:100%; padding:0; }
        body[data-thread-first="true"] #stream { height:100dvh; }
        body[data-thread-first="true"] .adventure-stream-log { min-height:0; padding-inline:0; }
        body[data-thread-first="true"] .adventure-stream-composer { position:static; padding-top:8px; background:var(--thread-control-active); }
      }
      @media (min-width:721px) {
        body[data-thread-first="true"] { background:#151619; }
        body[data-thread-first="true"] #stream { box-shadow:0 0 0 1px #2b2d31; }
      }
      @media (prefers-reduced-motion:reduce) {
        .thread-game-health > span { transition:none; }
        body[data-thread-first="true"] .adventure-stream-log { scroll-behavior:auto; }
      }
    `;
    document.head.append(style);

    let localSurface = null;
    let localContent = null;
    let scheduled = false;
    let headerTimer = null;

    function setText(element, value) {
      if (element && element.textContent !== value) element.textContent = value;
    }

    function ensureLocalSurface() {
      if (!localSurface) {
        localSurface = document.createElement('article');
        localSurface.className = 'stream-thread-local';
        localSurface.dataset.testid = 'stream-thread-local';
        localSurface.setAttribute('aria-label', 'Private player controls');
        localContent = document.createElement('div');
        localContent.className = 'stream-thread-local-content';
        localSurface.append(localContent);
      }
      if (localSurface.parentElement !== actionDock) actionDock.prepend(localSurface);
      if (composer.parentElement !== actionDock) actionDock.append(composer);
    }

    function labelActions() {
      const labels = new Map([['/attack', '/strike'], ['/guard', '/guard'], ['/interrupt', '/interrupt'], ['/mend', '/mend'], ['/revive', '/revive']]);
      for (const button of suggestions.querySelectorAll('button[data-command]')) {
        const name = String(button.dataset.command || '').split(/\s+/)[0];
        if (!labels.has(name) || button.dataset.threadLabelled === 'true') continue;
        button.dataset.threadLabelled = 'true';
        button.setAttribute('aria-label', button.textContent || labels.get(name));
        button.textContent = labels.get(name);
      }
    }

    function syncItemAction() {
      const hasCombatAction = suggestions.querySelector('button[data-command="/attack"]');
      const source = suggestions.querySelector('button.ux-meta-source[data-command="/gear"]');
      let item = suggestions.querySelector('button[data-thread-command="item"]');
      if (!hasCombatAction || !source) {
        item?.remove();
        return;
      }
      if (item) return;
      item = document.createElement('button');
      item.type = 'button';
      item.dataset.threadCommand = 'item';
      item.dataset.testid = 'stream-item';
      item.textContent = '/item';
      item.setAttribute('aria-label', 'Gear');
      item.addEventListener('click', () => source.click());
      suggestions.append(item);
    }

    function decorateEntries() {
      for (const row of log.querySelectorAll('.stream-entry-system')) {
        const avatar = row.querySelector('.stream-avatar');
        setText(avatar, 'T');
        const meta = row.querySelector('.stream-entry-meta');
        const tag = row.querySelector('.stream-system-tag');
        if (meta && tag && tag.parentElement !== meta) {
          setText(tag, 'APP');
          meta.querySelector('strong')?.after(tag);
        }
      }
    }

    function movePresentationIntoDock() {
      ensureLocalSurface();
      const decision = stream.querySelector('[data-testid="stream-decision-snapshot"]');
      const primary = stream.querySelector('[data-testid="stream-primary-actions"]');
      const meta = stream.querySelector('[data-testid="stream-meta-actions"]');
      const skill = stream.querySelector('[data-testid="combat-skill-panel"]');
      for (const node of [decision, primary, meta].filter(Boolean)) if (node.parentElement !== localContent) localContent.append(node);
      if (!primary && suggestions.parentElement !== localContent) localContent.append(suggestions);
      if (skill && !primary && skill.parentElement !== localContent) localContent.append(skill);
      if (commandCard.parentElement !== log) log.append(commandCard);
      labelActions();
      syncItemAction();
      decorateEntries();
    }

    async function refreshHeader() {
      try {
        const response = await fetch('/api/dashboard', { headers:{ Accept:'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        const run = data.activeRun;
        const viewer = run?.viewer;
        const character = data.character;
        const displayName = character?.displayName || viewer?.displayName || 'Weaver';
        const currentHp = Number(viewer?.hp ?? character?.maxHealth ?? 0);
        const maxHp = Math.max(1, Number(viewer?.maxHp ?? character?.maxHealth ?? 1));
        const participants = run?.participants || [];
        setText(header.querySelector('[data-testid="thread-game-player-name"]'), displayName);
        setText(header.querySelector('[data-testid="thread-game-player-avatar"]'), displayName.slice(0, 1).toUpperCase());
        setText(header.querySelector('[data-testid="thread-game-player-hp"]'), `${currentHp} / ${maxHp} HP`);
        setText(header.querySelector('[data-testid="thread-game-party-count"]'), `${participants.filter((participant) => participant.hp > 0).length || 1}/${participants.length || 1}`);
        setText(header.querySelector('[data-testid="thread-game-location"]'), run ? `${run.dungeonDefinition?.name || run.dungeonId} · ${run.phase === 'boss' ? 'Boss' : `Fight ${Number(run.encounterIndex || 0) + 1}`}` : 'Choose a dungeon to begin');
        const meter = header.querySelector('.thread-game-health');
        meter.setAttribute('aria-valuemax', String(maxHp));
        meter.setAttribute('aria-valuenow', String(currentHp));
        header.querySelector('[data-testid="thread-game-health-fill"]').style.width = `${Math.max(0, Math.min(100, currentHp / maxHp * 100))}%`;
      } catch {
        // The stream owns connection errors; the compact header remains usable as a shell.
      }
    }

    function schedule() {
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          movePresentationIntoDock();
        });
      }
      clearTimeout(headerTimer);
      headerTimer = setTimeout(refreshHeader, 80);
    }

    const streamObserver = new MutationObserver(schedule);
    streamObserver.observe(stream, { childList:true, subtree:true });
    movePresentationIntoDock();
    refreshHeader();
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });

    window.addEventListener('beforeunload', () => {
      clearTimeout(headerTimer);
      streamObserver.disconnect();
    }, { once:true });
  }
}
