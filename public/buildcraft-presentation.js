const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const style = document.createElement('style');
  style.textContent = `
    .stream-build-summary {
      display:grid; gap:7px; margin-top:8px; padding:9px 10px;
      border:1px solid rgba(199,150,255,.24); border-radius:12px;
      background:linear-gradient(145deg,rgba(22,13,39,.74),rgba(5,11,23,.9));
      box-shadow:inset 3px 0 0 rgba(199,150,255,.56);
    }
    .stream-build-summary[hidden] { display:none !important; }
    .stream-build-summary-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .stream-build-summary-head strong { color:#ead8ff; font-size:.58rem; font-weight:1000; letter-spacing:.12em; }
    .stream-build-summary-head small { color:var(--muted); font-size:.57rem; }
    .stream-build-paths { display:flex; flex-wrap:wrap; gap:5px; }
    .stream-build-path { display:inline-flex; align-items:center; gap:4px; padding:3px 7px; border:1px solid rgba(199,150,255,.3); border-radius:999px; background:rgba(199,150,255,.08); color:#f0e2ff; font-size:.6rem; font-weight:900; }
    .stream-build-path.is-synergy { border-color:rgba(255,224,107,.45); background:rgba(255,224,107,.09); color:#fff2a9; }
    .stream-build-powers { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
    .stream-build-power { min-width:0; padding:7px 8px; border:1px solid rgba(255,255,255,.08); border-radius:9px; background:rgba(2,8,17,.45); }
    .stream-build-power strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#f7f1ff; font-size:.67rem; }
    .stream-build-power small { display:block; margin-top:2px; color:#b9a9d2; font-size:.56rem; line-height:1.3; }
    @media (max-width:720px) { .stream-build-powers { grid-template-columns:1fr; } }
  `;
  document.head.append(style);

  const catalog = new Map();
  let panel = null;
  let timer = null;
  let refreshing = false;

  const humanize = (value) => String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

  function ensurePanel() {
    const snapshot = stream.querySelector('[data-testid="stream-decision-snapshot"]');
    if (!snapshot) return null;
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'stream-build-summary';
      panel.dataset.testid = 'stream-build-summary';
      panel.hidden = true;
      snapshot.after(panel);
    } else if (panel.previousElementSibling !== snapshot) snapshot.after(panel);
    return panel;
  }

  function rememberCatalog(data) {
    for (const power of data?.runUpgrades || []) {
      if (power?.id) catalog.set(power.id, structuredClone(power));
    }
  }

  function sharedArchetypes(definitions) {
    const counts = new Map();
    for (const power of definitions) {
      for (const tag of power?.archetypes || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  }

  function render(data) {
    const target = ensurePanel();
    if (!target) return;
    rememberCatalog(data);
    const ids = data?.activeRun?.selectedUpgrades || [];
    if (!data?.activeRun || !ids.length) {
      target.hidden = true;
      target.innerHTML = '';
      return;
    }

    target.hidden = false;
    target.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'stream-build-summary-head';
    const title = document.createElement('strong');
    title.textContent = 'CURRENT RUN BUILD';
    const hint = document.createElement('small');
    hint.textContent = `${ids.length} power${ids.length === 1 ? '' : 's'} locked in`;
    head.append(title, hint);
    target.append(head);

    const definitions = ids.map((id) => catalog.get(id) || { id, name: humanize(id), archetypes: [], effectSummary: [] });
    const paths = document.createElement('div');
    paths.className = 'stream-build-paths';
    paths.dataset.testid = 'stream-build-paths';
    for (const [tag, count] of sharedArchetypes(definitions)) {
      const chip = document.createElement('span');
      chip.className = `stream-build-path${count > 1 ? ' is-synergy' : ''}`;
      chip.textContent = count > 1 ? `${humanize(tag)} synergy ×${count}` : humanize(tag);
      paths.append(chip);
    }
    if (paths.children.length) target.append(paths);

    const powers = document.createElement('div');
    powers.className = 'stream-build-powers';
    for (const power of definitions) {
      const card = document.createElement('article');
      card.className = 'stream-build-power';
      card.dataset.powerId = power.id;
      const name = document.createElement('strong');
      name.textContent = power.name || humanize(power.id);
      const effect = document.createElement('small');
      effect.textContent = (power.effectSummary || []).join(' · ') || 'Selected run power';
      card.append(name, effect);
      powers.append(card);
    }
    target.append(powers);
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const response = await fetch('/api/dashboard', { headers:{ Accept:'application/json' } });
      if (response.ok) render(await response.json());
    } finally {
      refreshing = false;
    }
  }

  function schedule(delay = 70) {
    clearTimeout(timer);
    timer = setTimeout(() => refresh().catch(() => {}), delay);
  }

  const observer = new MutationObserver(() => schedule(40));
  observer.observe(stream, { childList:true, subtree:true });
  schedule(0);
  window.addEventListener('beforeunload', () => {
    clearTimeout(timer);
    observer.disconnect();
  }, { once:true });
}
