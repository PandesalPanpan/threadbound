import { enemySprite, weaverSprite } from './sprite-catalog.js';

const stream = document.querySelector('#stream');

if (stream) {
  const form = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const send = stream.querySelector('[data-testid="stream-send"]');
  const card = stream.querySelector('[data-testid="stream-command-card"]');
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
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

    /* Rich stream receipts: presentation only. Durable event metadata remains authoritative. */
    .stream-entry-rich { grid-template-columns:38px minmax(0,1fr); padding:9px; border-color:rgba(85,214,255,.2); background:linear-gradient(145deg,rgba(13,24,43,.97),rgba(8,14,28,.98)); box-shadow:inset 3px 0 0 rgba(85,214,255,.58),0 8px 24px rgba(0,0,0,.14); }
    .stream-entry-rich.stream-action-attack { border-color:rgba(255,100,124,.28); box-shadow:inset 3px 0 0 rgba(255,100,124,.78),0 8px 24px rgba(0,0,0,.14); }
    .stream-entry-rich.stream-action-guard { border-color:rgba(85,214,255,.28); }
    .stream-entry-rich.stream-action-interrupt { border-color:rgba(255,209,102,.3); box-shadow:inset 3px 0 0 rgba(255,209,102,.78),0 8px 24px rgba(0,0,0,.14); }
    .stream-entry-rich.stream-action-mend, .stream-entry-rich.stream-action-revive { border-color:rgba(100,230,169,.3); box-shadow:inset 3px 0 0 rgba(100,230,169,.75),0 8px 24px rgba(0,0,0,.14); }
    .stream-entry-rich .stream-avatar { width:36px; height:36px; border-radius:11px; font-size:1rem; background:rgba(255,255,255,.055); }
    .stream-entry-rich .stream-system-tag { display:none; }
    .stream-entry-rich .stream-entry-meta { margin-bottom:5px; }
    .stream-entry-rich .stream-entry-meta strong { color:var(--muted); }
    .stream-rich-receipt { display:grid; gap:8px; min-width:0; }
    .stream-rich-header { display:flex; align-items:start; justify-content:space-between; gap:10px; }
    .stream-rich-heading { min-width:0; }
    .stream-rich-kicker { display:block; color:var(--cyan); font-size:.59rem; font-weight:950; letter-spacing:.12em; }
    .stream-action-attack .stream-rich-kicker { color:#ff8e9d; }
    .stream-action-interrupt .stream-rich-kicker, .stream-action-power-strike .stream-rich-kicker { color:var(--gold); }
    .stream-action-power-strike { border-color:rgba(255,209,102,.32); box-shadow:inset 3px 0 0 rgba(255,209,102,.82),0 8px 24px rgba(0,0,0,.14); }
    .stream-action-state { flex:1 0 100%; padding:4px 7px; border-radius:8px; color:var(--cyan); background:rgba(85,214,255,.07); font-size:.63rem; font-weight:900; letter-spacing:.06em; }
    .stream-suggestions button.is-counter { box-shadow:0 0 0 2px rgba(255,209,102,.38),0 7px 18px rgba(0,0,0,.2); }
    .stream-suggestions button:disabled { opacity:.46; cursor:not-allowed; }
    .stream-action-mend .stream-rich-kicker, .stream-action-revive .stream-rich-kicker { color:var(--green); }
    .stream-rich-summary { display:block; margin-top:2px; color:var(--text); font-size:.91rem; line-height:1.33; }
    .stream-rich-summary strong { color:inherit; }
    .stream-rich-phase { flex:0 0 auto; padding:3px 7px; border:1px solid var(--line-soft); border-radius:999px; color:var(--muted); background:rgba(255,255,255,.035); font-size:.56rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .stream-result-chips { display:flex; flex-wrap:wrap; gap:5px; }
    .stream-result-chip { display:inline-flex; align-items:center; min-height:25px; padding:3px 7px; border-radius:8px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.045); color:var(--text); font-size:.68rem; font-weight:900; letter-spacing:.02em; }
    .stream-result-chip.damage { color:#ff9cac; border-color:rgba(255,100,124,.2); background:rgba(255,100,124,.08); }
    .stream-result-chip.heal { color:#8ff1bd; border-color:rgba(100,230,169,.2); background:rgba(100,230,169,.08); }
    .stream-result-chip.guard { color:#9eeaff; border-color:rgba(85,214,255,.2); background:rgba(85,214,255,.08); }
    .stream-result-chip.special { color:#ffe097; border-color:rgba(255,209,102,.2); background:rgba(255,209,102,.08); }
    .stream-health-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
    .stream-health-unit { display:grid; grid-template-columns:34px minmax(0,1fr); gap:7px; align-items:center; min-width:0; padding:7px; border:1px solid rgba(255,255,255,.07); border-radius:10px; background:rgba(2,7,15,.42); }
    .stream-health-unit.enemy { border-color:rgba(255,100,124,.14); }
    .stream-health-unit img { width:32px; height:32px; object-fit:contain; image-rendering:pixelated; }
    .stream-health-copy { min-width:0; }
    .stream-health-top { display:flex; align-items:baseline; justify-content:space-between; gap:6px; min-width:0; }
    .stream-health-top strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.72rem; }
    .stream-health-value { flex:0 0 auto; color:var(--text); font-size:.67rem; font-weight:900; font-variant-numeric:tabular-nums; }
    .stream-health-label { display:block; margin-bottom:1px; color:var(--muted); font-size:.52rem; font-weight:950; letter-spacing:.1em; }
    .stream-health-track { height:6px; margin-top:5px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.075); }
    .stream-health-track > span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#5ce3a2,#b8f36b); }
    .stream-health-unit.enemy .stream-health-track > span { background:linear-gradient(90deg,#ff647c,#ff9b63); }
    .stream-health-unit.is-low .stream-health-track > span { background:linear-gradient(90deg,#ff647c,#ffd166); }
    .stream-intent-receipt { display:flex; align-items:center; gap:7px; padding:7px 9px; border:1px solid rgba(255,209,102,.2); border-radius:9px; background:rgba(255,209,102,.07); color:#ffe097; font-size:.7rem; line-height:1.3; }
    .stream-intent-receipt strong { color:inherit; }
    .stream-outcome-banner { padding:7px 9px; border-radius:9px; border:1px solid rgba(100,230,169,.2); background:rgba(100,230,169,.075); color:#9ff2c4; font-size:.7rem; font-weight:900; }
    .stream-outcome-banner.upgrade { border-color:rgba(179,109,255,.24); background:rgba(179,109,255,.08); color:#d9b8ff; }
    .stream-entry-event-generic .stream-avatar { font-size:.9rem; }

    @media (max-width:520px) {
      .thread-dungeon-row { grid-template-columns:1fr; }
      .thread-dungeon-row button { width:100%; }
      .stream-entry-rich { grid-template-columns:32px minmax(0,1fr); gap:7px; padding:8px 7px; }
      .stream-entry-rich .stream-avatar { width:30px; height:30px; border-radius:9px; font-size:.86rem; }
      .stream-rich-header { gap:6px; }
      .stream-rich-summary { font-size:.82rem; }
      .stream-health-grid { grid-template-columns:1fr; }
      .stream-health-unit { grid-template-columns:30px minmax(0,1fr); padding:6px; }
      .stream-health-unit img { width:28px; height:28px; }
      .stream-result-chip { font-size:.63rem; }
    }
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

  function titleize(value) {
    return String(value || '')
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ') || 'Unknown';
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function knownEnemySprite(metadata = {}) {
    return enemySprite({
      id: String(metadata.enemyId || metadata.defeatedEnemyId || ''),
      isBoss: Boolean(metadata.defeatedBoss || metadata.enemy?.isBoss),
    });
  }

  function resultChip(text, tone = '') {
    const chip = document.createElement('span');
    chip.className = `stream-result-chip${tone ? ` ${tone}` : ''}`;
    chip.textContent = text;
    return chip;
  }

  function healthUnit({ label, name, hp, maxHp, enemy = false, testId = null, sprite = '/sprites/kenney/weaver-arcane.png' }) {
    const value = numberValue(hp);
    const max = numberValue(maxHp);
    if (value === null || max === null || max <= 0) return null;
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    const unit = document.createElement('div');
    unit.className = `stream-health-unit${enemy ? ' enemy' : ''}${percent <= 30 ? ' is-low' : ''}`;
    const image = document.createElement('img');
    image.src = sprite;
    image.alt = '';
    const copy = document.createElement('div');
    copy.className = 'stream-health-copy';
    const labelEl = document.createElement('span');
    labelEl.className = 'stream-health-label';
    labelEl.textContent = label;
    const top = document.createElement('div');
    top.className = 'stream-health-top';
    const nameEl = document.createElement('strong');
    nameEl.textContent = name;
    const valueEl = document.createElement('span');
    valueEl.className = 'stream-health-value';
    valueEl.textContent = `${value} / ${max} HP`;
    if (testId) valueEl.dataset.testid = testId;
    top.append(nameEl, valueEl);
    const track = document.createElement('div');
    track.className = 'stream-health-track';
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-label', `${name} health`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(max));
    track.setAttribute('aria-valuenow', String(value));
    const fill = document.createElement('span');
    fill.style.width = `${percent}%`;
    track.append(fill);
    copy.append(labelEl, top, track);
    unit.append(image, copy);
    return unit;
  }

  function actionPresentation(entry) {
    const metadata = entry.metadata || {};
    const action = String(metadata.action || 'action').toLowerCase();
    const actor = entry.actorName || 'Unknown Weaver';
    const enemy = metadata.enemyName || titleize(metadata.enemyId || metadata.defeatedEnemyId || 'enemy');
    const damage = numberValue(metadata.damage) || 0;
    const prevented = numberValue(metadata.prevented) || 0;
    const healed = numberValue(metadata.healed) || 0;
    const restored = numberValue(metadata.restoredHp) || 0;
    const defeated = Boolean(metadata.defeatedEnemyId);
    const labels = {
      attack: ['⚔', 'ATTACK'],
      'power-strike': ['✹', 'POWER STRIKE'],
      guard: ['🛡', 'GUARD'],
      interrupt: ['⚡', 'INTERRUPT'],
      mend: ['✚', 'MEND'],
      revive: ['✦', 'REVIVE'],
    };
    const [icon, kicker] = labels[action] || ['✦', titleize(action).toUpperCase()];
    let summary;
    if (action === 'attack') summary = defeated ? `${actor} attacked ${titleize(metadata.defeatedEnemyId)} for ${damage} and defeated it.` : `${actor} attacked ${enemy} for ${damage} damage.`;
    else if (action === 'power-strike') summary = defeated ? `${actor} Power Struck ${titleize(metadata.defeatedEnemyId)} for ${damage} and defeated it.` : `${actor} Power Struck ${enemy} for ${damage} damage.`;
    else if (action === 'guard') summary = `${actor} guarded${prevented > 0 ? ` and blocked ${prevented} damage` : ''}.`;
    else if (action === 'interrupt') summary = `${actor} interrupted ${enemy}'s heavy attack.`;
    else if (action === 'mend') summary = `${actor} mended ${metadata.targetPlayerId === metadata.playerId ? 'themself' : 'an ally'} for ${healed} HP.`;
    else if (action === 'revive') summary = `${actor} revived an ally with ${restored} HP.`;
    else summary = `${actor} used ${titleize(action)}.`;
    return { action, actor, enemy, icon, kicker, summary, damage, prevented, healed, restored, defeated };
  }

  function buildHealthGrid(entry) {
    const metadata = entry.metadata || {};
    const grid = document.createElement('div');
    grid.className = 'stream-health-grid';
    const actor = healthUnit({
      label: 'WEAVER',
      name: entry.actorName || 'Weaver',
      hp: metadata.actorHp,
      maxHp: metadata.actorMaxHp,
      testId: 'stream-actor-hp',
      sprite: weaverSprite(metadata.playerId || entry.actorId || entry.actorName),
    });
    if (actor) grid.append(actor);
    if (metadata.phase !== 'upgrade' && metadata.phase !== 'complete') {
      const enemy = healthUnit({
        label: metadata.defeatedBoss ? 'BOSS' : 'ENEMY',
        name: metadata.enemyName || titleize(metadata.enemyId || 'enemy'),
        hp: metadata.enemyHp,
        maxHp: metadata.enemyMaxHp,
        enemy: true,
        testId: 'stream-enemy-hp',
        sprite: knownEnemySprite(metadata),
      });
      if (enemy) grid.append(enemy);
    }
    return grid.children.length ? grid : null;
  }

  function richHeader(kicker, summary, phase = '') {
    const header = document.createElement('div');
    header.className = 'stream-rich-header';
    const heading = document.createElement('div');
    heading.className = 'stream-rich-heading';
    const kickerEl = document.createElement('span');
    kickerEl.className = 'stream-rich-kicker';
    kickerEl.textContent = kicker;
    const summaryEl = document.createElement('span');
    summaryEl.className = 'stream-rich-summary';
    summaryEl.textContent = summary;
    heading.append(kickerEl, summaryEl);
    header.append(heading);
    if (phase) {
      const phaseEl = document.createElement('span');
      phaseEl.className = 'stream-rich-phase';
      phaseEl.textContent = phase;
      header.append(phaseEl);
    }
    return header;
  }

  function buildCombatReceipt(entry) {
    const metadata = entry.metadata || {};
    const presentation = actionPresentation(entry);
    const receipt = document.createElement('section');
    receipt.className = 'stream-rich-receipt';
    receipt.dataset.testid = 'stream-combat-result-card';
    receipt.append(richHeader(presentation.kicker, presentation.summary, metadata.phase || 'combat'));

    const chips = document.createElement('div');
    chips.className = 'stream-result-chips';
    if (['attack', 'power-strike'].includes(presentation.action) && presentation.damage > 0) chips.append(resultChip(`${presentation.action === 'power-strike' ? '✹' : '⚔'} −${presentation.damage} ENEMY HP`, 'damage'));
    const retaliation = numberValue(metadata.retaliation) || 0;
    if (retaliation > 0) chips.append(resultChip(`💥 −${retaliation} HP`, 'damage'));
    if (presentation.prevented > 0) chips.append(resultChip(`🛡 ${presentation.prevented} BLOCKED`, 'guard'));
    if (presentation.healed > 0) chips.append(resultChip(`✚ +${presentation.healed} HP`, 'heal'));
    if (presentation.restored > 0) chips.append(resultChip(`✦ +${presentation.restored} HP`, 'heal'));
    if (metadata.focusGained > 0) chips.append(resultChip(`✦ +${metadata.focusGained} FOCUS`, 'guard'));
    if (metadata.focusSpent > 0) chips.append(resultChip(`✹ −${metadata.focusSpent} FOCUS`, 'special'));
    if (metadata.interruptedIntentId || presentation.action === 'interrupt') chips.append(resultChip('⚡ INTERRUPTED', 'special'));
    if (metadata.counteredIntentId) chips.append(resultChip(`✓ COUNTERED${metadata.counterAction ? ` · ${String(metadata.counterAction).toUpperCase()}` : ''}`, 'special'));
    if (metadata.staggered || metadata.enemyStaggeredHits > 0) chips.append(resultChip('✦ STAGGERED · NEXT HIT BOOSTED', 'special'));
    if (metadata.ripostePrimed > 0) chips.append(resultChip(`↩ RIPOSTE +${metadata.ripostePrimed}`, 'guard'));
    if (metadata.enemyFortifiedHits > 0) chips.append(resultChip(`🛡 ENEMY FORTIFIED ×${metadata.enemyFortifiedHits}`, 'guard'));
    if (presentation.defeated) chips.append(resultChip('☠ DEFEATED', 'special'));
    if (chips.children.length) receipt.append(chips);

    const health = buildHealthGrid(entry);
    if (health) receipt.append(health);

    if (metadata.enemyIntent) {
      const intent = document.createElement('div');
      intent.className = 'stream-intent-receipt';
      intent.dataset.testid = 'stream-enemy-intent';
      const intentDamage = numberValue(metadata.enemyIntent.damage);
      intent.textContent = `⚠ ${metadata.enemyIntent.name || 'Heavy action'} · ${metadata.enemyIntent.kind === 'fortify' ? 'ARMOR' : `${intentDamage ?? '?'} DMG`} · COUNTER: ${(metadata.enemyIntent.counterLabel || titleize(metadata.enemyIntent.counter)).toUpperCase()}`;
      receipt.append(intent);
    }

    if (metadata.phase === 'complete') {
      const banner = document.createElement('div');
      banner.className = 'stream-outcome-banner';
      banner.textContent = '✦ DUNGEON CLEARED · Rewards secured';
      receipt.append(banner);
    } else if (metadata.phase === 'upgrade') {
      const banner = document.createElement('div');
      banner.className = 'stream-outcome-banner upgrade';
      banner.textContent = '✦ RUN UPGRADE READY · Choose your next power';
      receipt.append(banner);
    }
    return { receipt, presentation };
  }

  function buildDungeonStartReceipt(entry) {
    const metadata = entry.metadata || {};
    const actor = entry.actorName || 'A Weaver';
    const dungeon = titleize(metadata.dungeonId || entry.dungeonId || 'dungeon');
    const receipt = document.createElement('section');
    receipt.className = 'stream-rich-receipt';
    receipt.dataset.testid = 'stream-dungeon-start-card';
    receipt.append(richHeader('⚑ DUNGEON ENTERED', `${actor} entered ${dungeon}.`, 'Encounter 1'));
    const health = buildHealthGrid(entry);
    if (health) receipt.append(health);
    const banner = document.createElement('div');
    banner.className = 'stream-outcome-banner upgrade';
    banner.textContent = 'YOUR TURN · Choose your first action below';
    receipt.append(banner);
    return receipt;
  }

  function genericEventIcon(eventType) {
    if (eventType === 'ItemGenerated') return '🎁';
    if (eventType === 'ItemEquipped') return '◈';
    if (eventType === 'ItemSalvaged') return '♻';
    if (eventType === 'DungeonCompleted') return '🏆';
    if (eventType === 'DungeonFailed') return '☠';
    if (eventType === 'RunUpgradeChosen') return '✦';
    if (String(eventType || '').startsWith('Party')) return '♟';
    return '✦';
  }

  function decorateSystemEntry(row, entry) {
    if (!row || !entry || row.dataset.richFormatted === 'true') return;
    const content = row.querySelector('.stream-entry-content');
    const avatar = row.querySelector('.stream-avatar');
    const body = content?.querySelector(':scope > p');
    if (!content || !body) return;
    row.dataset.eventType = entry.eventType || '';

    if (entry.eventType === 'CombatActionResolved') {
      const { receipt, presentation } = buildCombatReceipt(entry);
      row.classList.add('stream-entry-rich', `stream-action-${presentation.action}`);
      if (avatar) avatar.textContent = presentation.icon;
      body.classList.add('sr-only');
      body.dataset.testid = 'stream-raw-result';
      content.querySelector('.stream-system-tag')?.remove();
      content.append(receipt);
      row.dataset.richFormatted = 'true';
      return;
    }

    if (entry.eventType === 'DungeonStarted') {
      row.classList.add('stream-entry-rich', 'stream-action-start');
      if (avatar) avatar.textContent = '⚑';
      body.classList.add('sr-only');
      body.dataset.testid = 'stream-raw-result';
      content.querySelector('.stream-system-tag')?.remove();
      content.append(buildDungeonStartReceipt(entry));
      row.dataset.richFormatted = 'true';
      return;
    }

    row.classList.add('stream-entry-event-generic');
    if (avatar) avatar.textContent = genericEventIcon(entry.eventType);
    row.dataset.richFormatted = 'true';
  }

  let richRefreshTimer = null;
  let richRefreshInFlight = false;

  async function refreshRichEntries() {
    if (!log || richRefreshInFlight) return;
    const pending = [...log.querySelectorAll('.stream-entry-system[data-entry-id]:not([data-rich-formatted="true"])')];
    if (!pending.length) return;
    const keepBottomAnchored = log.scrollHeight - log.scrollTop - log.clientHeight < 180;
    richRefreshInFlight = true;
    try {
      const payload = await api('/api/stream?limit=100');
      const entries = new Map((payload.entries || []).map((entry) => [entry.id, entry]));
      for (const row of pending) decorateSystemEntry(row, entries.get(row.dataset.entryId));
      if (keepBottomAnchored) {
        const pageX = window.scrollX;
        const pageY = window.scrollY;
        pending.at(-1)?.scrollIntoView({ block: 'end', inline: 'nearest' });
        window.scrollTo(pageX, pageY);
      }
    } finally {
      richRefreshInFlight = false;
      if (log.querySelector('.stream-entry-system[data-entry-id]:not([data-rich-formatted="true"])')) scheduleRichRefresh();
    }
  }

  function scheduleRichRefresh() {
    clearTimeout(richRefreshTimer);
    richRefreshTimer = setTimeout(() => refreshRichEntries().catch(() => {}), 45);
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
  const suggestionObserver = new MutationObserver(() => normalizeSuggestions());
  if (suggestions) suggestionObserver.observe(suggestions, { childList: true });

  const streamObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeType === 1 && (node.matches?.('.stream-entry-system') || node.querySelector?.('.stream-entry-system'))))) scheduleRichRefresh();
  });
  if (log) streamObserver.observe(log, { childList: true });
  scheduleRichRefresh();

  window.addEventListener('beforeunload', () => {
    clearTimeout(richRefreshTimer);
    suggestionObserver.disconnect();
    streamObserver.disconnect();
  }, { once: true });
}
