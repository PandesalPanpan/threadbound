const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  let refreshTimer = null;
  let generation = 0;

  const style = document.createElement('style');
  style.textContent = `
    body[data-thread-first="true"] .stream-combat-dock { display:none !important; }
    #stream .combat-skill[hidden], #stream .combat-skill-grid[hidden] { display:none !important; }
    #stream .interaction-technique-hint { margin:0; padding:6px 1px 1px; color:var(--muted); font-size:.62rem; line-height:1.35; }
    #stream .stream-primary-actions[data-mode="upgrade"] .stream-action-section-head strong { color:#ffe097; }
  `;
  document.head.append(style);

  async function dashboard() {
    const response = await fetch('/api/dashboard', { headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error('Could not read current interaction state.');
    return response.json();
  }

  function setHidden(element, hidden) {
    if (element && element.hidden !== hidden) element.hidden = hidden;
  }

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function applyContextualActions(run) {
    if (!suggestions || !run || !['combat', 'boss'].includes(run.phase)) return;
    const intent = run.enemyIntent || null;
    const guard = suggestions.querySelector('button[data-command="/guard"]');
    const interrupt = suggestions.querySelector('button[data-command="/interrupt"]');
    if (guard) {
      const relevant = !intent || intent.reaction === 'guard' || intent.id === 'threadmark-lunge';
      setHidden(guard, !relevant);
    }
    if (interrupt) setHidden(interrupt, !(intent && intent.reaction === 'interrupt'));
  }

  function applyTechniqueBudget(run) {
    const panel = stream.querySelector('[data-testid="combat-skill-panel"]');
    if (!panel || !run || !['combat', 'boss'].includes(run.phase)) return;
    const grid = panel.querySelector('.combat-skill-grid');
    if (!grid) return;
    const buttons = [...grid.querySelectorAll('button.combat-skill')];
    let available = 0;
    for (const button of buttons) {
      const usable = !button.disabled;
      setHidden(button, !usable);
      if (usable) available += 1;
    }
    setHidden(grid, available === 0);
    const existingHint = panel.querySelector('.interaction-technique-hint');
    if (available === 0 && !existingHint) {
      const hint = document.createElement('p');
      hint.className = 'interaction-technique-hint';
      hint.textContent = 'Techniques charge with Focus and appear when they can actually be used.';
      panel.append(hint);
    } else if (available > 0 && existingHint) existingHint.remove();
  }

  function decorateBossPrepPowers(data) {
    const run = data?.activeRun;
    if (!suggestions || !run || run.phase !== 'upgrade' || run.runUpgradeResume) return;
    const byId = new Map((data.runUpgrades || []).map((power) => [power.id, power]));
    for (const button of suggestions.querySelectorAll('button[data-command^="/upgrade "]')) {
      const id = String(button.dataset.command || '').split(/\s+/)[1] || '';
      const power = byId.get(id);
      if (!power) {
        setHidden(button, true);
        continue;
      }
      setHidden(button, false);
      const revision = JSON.stringify([power.name, power.description, power.effectSummary, power.category]);
      if (button.dataset.interactionPowerRevision === revision) continue;
      button.dataset.interactionPowerRevision = revision;
      button.classList.add('run-power-card');
      button.setAttribute('aria-label', power.name);
      button.innerHTML = '';
      const category = document.createElement('span');
      category.className = 'run-power-category';
      category.textContent = `✦ ${power.category || 'RUN POWER'}`;
      const name = document.createElement('strong');
      name.className = 'run-power-name';
      name.textContent = power.name;
      const description = document.createElement('small');
      description.className = 'run-power-description';
      description.textContent = power.description || 'Power for the boss encounter.';
      const effects = document.createElement('span');
      effects.className = 'run-power-effects';
      for (const effect of power.effectSummary || []) {
        const chip = document.createElement('span');
        chip.className = 'run-power-effect';
        chip.textContent = effect;
        effects.append(chip);
      }
      button.append(category, name, description);
      if (effects.children.length) button.append(effects);
    }
  }

  function applyMilestoneCopy(run) {
    if (!run || run.phase !== 'upgrade' || run.runUpgradeResume) return;
    const primary = stream.querySelector('[data-testid="stream-primary-actions"]');
    if (primary && primary.dataset.mode !== 'upgrade') primary.dataset.mode = 'upgrade';
    const label = stream.querySelector('[data-testid="stream-action-mode"]');
    setText(label, 'BOSS PREPARATION');
    setText(label?.parentElement?.querySelector('small'), 'Choose one run power before the boss');
    setText(stream.querySelector('[data-testid="stream-decision-snapshot"] .stream-decision-head strong'), 'Prepare for the boss');
  }

  async function refresh() {
    const current = ++generation;
    try {
      const data = await dashboard();
      if (current !== generation) return;
      applyContextualActions(data.activeRun);
      applyTechniqueBudget(data.activeRun);
      decorateBossPrepPowers(data);
      applyMilestoneCopy(data.activeRun);
    } catch {
      // Core Adventure Stream owns connection/error messaging. This is presentation-only.
    }
  }

  function schedule(delay = 45) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh(), delay);
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(stream, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden', 'disabled'] });
  schedule(0);

  window.addEventListener('beforeunload', () => {
    clearTimeout(refreshTimer);
    observer.disconnect();
  }, { once:true });
}
