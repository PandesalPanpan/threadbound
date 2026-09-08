const stream = document.querySelector('[data-testid="adventure-stream"]');
const suggestions = document.querySelector('[data-testid="stream-suggestions"]');
const streamLog = document.querySelector('[data-testid="adventure-stream-log"]');

if (stream && suggestions) {
  const panel = document.createElement('section');
  panel.className = 'combat-skill-panel';
  panel.dataset.testid = 'combat-skill-panel';
  panel.hidden = true;
  suggestions.after(panel);

  const style = document.createElement('style');
  style.textContent = `
    .combat-skill-panel { display:grid; gap:9px; margin:8px 0 2px; padding:10px; border:1px solid rgba(179,109,255,.24); border-radius:12px; background:linear-gradient(145deg,rgba(21,13,40,.94),rgba(8,14,28,.96)); box-shadow:inset 3px 0 0 rgba(179,109,255,.62); }
    .combat-skill-panel[hidden] { display:none !important; }
    .combat-skill-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .combat-skill-head > div { min-width:0; }
    .combat-skill-kicker { display:block; color:#d9b8ff; font-size:.59rem; font-weight:950; letter-spacing:.12em; }
    .combat-focus-copy { display:flex; align-items:baseline; gap:5px; margin-top:2px; }
    .combat-focus-copy strong { font-size:.9rem; }
    .combat-focus-copy span { color:var(--muted); font-size:.67rem; }
    .combat-focus-pips { display:flex; gap:4px; flex:0 0 auto; }
    .combat-focus-pip { width:12px; height:12px; border-radius:4px; border:1px solid rgba(217,184,255,.3); background:rgba(255,255,255,.05); }
    .combat-focus-pip.is-filled { background:#d9b8ff; box-shadow:0 0 12px rgba(179,109,255,.42); }
    .combat-status-line { display:flex; flex-wrap:wrap; gap:5px; min-height:25px; }
    .combat-status-badge { display:inline-flex; align-items:center; min-height:25px; padding:3px 7px; border:1px solid rgba(255,209,102,.25); border-radius:8px; background:rgba(255,209,102,.08); color:#ffe097; font-size:.65rem; font-weight:900; }
    .combat-status-badge.intent { border-color:rgba(255,100,124,.25); background:rgba(255,100,124,.08); color:#ff9cac; }
    .combat-skill-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
    .combat-skill { display:grid; gap:3px; align-content:start; min-height:68px; padding:8px !important; margin:0 !important; text-align:left; border:1px solid rgba(217,184,255,.2) !important; background:rgba(255,255,255,.045) !important; }
    .combat-skill strong { display:block; font-size:.73rem; color:var(--text); }
    .combat-skill small { display:block; color:var(--muted); font-size:.59rem; line-height:1.25; }
    .combat-skill.is-combo { border-color:rgba(255,209,102,.48) !important; background:rgba(255,209,102,.1) !important; box-shadow:inset 0 0 0 1px rgba(255,209,102,.08); }
    .combat-skill.is-interrupt { border-color:rgba(255,100,124,.42) !important; }
    .combat-skill:disabled { opacity:.55; cursor:not-allowed; }
    .combat-skill-error { margin:0; padding:6px 8px; border-radius:8px; background:rgba(255,100,124,.08); color:#ff9cac; font-size:.68rem; }
    .stream-entry-rich.stream-action-skill { border-color:rgba(179,109,255,.34); box-shadow:inset 3px 0 0 rgba(179,109,255,.78),0 8px 24px rgba(0,0,0,.14); }
    .stream-action-skill .stream-rich-kicker { color:#d9b8ff; }
    @media (max-width:520px) {
      .combat-skill-panel { padding:8px 7px; }
      .combat-skill-grid { grid-template-columns:1fr; }
      .combat-skill { min-height:52px; }
    }
  `;
  document.head.append(style);

  let renderGeneration = 0;
  let refreshTimer = null;
  let receiptTimer = null;
  let acting = false;

  async function dashboard() {
    const response = await fetch('/api/dashboard', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Could not refresh combat skills.');
    return response.json();
  }

  function skillAvailability(skill, run) {
    const viewer = run.viewer;
    const cooldown = Number(viewer?.skillCooldowns?.[skill.id] || 0);
    const focus = Number(viewer?.focus || 0);
    const livingWounded = run.participants.some((participant) => participant.hp > 0 && participant.hp < participant.maxHp);
    if (cooldown > 0) return { disabled: true, reason: `Cooldown ${cooldown}`, cooldown };
    if (focus < skill.cost) return { disabled: true, reason: `Need ${skill.cost} Focus`, cooldown };
    if (skill.kind === 'party-heal' && !livingWounded) return { disabled: true, reason: 'Party healthy', cooldown };
    return { disabled: false, reason: `${skill.cost} Focus`, cooldown };
  }

  function renderFocus(run) {
    const viewer = run.viewer;
    const head = document.createElement('div');
    head.className = 'combat-skill-head';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'combat-skill-kicker';
    kicker.textContent = 'COMBAT SKILLS';
    const focusCopy = document.createElement('div');
    focusCopy.className = 'combat-focus-copy';
    const strong = document.createElement('strong');
    strong.dataset.testid = 'skill-focus';
    strong.textContent = `Focus ${viewer.focus}/${viewer.maxFocus}`;
    const hint = document.createElement('span');
    hint.textContent = 'Attack or react well to build it';
    focusCopy.append(strong, hint);
    copy.append(kicker, focusCopy);

    const pips = document.createElement('div');
    pips.className = 'combat-focus-pips';
    pips.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < viewer.maxFocus; index += 1) {
      const pip = document.createElement('span');
      pip.className = `combat-focus-pip${index < viewer.focus ? ' is-filled' : ''}`;
      pips.append(pip);
    }
    head.append(copy, pips);
    return head;
  }

  function renderStatuses(run) {
    const line = document.createElement('div');
    line.className = 'combat-status-line';
    if (Number(run.enemy?.statuses?.exposed || 0) > 0) {
      const exposed = document.createElement('span');
      exposed.className = 'combat-status-badge';
      exposed.dataset.testid = 'enemy-status-exposed';
      exposed.textContent = '✦ EXPOSED · Severing Knot combo ready';
      line.append(exposed);
    }
    if (run.enemyIntent) {
      const intent = document.createElement('span');
      intent.className = 'combat-status-badge intent';
      intent.dataset.testid = 'skill-intent-warning';
      intent.textContent = `⚠ ${run.enemyIntent.name} · Severing Knot can interrupt`;
      line.append(intent);
    }
    return line;
  }

  async function useSkill(runId, skillId, button) {
    if (acting) return;
    acting = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/skills/${encodeURIComponent(skillId)}`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || `Skill failed (${response.status})`);
      await refreshSkills();
    } catch (error) {
      const message = document.createElement('p');
      message.className = 'combat-skill-error';
      message.dataset.testid = 'combat-skill-error';
      message.textContent = error.message;
      panel.querySelector('.combat-skill-error')?.remove();
      panel.append(message);
      scheduleRefresh(300);
    } finally {
      acting = false;
      button.removeAttribute('aria-busy');
    }
  }

  function renderSkillButton(skill, run) {
    const availability = skillAvailability(skill, run);
    const exposed = Number(run.enemy?.statuses?.exposed || 0) > 0;
    const combo = skill.id === 'severing-knot' && exposed;
    const interrupt = Boolean(skill.interrupts && run.enemyIntent);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `combat-skill${combo ? ' is-combo' : ''}${interrupt ? ' is-interrupt' : ''}`;
    button.dataset.testid = `skill-${skill.id}`;
    button.disabled = availability.disabled || acting;
    const title = document.createElement('strong');
    title.textContent = `${skill.name}${combo ? ' · COMBO' : interrupt ? ' · INTERRUPT' : ''}`;
    const meta = document.createElement('small');
    meta.dataset.testid = `skill-${skill.id}-state`;
    meta.textContent = availability.reason;
    const description = document.createElement('small');
    description.textContent = skill.id === 'piercing-stitch'
      ? 'Damage + apply Exposed'
      : skill.id === 'severing-knot'
        ? 'Finisher + consume Exposed + interrupt'
        : 'Heal every living Weaver';
    button.append(title, meta, description);
    button.addEventListener('click', () => useSkill(run.id, skill.id, button));
    return button;
  }

  async function refreshSkills() {
    const generation = ++renderGeneration;
    try {
      const data = await dashboard();
      if (generation !== renderGeneration) return;
      const run = data.activeRun;
      if (!run || !['combat', 'boss'].includes(run.phase) || !run.viewer || run.viewer.hp <= 0) {
        panel.hidden = true;
        panel.innerHTML = '';
        return;
      }
      panel.hidden = false;
      panel.innerHTML = '';
      panel.append(renderFocus(run));
      const statuses = renderStatuses(run);
      if (statuses.children.length) panel.append(statuses);
      const grid = document.createElement('div');
      grid.className = 'combat-skill-grid';
      for (const skill of data.combatSkills || []) grid.append(renderSkillButton(skill, run));
      panel.append(grid);
    } catch {
      // The main Adventure Stream owns connection/error messaging. Skills disappear if
      // its authoritative dashboard cannot be read rather than inventing stale state.
      panel.hidden = true;
    }
  }

  function appendReceiptChip(row, text, tone = 'special') {
    let chips = row.querySelector('.stream-result-chips');
    if (!chips) {
      chips = document.createElement('div');
      chips.className = 'stream-result-chips';
      row.querySelector('.stream-rich-header')?.after(chips);
    }
    if ([...chips.children].some((chip) => chip.textContent === text)) return;
    const chip = document.createElement('span');
    chip.className = `stream-result-chip ${tone}`;
    chip.textContent = text;
    chips.append(chip);
  }

  function enhanceSkillReceipts() {
    if (!streamLog) return;
    for (const row of streamLog.querySelectorAll('.stream-entry-rich.stream-action-skill:not([data-skill-enhanced="true"])')) {
      const raw = row.querySelector('[data-testid="stream-raw-result"]')?.textContent?.trim() || '';
      if (!raw) continue;
      const summary = row.querySelector('.stream-rich-summary');
      const kicker = row.querySelector('.stream-rich-kicker');
      const actionSummary = raw.match(/^(.*?)(?=\s❤️|\s🧵\sFocus|\s👾|$)/u)?.[1] || raw;
      if (summary) summary.textContent = actionSummary;
      if (kicker) kicker.textContent = '✦ SKILL';

      const damage = raw.match(/for (\d+) damage/i)?.[1];
      if (damage) appendReceiptChip(row, `⚔ −${damage} ENEMY HP`, 'damage');
      const combo = raw.match(/COMBO\s+([^·.]+?)\s+\+(\d+) damage/i);
      if (combo) appendReceiptChip(row, `✦ COMBO ${combo[1].trim()} +${combo[2]}`, 'special');
      const focus = raw.match(/Focus (\d+)\/(\d+)/i);
      if (focus) appendReceiptChip(row, `🧵 FOCUS ${focus[1]}/${focus[2]}`, 'special');
      if (/EXPOSED/i.test(raw)) appendReceiptChip(row, '✦ EXPOSED', 'special');
      row.dataset.skillEnhanced = 'true';
    }
  }

  function scheduleReceiptEnhancement(delay = 70) {
    clearTimeout(receiptTimer);
    receiptTimer = setTimeout(enhanceSkillReceipts, delay);
  }

  function scheduleRefresh(delay = 50) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshSkills(), delay);
  }

  const observer = new MutationObserver(() => scheduleRefresh());
  observer.observe(suggestions, { childList: true, subtree: true, characterData: true });
  const receiptObserver = streamLog ? new MutationObserver(() => scheduleReceiptEnhancement()) : null;
  if (streamLog) receiptObserver.observe(streamLog, { childList: true, subtree: true });
  scheduleRefresh(0);
  scheduleReceiptEnhancement(120);

  window.addEventListener('beforeunload', () => {
    clearTimeout(refreshTimer);
    clearTimeout(receiptTimer);
    observer.disconnect();
    receiptObserver?.disconnect();
  }, { once: true });
}
