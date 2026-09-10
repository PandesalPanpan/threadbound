import { enemySprite, weaverSprite } from './sprite-catalog.js';

const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const commandCard = stream.querySelector('[data-testid="stream-command-card"]');
  const composer = stream.querySelector('[data-testid="stream-composer"]');

  const style = document.createElement('style');
  style.textContent = `
    .stream-decision-snapshot {
      display:grid; gap:8px; margin-top:9px; padding:10px;
      border:1px solid rgba(85,214,255,.24); border-radius:13px;
      background:linear-gradient(145deg,rgba(9,19,34,.97),rgba(5,11,23,.98));
      box-shadow:inset 3px 0 0 rgba(85,214,255,.62);
    }
    .stream-decision-snapshot[hidden] { display:none !important; }
    .stream-decision-head { display:flex; align-items:end; justify-content:space-between; gap:10px; }
    .stream-decision-head span { display:block; color:#9feaff; font-size:.57rem; font-weight:1000; letter-spacing:.12em; }
    .stream-decision-head strong { display:block; margin-top:2px; font-size:.82rem; }
    .stream-decision-head small { color:var(--muted); font-size:.64rem; font-weight:800; }
    .stream-decision-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
    .stream-decision-unit {
      display:grid; grid-template-columns:38px minmax(0,1fr); gap:8px; align-items:center;
      min-width:0; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:10px;
      background:rgba(2,8,17,.54);
    }
    .stream-decision-unit.you { border-color:rgba(102,240,174,.25); }
    .stream-decision-unit.enemy { border-color:rgba(255,95,120,.28); }
    .stream-decision-unit.is-low { border-color:rgba(255,95,120,.5); box-shadow:inset 0 0 0 1px rgba(255,95,120,.08); }
    .stream-decision-unit img { width:36px; height:36px; object-fit:contain; image-rendering:pixelated; }
    .stream-decision-copy { min-width:0; }
    .stream-decision-label { display:block; color:var(--muted); font-size:.51rem; font-weight:1000; letter-spacing:.1em; }
    .stream-decision-top { display:flex; align-items:baseline; justify-content:space-between; gap:6px; min-width:0; }
    .stream-decision-top strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.72rem; }
    .stream-decision-value { flex:0 0 auto; color:#fff; font-size:.68rem; font-weight:1000; font-variant-numeric:tabular-nums; }
    .stream-decision-sub { display:block; margin-top:2px; color:#a9c8ff; font-size:.62rem; font-weight:850; }
    .stream-decision-track { position:relative; height:7px; margin-top:5px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.08); }
    .stream-decision-track > span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#66f0ae,#b8f36b); transition:width .28s cubic-bezier(.2,.8,.2,1); }
    .stream-decision-unit.enemy .stream-decision-track > span { background:linear-gradient(90deg,#ff5f78,#ff8e68); }
    .stream-decision-unit.is-low .stream-decision-track > span { background:linear-gradient(90deg,#ff5f78,#ffd166); }
    .stream-party-vitals { display:flex; flex-wrap:wrap; gap:5px; }
    .stream-party-vital { display:inline-flex; align-items:center; gap:4px; min-height:25px; padding:3px 7px; border:1px solid rgba(85,214,255,.18); border-radius:8px; background:rgba(85,214,255,.06); color:#dff8ff; font-size:.61rem; font-weight:850; }
    .stream-party-vital.is-low { border-color:rgba(255,95,120,.35); color:#ffd5dc; background:rgba(255,95,120,.08); }

    .stream-action-forecast {
      display:grid; grid-template-columns:auto minmax(0,1fr); gap:9px; align-items:center;
      min-height:48px; padding:7px 9px; border:1px solid #ffe45c; border-radius:10px;
      background:#171404; box-shadow:inset 3px 0 0 #ffe45c,0 0 18px rgba(255,228,92,.08);
    }
    .stream-action-forecast strong { color:#fff3a3; font-size:1.05rem; font-weight:1000; font-variant-numeric:tabular-nums; text-shadow:0 0 12px rgba(255,228,92,.22); }
    .stream-action-forecast-copy { min-width:0; }
    .stream-action-forecast-copy span { display:block; color:#ffe45c; font-size:.53rem; font-weight:1000; letter-spacing:.1em; }
    .stream-action-forecast-copy b { display:block; margin-top:1px; color:#fff9d4; font-size:.68rem; line-height:1.3; }
    .stream-action-forecast-copy small { display:block; margin-top:2px; color:#d9cf95; font-size:.59rem; line-height:1.25; }

    .stream-primary-actions, .stream-meta-actions {
      display:grid; gap:6px; margin-top:8px; padding:8px 9px;
      border:1px solid rgba(85,214,255,.15); border-radius:12px; background:rgba(5,11,22,.56);
    }
    .stream-primary-actions[data-mode="combat"], .stream-primary-actions[data-mode="boss"] { border-color:rgba(85,214,255,.24); box-shadow:inset 3px 0 0 rgba(85,214,255,.48); }
    .stream-primary-actions[data-mode="upgrade"] { border-color:rgba(210,164,255,.3); box-shadow:inset 3px 0 0 rgba(210,164,255,.62); background:linear-gradient(145deg,rgba(24,14,42,.8),rgba(7,12,25,.78)); }
    .stream-primary-actions[data-mode="event"] { border-color:rgba(255,224,107,.32); box-shadow:inset 3px 0 0 rgba(255,224,107,.64); background:linear-gradient(145deg,rgba(37,29,7,.58),rgba(7,12,25,.8)); }
    .stream-action-section-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .stream-action-section-head strong { color:#eaf8ff; font-size:.58rem; font-weight:1000; letter-spacing:.12em; }
    .stream-action-section-head small { color:var(--muted); font-size:.57rem; }
    .stream-primary-actions[data-mode="upgrade"] .stream-action-section-head strong { color:#ead8ff; }
    .stream-primary-actions[data-mode="event"] .stream-action-section-head strong { color:#fff0a6; }
    .stream-meta-actions { border-color:rgba(255,255,255,.075); box-shadow:none; background:rgba(3,8,17,.38); }
    .stream-meta-actions .stream-action-section-head strong { color:#aab7cc; }
    .stream-meta-actions-row { display:flex; gap:5px; overflow-x:auto; padding-bottom:1px; scrollbar-width:none; }
    .stream-meta-actions-row::-webkit-scrollbar { display:none; }
    .stream-meta-actions-row button { flex:0 0 auto; min-height:36px; margin:0 !important; padding:6px 9px; border-radius:9px; background:rgba(255,255,255,.035); color:#c8d2e4; border-color:rgba(255,255,255,.1); font-size:.65rem; font-weight:800; }
    #stream .stream-suggestions { margin-top:0; padding-top:0 !important; }
    #stream .stream-suggestions::before { content:none !important; }
    #stream .stream-suggestions .ux-meta-source { display:none !important; }
    .stream-primary-actions[data-mode="event"] .combat-skill-panel { margin-top:0; border-color:rgba(255,224,107,.3); box-shadow:inset 3px 0 0 rgba(255,224,107,.62); background:linear-gradient(145deg,rgba(38,29,8,.82),rgba(8,14,28,.96)); }
    .stream-primary-actions[data-mode="event"] .run-event-choice { border-color:rgba(255,224,107,.48) !important; background:rgba(255,224,107,.1) !important; }
    .stream-primary-actions[data-mode="upgrade"] .stream-suggestions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); overflow:visible; gap:7px; }
    .stream-primary-actions[data-mode="upgrade"] .stream-suggestions button.run-power-card { width:auto; min-width:0; max-width:none; }

    /* Forecast is high-contrast dark-on-yellow-outline instead of a muddy yellow pill. */
    #stream .stream-suggestions button[data-preview-wired="true"]::after,
    #stream .combat-skill[data-preview-wired="true"]::after {
      color:#fff3a3 !important; background:#211d05 !important; border-color:#ffe45c !important;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),0 0 10px rgba(255,228,92,.12) !important;
    }
    #stream .stream-health-preview-copy {
      color:#fff3a3 !important; background:#151202 !important; border-color:#ffe45c !important;
      box-shadow:0 5px 14px rgba(0,0,0,.38),inset 0 0 0 1px rgba(255,255,255,.04) !important;
    }
    #stream .stream-health-preview { background:#ffe45c !important; box-shadow:0 0 14px rgba(255,228,92,.7),inset 0 0 0 1px rgba(255,255,255,.7) !important; }

    .ux-transition-state { display:grid; gap:6px; margin-top:2px; padding-top:7px; border-top:1px solid rgba(255,255,255,.08); }
    .ux-transition-state-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .ux-transition-state-head strong { color:#9feaff; font-size:.56rem; letter-spacing:.1em; }
    .ux-transition-state-head small { color:var(--muted); font-size:.56rem; }
    .ux-transition-you { display:flex; flex-wrap:wrap; gap:5px; align-items:center; }
    .ux-transition-you span { display:inline-flex; min-height:25px; align-items:center; padding:3px 7px; border-radius:8px; border:1px solid rgba(102,240,174,.25); background:rgba(102,240,174,.07); color:#effff7; font-size:.63rem; font-weight:900; font-variant-numeric:tabular-nums; }
    .ux-transition-you span.focus { border-color:rgba(121,167,255,.28); background:rgba(121,167,255,.08); color:#eaf0ff; }
    .ux-transition-state .stream-action-forecast { min-height:42px; padding-block:6px; }

    @media (max-width:720px) {
      .stream-decision-grid { grid-template-columns:1fr; }
      .stream-primary-actions[data-mode="upgrade"] .stream-suggestions { grid-template-columns:1fr; }
      .stream-decision-snapshot, .stream-primary-actions, .stream-meta-actions { padding:7px; border-radius:10px; }
      .stream-action-section-head small { display:none; }
      .stream-meta-actions-row button { min-height:36px; }
    }
    @media (prefers-reduced-motion:reduce) {
      .stream-decision-track > span { transition:none !important; }
    }
  `;
  document.head.append(style);

  let primarySection = null;
  let primaryHead = null;
  let primaryModeLabel = null;
  let primaryHint = null;
  let metaSection = null;
  let metaRow = null;
  let decisionSnapshot = null;
  let refreshTimer = null;
  let refreshing = false;

  const META_COMMANDS = new Set(['/status', '/gear', '/party', '/codex', '/dungeons', '/adventures', '/world', '/achievements', '/honey', '/wallet']);

  function ensureLayout() {
    if (!suggestions) return;
    if (!primarySection) {
      primarySection = document.createElement('section');
      primarySection.className = 'stream-primary-actions';
      primarySection.dataset.testid = 'stream-primary-actions';
      primaryHead = document.createElement('div');
      primaryHead.className = 'stream-action-section-head';
      primaryModeLabel = document.createElement('strong');
      primaryModeLabel.dataset.testid = 'stream-action-mode';
      primaryModeLabel.textContent = 'NEXT ACTION';
      primaryHint = document.createElement('small');
      primaryHint.textContent = 'Run actions only';
      primaryHead.append(primaryModeLabel, primaryHint);
      suggestions.parentNode.insertBefore(primarySection, suggestions);
      primarySection.append(primaryHead, suggestions);
    }

    const skillPanel = stream.querySelector('[data-testid="combat-skill-panel"]');
    if (skillPanel && skillPanel.parentElement !== primarySection) primarySection.append(skillPanel);

    if (!decisionSnapshot) {
      decisionSnapshot = document.createElement('section');
      decisionSnapshot.className = 'stream-decision-snapshot';
      decisionSnapshot.dataset.testid = 'stream-decision-snapshot';
      decisionSnapshot.setAttribute('aria-live', 'polite');
      decisionSnapshot.hidden = true;
      primarySection.parentNode.insertBefore(decisionSnapshot, primarySection);
    }

    if (!metaSection) {
      metaSection = document.createElement('nav');
      metaSection.className = 'stream-meta-actions';
      metaSection.dataset.testid = 'stream-meta-actions';
      metaSection.setAttribute('aria-label', 'Adventure navigation');
      const head = document.createElement('div');
      head.className = 'stream-action-section-head';
      const title = document.createElement('strong');
      title.textContent = 'NAVIGATION';
      const hint = document.createElement('small');
      hint.textContent = 'Does not replace your combat decision';
      head.append(title, hint);
      metaRow = document.createElement('div');
      metaRow.className = 'stream-meta-actions-row';
      metaSection.append(head, metaRow);
      primarySection.after(metaSection);
    }

    if (commandCard && commandCard.nextElementSibling !== decisionSnapshot && decisionSnapshot.parentElement === commandCard.parentElement) {
      commandCard.after(decisionSnapshot);
      decisionSnapshot.after(primarySection);
      primarySection.after(metaSection);
    } else if (composer && metaSection.nextElementSibling !== composer && metaSection.parentElement === composer.parentElement) {
      composer.before(metaSection);
    }
  }

  function commandFor(button) {
    return button.dataset.metaCommand || button.dataset.command || '';
  }

  function metaKey(button) {
    return commandFor(button) || button.textContent || crypto.randomUUID();
  }

  function syncMetaActions() {
    ensureLayout();
    if (!metaRow || !suggestions) return;
    const sources = [...suggestions.querySelectorAll('button')].filter((button) => META_COMMANDS.has(commandFor(button)));
    metaRow.innerHTML = '';
    for (const source of sources) {
      source.classList.add('ux-meta-source');
      source.hidden = true;
      source.tabIndex = -1;
      source.setAttribute('aria-hidden', 'true');
      const originalTestId = source.dataset.uxOriginalTestid || source.dataset.testid || '';
      if (source.dataset.testid) {
        source.dataset.uxOriginalTestid = source.dataset.testid;
        delete source.dataset.testid;
      }
      const mirror = document.createElement('button');
      mirror.type = 'button';
      mirror.textContent = source.textContent;
      mirror.dataset.uxMetaKey = metaKey(source);
      if (originalTestId) mirror.dataset.testid = originalTestId;
      mirror.disabled = source.disabled;
      mirror.addEventListener('click', () => source.click());
      metaRow.append(mirror);
    }
  }

  function modeCopy(run) {
    if (!run) return { mode:'idle', label:'START ADVENTURE', hint:'Choose a dungeon' };
    if (run.phase === 'combat') return { mode:'combat', label:'COMBAT ACTIONS', hint:'Resolve your next turn' };
    if (run.phase === 'boss') return { mode:'boss', label:'BOSS ACTIONS', hint:'Resolve your next turn' };
    if (run.phase === 'upgrade') return { mode:'upgrade', label:'RUN UPGRADE', hint:'Choose one power · combat actions are paused' };
    if (run.phase === 'event') return { mode:'event', label:'RUN DISCOVERY', hint:'Choose the shared path · combat actions are paused' };
    if (run.phase === 'complete') return { mode:'reward', label:'RUN REWARDS', hint:'Resolve progression before the next adventure' };
    return { mode:String(run.phase || 'run'), label:String(run.phase || 'RUN').toUpperCase(), hint:'Current run decision' };
  }

  function applyMode(run) {
    ensureLayout();
    const copy = modeCopy(run);
    primarySection.dataset.mode = copy.mode;
    primaryModeLabel.textContent = copy.label;
    primaryHint.textContent = copy.hint;
    const visiblePrimary = suggestions ? [...suggestions.querySelectorAll('button')].some((button) => !button.hidden && !button.classList.contains('ux-meta-source')) : false;
    const eventPanel = primarySection.querySelector('[data-testid="combat-skill-panel"]:not([hidden])');
    primarySection.hidden = !visiblePrimary && !eventPanel && !run;
  }

  function percent(value, max) {
    if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(max)) || Number(max) <= 0) return 0;
    return Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100));
  }

  function decisionUnit({ label, name, hp, maxHp, focus = null, maxFocus = null, enemy = false, sprite, testId }) {
    const unit = document.createElement('article');
    const ratio = percent(hp, maxHp);
    unit.className = `stream-decision-unit${enemy ? ' enemy' : ' you'}${ratio <= 30 ? ' is-low' : ''}`;
    const image = document.createElement('img');
    image.src = sprite;
    image.alt = '';
    const copy = document.createElement('div');
    copy.className = 'stream-decision-copy';
    const kind = document.createElement('span');
    kind.className = 'stream-decision-label';
    kind.textContent = label;
    const top = document.createElement('div');
    top.className = 'stream-decision-top';
    const title = document.createElement('strong');
    title.textContent = name;
    const value = document.createElement('span');
    value.className = 'stream-decision-value';
    value.textContent = `${hp} / ${maxHp} HP`;
    if (testId) value.dataset.testid = testId;
    top.append(title, value);
    copy.append(kind, top);
    if (focus !== null && focus !== undefined && maxFocus !== null && maxFocus !== undefined) {
      const sub = document.createElement('span');
      sub.className = 'stream-decision-sub';
      sub.dataset.testid = 'stream-decision-focus';
      sub.textContent = `Focus ${focus} / ${maxFocus}`;
      copy.append(sub);
    }
    const track = document.createElement('div');
    track.className = 'stream-decision-track';
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(maxHp));
    track.setAttribute('aria-valuenow', String(hp));
    const fill = document.createElement('span');
    fill.style.width = `${ratio}%`;
    track.append(fill);
    copy.append(track);
    unit.append(image, copy);
    return unit;
  }

  function forecast(preview, { compact = false } = {}) {
    if (!preview?.available || Number(preview.damage || 0) <= 0) return null;
    const box = document.createElement('div');
    box.className = 'stream-action-forecast';
    box.dataset.testid = compact ? 'stream-transition-preview' : 'stream-action-forecast';
    const value = document.createElement('strong');
    value.dataset.testid = compact ? 'stream-transition-preview-value' : 'stream-action-forecast-value';
    value.textContent = `−${preview.damage}`;
    const copy = document.createElement('div');
    copy.className = 'stream-action-forecast-copy';
    const kicker = document.createElement('span');
    kicker.textContent = 'PROJECTED · ATTACK';
    const line = document.createElement('b');
    line.textContent = `Enemy HP ${preview.enemyHpBefore} → ${preview.enemyHpAfter}`;
    const consequence = document.createElement('small');
    consequence.textContent = Number(preview.enemyHpAfter || 0) <= 0 && Number(preview.retaliation || 0) === 0
      ? 'Lethal preview · normal counterattack is cancelled.'
      : Number(preview.retaliation || 0) > 0
        ? `If used now, you may take ${preview.retaliation} damage.`
        : 'Authoritative preview for the current run state.';
    copy.append(kicker, line, consequence);
    box.append(value, copy);
    return box;
  }

  function renderDecisionSnapshot(data) {
    ensureLayout();
    const run = data?.activeRun;
    if (!run || !run.viewer || !['combat','boss','upgrade','event'].includes(run.phase)) {
      decisionSnapshot.hidden = true;
      decisionSnapshot.innerHTML = '';
      return;
    }
    decisionSnapshot.hidden = false;
    decisionSnapshot.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'stream-decision-head';
    const heading = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'DECISION SNAPSHOT';
    const title = document.createElement('strong');
    title.textContent = run.phase === 'boss' ? 'Boss encounter' : run.phase === 'combat' ? 'Current encounter' : run.phase === 'upgrade' ? 'Before you choose a power' : 'Before you choose a path';
    heading.append(kicker, title);
    const phase = document.createElement('small');
    phase.textContent = modeCopy(run).label;
    head.append(heading, phase);
    decisionSnapshot.append(head);

    const grid = document.createElement('div');
    grid.className = 'stream-decision-grid';
    grid.append(decisionUnit({
      label:'YOU',
      name:data.character?.displayName || run.viewer.displayName || 'Weaver',
      hp:run.viewer.hp,
      maxHp:run.viewer.maxHp,
      focus:run.streamlinedSkills ? null : run.viewer.focus,
      maxFocus:run.streamlinedSkills ? null : run.viewer.maxFocus,
      sprite:weaverSprite(data.character?.id || run.viewer.playerId),
      testId:'stream-decision-you-hp',
    }));
    if (run.enemy) {
      grid.append(decisionUnit({
        label:run.enemy.isBoss ? 'BOSS' : 'ENEMY',
        name:run.enemy.name,
        hp:run.enemy.hp,
        maxHp:run.enemy.maxHp,
        enemy:true,
        sprite:enemySprite(run.enemy),
        testId:'stream-decision-enemy-hp',
      }));
    }
    decisionSnapshot.append(grid);

    const allies = (run.participants || []).filter((participant) => participant.playerId !== run.viewer.playerId);
    if (allies.length) {
      const party = document.createElement('div');
      party.className = 'stream-party-vitals';
      party.dataset.testid = 'stream-decision-party';
      for (const ally of allies) {
        const chip = document.createElement('span');
        chip.className = `stream-party-vital${percent(ally.hp, ally.maxHp) <= 30 ? ' is-low' : ''}`;
        const focusCopy = !run.streamlinedSkills && ally.focus !== undefined ? ` · F ${ally.focus}/${ally.maxFocus}` : '';
        chip.textContent = `${ally.displayName || 'Ally'} · ${ally.hp}/${ally.maxHp} HP${focusCopy}`;
        party.append(chip);
      }
      decisionSnapshot.append(party);
    }

    if (run.enemyIntent) {
      const intent = document.createElement('div');
      intent.className = 'stream-intent-receipt';
      intent.dataset.testid = 'stream-decision-intent';
      intent.textContent = `⚠ ${run.enemyIntent.name} incoming · ${run.enemyIntent.damage} damage`;
      decisionSnapshot.append(intent);
    }

    if (['combat','boss'].includes(run.phase)) {
      const projected = forecast(data.actionPreviews?.actions?.attack);
      if (projected) decisionSnapshot.append(projected);
    }
  }

  function enhanceLatestTransition(data, entries) {
    const rows = [...stream.querySelectorAll('.stream-entry-transition[data-entry-id]')];
    for (const row of rows) row.querySelector('.ux-transition-state')?.remove();
    const row = rows.at(-1);
    const run = data?.activeRun;
    if (!row || !run || !run.viewer || !['combat','boss'].includes(run.phase)) return;
    const entry = entries.find((candidate) => String(candidate.id) === String(row.dataset.entryId));
    if (!entry || String(entry.runId || '') !== String(run.id || '')) return;
    const card = row.querySelector('[data-testid="stream-encounter-transition"]');
    if (!card) return;
    const state = document.createElement('div');
    state.className = 'ux-transition-state';
    state.dataset.testid = 'stream-transition-player-state';
    const head = document.createElement('div');
    head.className = 'ux-transition-state-head';
    const title = document.createElement('strong');
    title.textContent = 'YOUR STATE BEFORE THE NEXT MOVE';
    const hint = document.createElement('small');
    hint.textContent = 'Live authoritative state';
    head.append(title, hint);
    const vitals = document.createElement('div');
    vitals.className = 'ux-transition-you';
    const hp = document.createElement('span');
    hp.dataset.testid = 'stream-transition-you-hp';
    hp.textContent = `YOU · ${run.viewer.hp}/${run.viewer.maxHp} HP`;
    vitals.append(hp);
    if (!run.streamlinedSkills) {
      const focus = document.createElement('span');
      focus.className = 'focus';
      focus.dataset.testid = 'stream-transition-you-focus';
      focus.textContent = `Focus ${run.viewer.focus}/${run.viewer.maxFocus}`;
      vitals.append(focus);
    }
    state.append(head, vitals);
    const projected = forecast(data.actionPreviews?.actions?.attack, { compact:true });
    if (projected) state.append(projected);
    card.append(state);
  }

  async function readPresentation() {
    const [dashboardResponse, streamResponse] = await Promise.all([
      fetch('/api/dashboard?previews=1', { headers:{ Accept:'application/json' } }),
      fetch('/api/stream?limit=30', { headers:{ Accept:'application/json' } }),
    ]);
    if (!dashboardResponse.ok) throw new Error('Could not read current adventure presentation.');
    const dashboard = await dashboardResponse.json();
    const streamPayload = streamResponse.ok ? await streamResponse.json() : { entries:[] };
    return { dashboard, entries:streamPayload.entries || [] };
  }

  async function refreshPresentation() {
    if (refreshing) return;
    refreshing = true;
    try {
      ensureLayout();
      syncMetaActions();
      const { dashboard, entries } = await readPresentation();
      syncMetaActions();
      applyMode(dashboard.activeRun);
      renderDecisionSnapshot(dashboard);
      enhanceLatestTransition(dashboard, entries);
    } catch {
      // This module is a Presentation Model enhancement. Core Adventure Stream error and
      // connection handling remain the source of truth if its read model is unavailable.
    } finally {
      refreshing = false;
    }
  }

  function schedule(delay = 70) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshPresentation(), delay);
  }

  ensureLayout();
  syncMetaActions();
  const suggestionObserver = suggestions ? new MutationObserver(() => schedule(30)) : null;
  if (suggestions) suggestionObserver.observe(suggestions, { childList:true, subtree:false });
  const logObserver = log ? new MutationObserver(() => schedule(65)) : null;
  if (log) logObserver.observe(log, { childList:true, subtree:true });
  const streamObserver = new MutationObserver(() => {
    ensureLayout();
    schedule(50);
  });
  streamObserver.observe(stream, { childList:true, subtree:false });
  schedule(0);

  window.addEventListener('beforeunload', () => {
    clearTimeout(refreshTimer);
    suggestionObserver?.disconnect();
    logObserver?.disconnect();
    streamObserver.disconnect();
  }, { once:true });
}
