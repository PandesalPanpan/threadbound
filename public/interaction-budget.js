const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  let refreshTimer = null;
  let generation = 0;

  const style = document.createElement('style');
  style.textContent = `
    #stream .combat-skill[hidden] { display:none !important; }
    #stream .interaction-technique-hint {
      margin:0; padding:6px 1px 1px; color:var(--muted); font-size:.62rem; line-height:1.35;
    }
    #stream .stream-primary-actions[data-mode="upgrade"] .stream-action-section-head strong { color:#ffe097; }
  `;
  document.head.append(style);

  async function dashboard() {
    const response = await fetch('/api/dashboard', { headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error('Could not read current interaction state.');
    return response.json();
  }

  function actionButton(command) {
    return suggestions?.querySelector(`button[data-command="${command}"]`) || null;
  }

  function applyContextualActions(run) {
    if (!suggestions || !run || !['combat', 'boss'].includes(run.phase)) return;
    const intent = run.enemyIntent || null;
    const guard = actionButton('/guard');
    const interrupt = actionButton('/interrupt');

    // Attack is the stable baseline. Reactions appear only when they answer an actual
    // telegraphed problem; experts can still type /guard or /interrupt manually.
    if (guard) {
      const guardWindow = Boolean(intent && (intent.reaction === 'guard' || intent.id === 'threadmark-lunge'));
      guard.hidden = !guardWindow;
      guard.dataset.contextualAction = 'guard';
    }
    if (interrupt) {
      const interruptWindow = Boolean(intent && intent.reaction === 'interrupt');
      interrupt.hidden = !interruptWindow;
      interrupt.dataset.contextualAction = 'interrupt';
    }
  }

  function applyTechniqueBudget(run) {
    const panel = stream.querySelector('[data-testid="combat-skill-panel"]');
    if (!panel || !run || !['combat', 'boss'].includes(run.phase)) return;
    const grid = panel.querySelector('.combat-skill-grid');
    if (!grid) return;

    panel.querySelector('.interaction-technique-hint')?.remove();
    const buttons = [...grid.querySelectorAll('button.combat-skill')];
    let available = 0;
    for (const button of buttons) {
      const usable = !button.disabled;
      button.hidden = !usable;
      if (usable) available += 1;
    }

    grid.hidden = available === 0;
    if (available === 0) {
      const hint = document.createElement('p');
      hint.className = 'interaction-technique-hint';
      hint.textContent = 'Techniques charge with Focus and appear when they can actually be used.';
      panel.append(hint);
    }
  }

  function applyMilestoneCopy(run) {
    if (!run || run.phase !== 'upgrade' || run.runUpgradeResume) return;
    const primary = stream.querySelector('[data-testid="stream-primary-actions"]');
    if (primary) primary.dataset.mode = 'upgrade';
    const label = stream.querySelector('[data-testid="stream-action-mode"]');
    if (label) label.textContent = 'BOSS PREPARATION';
    const hint = label?.parentElement?.querySelector('small');
    if (hint) hint.textContent = 'Choose one run power before the boss';
    const decisionHead = stream.querySelector('[data-testid="stream-decision-snapshot"] .stream-decision-head strong');
    if (decisionHead) decisionHead.textContent = 'Prepare for the boss';
  }

  async function refresh() {
    const current = ++generation;
    try {
      const data = await dashboard();
      if (current !== generation) return;
      const run = data.activeRun;
      applyContextualActions(run);
      applyTechniqueBudget(run);
      applyMilestoneCopy(run);
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
