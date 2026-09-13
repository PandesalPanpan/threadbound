const stream = document.querySelector('#stream');

if (stream) {
  const styles = document.createElement('style');
  styles.dataset.questRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-quest-rich-card="true"] { scroll-margin-top:76px; }
    .thread-quest-list { display:grid; gap:9px; }
    .thread-quest-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:start; padding:11px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(4,10,21,.5); }
    .thread-quest-copy { display:grid; gap:5px; min-width:0; }
    .thread-quest-title-line { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
    .thread-quest-title-line strong { font-size:.9rem; }
    .thread-quest-state { padding:3px 7px; border-radius:999px; border:1px solid rgba(255,255,255,.1); font-size:.59rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
    .thread-quest-state[data-state="active"] { color:#9eeaff; border-color:rgba(85,214,255,.25); background:rgba(85,214,255,.07); }
    .thread-quest-state[data-state="claimable"] { color:#9ff2c4; border-color:rgba(100,230,169,.25); background:rgba(100,230,169,.08); }
    .thread-quest-state[data-state="completed"] { color:#ffe097; border-color:rgba(255,209,102,.22); background:rgba(255,209,102,.07); }
    .thread-quest-description { margin:0; color:var(--muted); font-size:.69rem; line-height:1.45; }
    .thread-quest-objectives { display:grid; gap:4px; margin-top:2px; }
    .thread-quest-objective { display:flex; justify-content:space-between; gap:8px; padding:5px 7px; border-radius:8px; background:rgba(255,255,255,.035); font-size:.67rem; line-height:1.35; }
    .thread-quest-objective span:last-child { flex:0 0 auto; font-weight:900; font-variant-numeric:tabular-nums; }
    .thread-quest-action { min-width:92px; min-height:44px; padding:8px 11px; border-radius:10px; font-weight:900; }
    .thread-quest-action:disabled { opacity:.6; }
    .thread-quest-empty { margin:0; padding:12px; border:1px dashed rgba(255,255,255,.11); border-radius:11px; color:var(--muted); font-size:.72rem; }
    @media (max-width:420px) {
      .thread-quest-row { grid-template-columns:1fr; }
      .thread-quest-action { width:100%; }
    }
  `;
  document.head.append(styles);

  async function api(path, options = {}) {
    const response = await fetch(path, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function showError(message = '') {
    const error = stream.querySelector('[data-testid="stream-error"]');
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  function header(card, subtitle) {
    const wrap = document.createElement('div');
    wrap.className = 'thread-reply-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'PRIVATE THREAD REPLY · /quest';
    const heading = document.createElement('strong');
    heading.textContent = 'Quest';
    const small = document.createElement('small');
    small.textContent = subtitle;
    copy.append(kicker, heading, small);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss Quest panel');
    close.textContent = '×';
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    wrap.append(copy, close);
    return wrap;
  }

  function progressFor(quest, objective) {
    const row = quest.progress?.objectiveProgress?.find((candidate) => candidate.objectiveId === objective.id);
    if (row) return row;
    const complete = ['claimable', 'completed'].includes(quest.state);
    return { current: complete ? objective.count : 0, target: objective.count, complete };
  }

  function actionLabel(state) {
    if (state === 'available') return 'Accept';
    if (state === 'active') return 'In progress';
    if (state === 'claimable') return 'Claim';
    return 'Completed';
  }

  async function mutateQuest(quest, button) {
    if (!['available', 'claimable'].includes(quest.state)) return;
    button.disabled = true;
    try {
      showError('');
      const action = quest.state === 'available' ? 'accept' : 'claim';
      const payload = await api(`/api/quests/${encodeURIComponent(quest.id)}/${action}`, { method: 'POST' });
      renderQuests(payload.quests);
    } catch (error) {
      showError(error.message);
      if (button.isConnected) button.disabled = false;
    }
  }

  function renderQuests(model) {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'quest';
    card.dataset.questRichCard = 'true';
    card.append(header(card, `${model.currentArea.name} quests`));

    const list = document.createElement('div');
    list.className = 'thread-quest-list';
    list.dataset.testid = 'quest-list';
    if (!model.quests?.length) {
      const empty = document.createElement('p');
      empty.className = 'thread-quest-empty';
      empty.dataset.testid = 'quest-empty';
      empty.textContent = `No Quests are available in ${model.currentArea.name} yet.`;
      list.append(empty);
    }

    for (const quest of model.quests || []) {
      const row = document.createElement('article');
      row.className = 'thread-quest-row';
      row.dataset.testid = `quest-row-${quest.id}`;

      const copy = document.createElement('div');
      copy.className = 'thread-quest-copy';
      const titleLine = document.createElement('div');
      titleLine.className = 'thread-quest-title-line';
      const title = document.createElement('strong');
      title.textContent = quest.title;
      const state = document.createElement('span');
      state.className = 'thread-quest-state';
      state.dataset.testid = `quest-state-${quest.id}`;
      state.dataset.state = quest.state;
      state.textContent = quest.state;
      titleLine.append(title, state);
      copy.append(titleLine);

      if (quest.description) {
        const description = document.createElement('p');
        description.className = 'thread-quest-description';
        description.textContent = quest.description;
        copy.append(description);
      }

      const objectives = document.createElement('div');
      objectives.className = 'thread-quest-objectives';
      for (const objective of quest.objectives || []) {
        const progress = progressFor(quest, objective);
        const item = document.createElement('div');
        item.className = 'thread-quest-objective';
        item.dataset.testid = `quest-objective-${quest.id}-${objective.id}`;
        const label = document.createElement('span');
        label.textContent = objective.label;
        const count = document.createElement('span');
        count.textContent = `${progress.current}/${progress.target}`;
        item.append(label, count);
        objectives.append(item);
      }
      copy.append(objectives);

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'thread-quest-action';
      action.dataset.testid = `quest-action-${quest.id}`;
      action.textContent = actionLabel(quest.state);
      action.disabled = !['available', 'claimable'].includes(quest.state);
      action.addEventListener('click', () => mutateQuest(quest, action));
      row.append(copy, action);
      list.append(row);
    }
    card.append(list);
    card.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  async function openQuests() {
    try {
      showError('');
      renderQuests(await api('/api/quests'));
    } catch (error) {
      showError(error.message);
    }
  }

  function installComposerIntercept() {
    const form = stream.querySelector('[data-testid="stream-composer"]');
    const input = stream.querySelector('[data-testid="stream-message"]');
    if (!form || !input || form.dataset.questCommandInstalled === 'true') return false;
    form.dataset.questCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const value = String(input.value || '').trim().toLowerCase();
      if (!['quest', 'quests', '/quest', '/quests'].includes(value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      openQuests();
    }, true);
    return true;
  }

  if (!installComposerIntercept()) {
    const observer = new MutationObserver(() => {
      if (installComposerIntercept()) observer.disconnect();
    });
    observer.observe(stream, { childList: true, subtree: true });
  }
}
