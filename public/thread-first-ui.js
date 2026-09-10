const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const composer = stream.querySelector('[data-testid="stream-composer"]');
  const commandCard = stream.querySelector('[data-testid="stream-command-card"]');
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const hint = stream.querySelector('.stream-hint');

  if (log && composer && commandCard && suggestions) {
    document.body.dataset.threadFirst = 'true';
    if (hint) hint.textContent = 'The chat is the game. Shared actions stay in the thread; the compact controls at the bottom are private to you.';

    const style = document.createElement('style');
    style.textContent = `
      body[data-thread-first="true"] .threadbound-game-page { display:block !important; max-width:1180px; }
      body[data-thread-first="true"] .threadbound-game-page > .page-hero,
      body[data-thread-first="true"] .threadbound-game-page > #status,
      body[data-thread-first="true"] .threadbound-game-page > #identity,
      body[data-thread-first="true"] .threadbound-game-page > #character,
      body[data-thread-first="true"] .threadbound-game-page > #party,
      body[data-thread-first="true"] .threadbound-game-page > #dungeon,
      body[data-thread-first="true"] .threadbound-game-page > #inventory,
      body[data-thread-first="true"] .threadbound-game-page > #achievements,
      body[data-thread-first="true"] .threadbound-game-page > #world,
      body[data-thread-first="true"] .threadbound-game-page > #honey,
      body[data-thread-first="true"] .mobile-game-nav { display:none !important; }
      body[data-thread-first="true"] #stream { max-width:1120px; margin-inline:auto; }
      body[data-thread-first="true"] .adventure-stream-log { height:min(78vh,860px); min-height:560px; padding:8px; }

      /* The chat is primary. Keep one small private composer instead of a dashboard stack. */
      .stream-thread-local {
        display:grid; grid-template-columns:minmax(0,1fr); gap:0; align-items:start;
        margin-top:7px; padding:7px 9px; border:1px solid rgba(85,214,255,.18); border-radius:12px;
        background:linear-gradient(145deg,rgba(7,18,32,.96),rgba(5,10,20,.98));
        box-shadow:inset 3px 0 0 rgba(85,214,255,.5);
      }
      .stream-thread-local-avatar, .stream-thread-local-meta { display:none !important; }
      .stream-thread-local-content { min-width:0; }

      /* Temporary roguelite build UI and duplicated transition snapshots are intentionally
         absent from the streamlined chat surface. Legacy state can still exist server-side. */
      body[data-thread-first="true"] .stream-build-summary,
      body[data-thread-first="true"] .ux-transition-state,
      body[data-thread-first="true"] .stream-decision-snapshot .stream-action-forecast { display:none !important; }

      .stream-thread-local .stream-decision-snapshot,
      .stream-thread-local .stream-primary-actions,
      .stream-thread-local .stream-meta-actions,
      .stream-thread-local .combat-skill-panel {
        margin:0 !important; padding:5px 0 !important; border:0 !important; border-radius:0 !important;
        background:transparent !important; box-shadow:none !important;
      }
      .stream-thread-local .stream-primary-actions,
      .stream-thread-local .stream-meta-actions,
      .stream-thread-local .combat-skill-panel { border-top:1px solid rgba(255,255,255,.065) !important; }

      /* Compact HUD: HP is glanceable without becoming its own card stack. */
      .stream-thread-local .stream-decision-head { display:none !important; }
      .stream-thread-local .stream-decision-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
      .stream-thread-local .stream-decision-unit {
        grid-template-columns:28px minmax(0,1fr); gap:6px; padding:4px 6px;
        border:0; border-radius:8px; background:rgba(255,255,255,.025);
      }
      .stream-thread-local .stream-decision-unit img { width:27px; height:27px; }
      .stream-thread-local .stream-decision-label { display:none; }
      .stream-thread-local .stream-decision-top strong { font-size:.66rem; }
      .stream-thread-local .stream-decision-value { font-size:.62rem; }
      .stream-thread-local .stream-decision-sub { margin-top:1px; font-size:.55rem; }
      .stream-thread-local .stream-decision-track { height:4px; margin-top:3px; }
      .stream-thread-local .stream-party-vitals { gap:4px; margin-top:3px; }
      .stream-thread-local .stream-party-vital { min-height:21px; padding:2px 6px; font-size:.56rem; }
      .stream-thread-local .stream-intent-receipt { margin-top:4px; padding:5px 7px; font-size:.62rem; }

      /* Immediate actions stay large enough to tap, but lose the panel chrome/headings. */
      .stream-thread-local .stream-action-section-head { display:none !important; }
      .stream-thread-local .stream-suggestions { padding:0 !important; gap:5px !important; }
      .stream-thread-local .stream-suggestions::before { content:none !important; }
      .stream-thread-local .stream-suggestions button { min-height:42px !important; margin:0 !important; }

      /* Skills remain a single cooldown/focus row instead of a second dashboard. */
      .stream-thread-local .combat-skill-panel { gap:5px !important; }
      .stream-thread-local .combat-skill-head { min-height:24px; }
      .stream-thread-local .combat-skill-kicker { display:none !important; }
      .stream-thread-local .combat-focus-copy { margin:0; }
      .stream-thread-local .combat-focus-copy strong { font-size:.62rem; }
      .stream-thread-local .combat-focus-copy span { font-size:.55rem; }
      .stream-thread-local .combat-focus-pips { display:none !important; }
      .stream-thread-local .combat-status-line { min-height:0; gap:4px; }
      .stream-thread-local .combat-status-badge { min-height:21px; padding:2px 6px; font-size:.55rem; }
      .stream-thread-local .combat-skill-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; }
      .stream-thread-local .combat-skill { min-height:42px !important; padding:5px 7px !important; gap:1px !important; }
      .stream-thread-local .combat-skill strong { font-size:.63rem; }
      .stream-thread-local .combat-skill small { font-size:.52rem; }
      .stream-thread-local .combat-skill small:last-child { display:none; }
      .stream-thread-local .run-event-choice-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }

      /* Navigation is a quiet utility strip, not another gameplay panel. */
      .stream-thread-local .stream-meta-actions { padding-top:5px !important; }
      .stream-thread-local .stream-meta-actions-row { gap:4px; }
      .stream-thread-local .stream-meta-actions-row button {
        flex:1 1 auto; min-height:30px !important; padding:4px 7px !important; border-radius:7px;
        font-size:.57rem !important; background:rgba(255,255,255,.025) !important;
      }

      /* Private slash-command replies live inside the same scrollable conversation. */
      body[data-thread-first="true"] .stream-command-card {
        margin:8px 0 4px 0; padding:10px; border-radius:12px;
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
        body[data-thread-first="true"] .threadbound-page { padding:6px; }
        body[data-thread-first="true"] #stream { padding:7px; border-radius:11px; }
        body[data-thread-first="true"] .stream-heading h2 { font-size:.92rem; }
        body[data-thread-first="true"] .stream-heading > div > span { font-size:.52rem; }
        body[data-thread-first="true"] .adventure-stream-log { height:calc(100dvh - 150px); min-height:560px; padding:4px; }
        .stream-thread-local { padding:6px 7px; }
        .stream-thread-local .stream-decision-grid { grid-template-columns:1fr 1fr; gap:4px; }
        .stream-thread-local .stream-decision-unit { grid-template-columns:24px minmax(0,1fr); padding:3px 4px; gap:4px; }
        .stream-thread-local .stream-decision-unit img { width:23px; height:23px; }
        .stream-thread-local .combat-skill-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .stream-thread-local .run-event-choice-grid { grid-template-columns:1fr; }
        .stream-thread-local .stream-primary-actions[data-mode="upgrade"] .stream-suggestions { grid-template-columns:1fr; }
        body[data-thread-first="true"] .stream-command-card { margin-left:0; padding:8px; }
        body[data-thread-first="true"] .thread-gear-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
        body[data-thread-first="true"] .thread-gear-row { grid-template-columns:34px minmax(0,1fr); padding:7px; }
        body[data-thread-first="true"] .thread-sprite.small { width:32px; height:32px; }
        body[data-thread-first="true"] .thread-gear-copy > div { display:grid; gap:1px; }
        body[data-thread-first="true"] .thread-gear-copy strong { white-space:normal; font-size:.7rem; }
        body[data-thread-first="true"] .thread-gear-copy span { font-size:.54rem; }
        body[data-thread-first="true"] .thread-gear-copy small { font-size:.61rem; }
        body[data-thread-first="true"] .thread-gear-actions { grid-template-columns:1fr; }
        body[data-thread-first="true"] .adventure-stream-composer { position:sticky; bottom:env(safe-area-inset-bottom); z-index:30; margin-top:4px; padding-top:4px; }
      }

      @media (max-width:390px) {
        body[data-thread-first="true"] .thread-gear-list { grid-template-columns:1fr 1fr; }
        .stream-thread-local .stream-decision-grid { grid-template-columns:1fr 1fr; }
        .stream-thread-local .combat-skill-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .stream-thread-local .combat-skill { padding-inline:4px !important; }
        .stream-thread-local .combat-skill strong { font-size:.57rem; }
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
      const primary = stream.querySelector('[data-testid="stream-primary-actions"]');
      const meta = stream.querySelector('[data-testid="stream-meta-actions"]');
      const skill = stream.querySelector('[data-testid="combat-skill-panel"]');

      const ordered = [decision, primary, meta].filter(Boolean);
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
