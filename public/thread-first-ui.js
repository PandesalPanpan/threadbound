const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const composer = stream.querySelector('[data-testid="stream-composer"]');
  const commandCard = stream.querySelector('[data-testid="stream-command-card"]');
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const hint = stream.querySelector('.stream-hint');

  if (log && composer && commandCard && suggestions) {
    document.body.dataset.threadFirst = 'true';
    if (hint) hint.textContent = 'Shared receipts stay in this thread. The bottom card is private to you and only shows actions you can take.';

    const style = document.createElement('style');
    style.textContent = `
      body[data-thread-first="true"] .threadbound-game-page { display:block !important; max-width:1040px; }
      body[data-thread-first="true"] .threadbound-game-page > #identity,
      body[data-thread-first="true"] .threadbound-game-page > #character,
      body[data-thread-first="true"] .threadbound-game-page > #party,
      body[data-thread-first="true"] .threadbound-game-page > #dungeon,
      body[data-thread-first="true"] .threadbound-game-page > #inventory,
      body[data-thread-first="true"] .threadbound-game-page > #achievements,
      body[data-thread-first="true"] .threadbound-game-page > #world,
      body[data-thread-first="true"] .threadbound-game-page > #honey,
      body[data-thread-first="true"] .mobile-game-nav { display:none !important; }
      body[data-thread-first="true"] #stream { max-width:960px; margin-inline:auto; }
      body[data-thread-first="true"] .adventure-stream-log { height:min(68vh,760px); min-height:520px; padding:8px; }

      .stream-thread-local {
        display:grid; grid-template-columns:32px minmax(0,1fr); gap:8px; align-items:start;
        margin-top:7px; padding:8px 7px; border:1px solid rgba(85,214,255,.22); border-radius:12px;
        background:linear-gradient(145deg,rgba(7,18,32,.96),rgba(5,10,20,.98));
        box-shadow:inset 3px 0 0 rgba(85,214,255,.66);
      }
      .stream-thread-local-avatar { width:30px; height:30px; display:grid; place-items:center; border-radius:9px; background:rgba(85,214,255,.11); color:#a9efff; font-size:.72rem; font-weight:1000; }
      .stream-thread-local-content { min-width:0; }
      .stream-thread-local-meta { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:5px; }
      .stream-thread-local-meta strong { color:#a9efff; font-size:.66rem; font-weight:1000; letter-spacing:.09em; }
      .stream-thread-local-meta small { color:var(--muted); font-size:.58rem; }

      /* One chat bubble, not a stack of competing panels. */
      .stream-thread-local .stream-decision-snapshot,
      .stream-thread-local .stream-primary-actions,
      .stream-thread-local .stream-meta-actions,
      .stream-thread-local .combat-skill-panel,
      .stream-thread-local .stream-build-summary {
        margin:0 !important; padding:7px 0 !important; border:0 !important; border-radius:0 !important;
        background:transparent !important; box-shadow:none !important;
      }
      .stream-thread-local .stream-decision-snapshot + .stream-build-summary,
      .stream-thread-local .stream-build-summary + .stream-primary-actions,
      .stream-thread-local .stream-decision-snapshot + .stream-primary-actions,
      .stream-thread-local .stream-primary-actions + .stream-meta-actions,
      .stream-thread-local .combat-skill-panel { border-top:1px solid rgba(255,255,255,.075) !important; }
      .stream-thread-local .stream-action-section-head { margin-bottom:4px; }
      .stream-thread-local .stream-action-section-head small { color:#7f8da5; }
      .stream-thread-local .stream-meta-actions-row { gap:5px; }
      .stream-thread-local .stream-meta-actions-row button { min-height:42px !important; }
      .stream-thread-local .stream-suggestions { padding:1px 0 2px !important; }
      .stream-thread-local .stream-suggestions::before { content:none !important; }
      .stream-thread-local .combat-skill-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .stream-thread-local .run-event-choice-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }

      /* Private slash-command replies now live inside the same scrollable conversation. */
      body[data-thread-first="true"] .stream-command-card {
        margin:8px 0 4px 40px; padding:10px; border-radius:12px;
        background:linear-gradient(145deg,rgba(17,34,52,.96),rgba(8,15,28,.99));
      }
      body[data-thread-first="true"] .thread-gear-list {
        display:grid; grid-template-columns:repeat(auto-fill,minmax(178px,1fr)); gap:8px; max-height:none; overflow:visible;
      }
      body[data-thread-first="true"] .thread-gear-row {
        grid-template-columns:42px minmax(0,1fr); align-content:start; gap:7px; min-width:0;
      }
      body[data-thread-first="true"] .thread-gear-actions { grid-column:1 / -1; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); width:100%; }
      body[data-thread-first="true"] .thread-equipped-badge { grid-column:1 / -1; max-width:none; text-align:left; }

      @media (max-width:720px) {
        body[data-thread-first="true"] .threadbound-page { padding:8px; }
        body[data-thread-first="true"] .page-hero { display:none; }
        body[data-thread-first="true"] #status { margin:4px 0 7px; padding:5px 8px; font-size:.72rem; }
        body[data-thread-first="true"] #stream { padding:8px; border-radius:12px; }
        body[data-thread-first="true"] .stream-heading h2 { font-size:1rem; }
        body[data-thread-first="true"] .stream-heading > div > span { font-size:.56rem; }
        body[data-thread-first="true"] .adventure-stream-log { height:calc(100dvh - 205px); min-height:520px; padding:5px; }
        .stream-thread-local { grid-template-columns:28px minmax(0,1fr); gap:6px; padding:7px 6px; }
        .stream-thread-local-avatar { width:26px; height:26px; border-radius:8px; }
        .stream-thread-local-meta small { display:none; }
        .stream-thread-local .stream-decision-grid { grid-template-columns:1fr 1fr; gap:5px; }
        .stream-thread-local .stream-decision-unit { grid-template-columns:30px minmax(0,1fr); padding:6px; gap:6px; }
        .stream-thread-local .stream-decision-unit img { width:28px; height:28px; }
        .stream-thread-local .combat-skill-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .stream-thread-local .run-event-choice-grid { grid-template-columns:1fr; }
        .stream-thread-local .stream-primary-actions[data-mode="upgrade"] .stream-suggestions { grid-template-columns:1fr; }
        body[data-thread-first="true"] .stream-command-card { margin-left:34px; padding:8px; }
        body[data-thread-first="true"] .thread-gear-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
        body[data-thread-first="true"] .thread-gear-row { grid-template-columns:34px minmax(0,1fr); padding:7px; }
        body[data-thread-first="true"] .thread-sprite.small { width:32px; height:32px; }
        body[data-thread-first="true"] .thread-gear-copy > div { display:grid; gap:1px; }
        body[data-thread-first="true"] .thread-gear-copy strong { white-space:normal; font-size:.7rem; }
        body[data-thread-first="true"] .thread-gear-copy span { font-size:.54rem; }
        body[data-thread-first="true"] .thread-gear-copy small { font-size:.61rem; }
        body[data-thread-first="true"] .thread-gear-actions { grid-template-columns:1fr; }
        body[data-thread-first="true"] .adventure-stream-composer { position:sticky; bottom:env(safe-area-inset-bottom); z-index:30; margin-top:5px; padding-top:5px; }
      }

      @media (max-width:390px) {
        body[data-thread-first="true"] .thread-gear-list { grid-template-columns:1fr 1fr; }
        .stream-thread-local .stream-decision-grid { grid-template-columns:1fr; }
      }
    `;
    document.head.append(style);

    let localSurface = null;
    let localContent = null;
    let scheduled = false;

    function ensureLocalSurface() {
      if (!localSurface) {
        localSurface = document.createElement('article');
        localSurface.className = 'stream-thread-local';
        localSurface.dataset.testid = 'stream-thread-local';
        localSurface.dataset.threadLocalSurface = 'true';
        localSurface.setAttribute('aria-label', 'Private player controls');

        const avatar = document.createElement('span');
        avatar.className = 'stream-thread-local-avatar';
        avatar.textContent = 'YOU';
        localContent = document.createElement('div');
        localContent.className = 'stream-thread-local-content';
        const meta = document.createElement('div');
        meta.className = 'stream-thread-local-meta';
        const label = document.createElement('strong');
        label.textContent = 'YOUR VIEW · PRIVATE CONTROLS';
        const note = document.createElement('small');
        note.textContent = 'Other Weavers see their own legal actions';
        meta.append(label, note);
        localContent.append(meta);
        localSurface.append(avatar, localContent);
      }
      if (localSurface.parentElement !== log) log.append(localSurface);
      return localSurface;
    }

    function stripSourceTestIds() {
      for (const source of suggestions.querySelectorAll('button.ux-meta-source[data-testid], button[data-meta-command][data-testid]')) {
        if (!source.dataset.uxOriginalTestid) source.dataset.uxOriginalTestid = source.dataset.testid;
        source.removeAttribute('data-testid');
      }
    }

    function movePresentationIntoThread() {
      ensureLocalSurface();
      const decision = stream.querySelector('[data-testid="stream-decision-snapshot"]');
      const build = stream.querySelector('[data-testid="stream-build-summary"]');
      const primary = stream.querySelector('[data-testid="stream-primary-actions"]');
      const meta = stream.querySelector('[data-testid="stream-meta-actions"]');
      const skill = stream.querySelector('[data-testid="combat-skill-panel"]');

      const ordered = [decision, build, primary, meta].filter(Boolean);
      for (const node of ordered) if (node.parentElement !== localContent) localContent.append(node);
      if (!primary && suggestions.parentElement !== localContent) localContent.append(suggestions);
      if (skill && !primary && skill.parentElement !== localContent) localContent.append(skill);

      if (commandCard.parentElement !== log) log.append(commandCard);
      if (commandCard.nextElementSibling !== localSurface) log.insertBefore(commandCard, localSurface);
      if (localSurface !== log.lastElementChild) log.append(localSurface);
      stripSourceTestIds();
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        movePresentationIntoThread();
      });
    }

    const streamObserver = new MutationObserver(schedule);
    streamObserver.observe(stream, { childList:true, subtree:true });
    const commandObserver = new MutationObserver(() => {
      schedule();
      if (!commandCard.hidden) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    });
    commandObserver.observe(commandCard, { attributes:true, attributeFilter:['hidden'], childList:true, subtree:true });

    movePresentationIntoThread();
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });

    window.addEventListener('beforeunload', () => {
      streamObserver.disconnect();
      commandObserver.disconnect();
    }, { once:true });
  }
}
