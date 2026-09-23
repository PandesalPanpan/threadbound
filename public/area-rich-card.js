import { resetRichCardMetadata } from './ui-v2/rich-card-metadata.js';

const stream = document.querySelector('#stream');

if (stream) {
  const styles = document.createElement('style');
  styles.dataset.areaRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-area-rich-card="true"] { scroll-margin-top:76px; }
    .thread-area-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .thread-area-summary-cell { display:grid; gap:2px; min-width:0; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.03); }
    .thread-area-summary-cell span { color:var(--muted); font-size:.66rem; font-weight:850; letter-spacing:.06em; text-transform:uppercase; }
    .thread-area-summary-cell strong { font-size:.92rem; overflow-wrap:anywhere; }
    .thread-area-list { display:grid; gap:8px; }
    .thread-area-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:rgba(4,10,21,.48); }
    .thread-area-row.is-current { border-color:rgba(85,214,255,.32); background:rgba(85,214,255,.07); }
    .thread-area-copy { display:grid; gap:2px; min-width:0; }
    .thread-area-copy strong { font-size:.84rem; }
    .thread-area-copy small { color:var(--muted); font-size:.68rem; line-height:1.35; }
    .thread-area-row button { min-width:88px; min-height:44px; margin:0 !important; }
    .thread-area-row button[disabled] { opacity:.72; }
    .thread-area-note { margin:0; color:var(--muted); font-size:.7rem; line-height:1.45; }
    .thread-area-unlock { display:grid; gap:6px; padding:12px; border:1px solid rgba(255,198,104,.24); border-radius:11px; background:rgba(255,198,104,.055); }
    .thread-area-unlock > span { color:#ffd27a; font-size:.62rem; font-weight:900; letter-spacing:.07em; text-transform:uppercase; }
    .thread-area-unlock > strong { font-size:.84rem; }
    .thread-area-unlock > small { color:var(--muted); font-size:.69rem; line-height:1.45; }
    @media (max-width:420px) {
      .thread-area-summary { grid-template-columns:1fr 1fr; }
      .thread-area-row { grid-template-columns:1fr; }
      .thread-area-row button { width:100%; }
    }
  `;
  document.head.append(styles);

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
    if (!response.ok) {
      const error = new Error(payload.message || `Request failed (${response.status})`);
      error.code = payload.error;
      throw error;
    }
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
    kicker.textContent = 'PRIVATE THREAD REPLY · /area';
    const heading = document.createElement('strong');
    heading.textContent = 'Area';
    const small = document.createElement('small');
    small.textContent = subtitle;
    copy.append(kicker, heading, small);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss Area panel');
    close.textContent = '×';
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    wrap.append(copy, close);
    return wrap;
  }

  function summaryCell(label, value, testId) {
    const cell = document.createElement('div');
    cell.className = 'thread-area-summary-cell';
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = value;
    if (testId) amount.dataset.testid = testId;
    cell.append(name, amount);
    return cell;
  }

  function recommendedLevel(range) {
    const minimum = Number(range?.min);
    const maximum = Number(range?.max);
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) return 'Not specified';
    return minimum === maximum ? `Level ${minimum}` : `Levels ${minimum}–${maximum}`;
  }

  function renderArea(data) {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    resetRichCardMetadata(card);
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'area';
    card.dataset.areaRichCard = 'true';
    card.append(header(card, 'Choose where your next activity takes place.'));

    const summary = document.createElement('div');
    summary.className = 'thread-area-summary';
    summary.append(
      summaryCell('Current Area', data.currentArea.name, 'area-current'),
      summaryCell('Unlocked Through', data.highestUnlockedArea.name, 'area-highest-unlocked'),
    );
    if (data.currentAreaContent?.recommendedLevel) {
      summary.append(summaryCell('Recommended Level', recommendedLevel(data.currentAreaContent.recommendedLevel), 'area-recommended-level'));
    }
    card.append(summary);

    const list = document.createElement('div');
    list.className = 'thread-area-list';
    list.dataset.testid = 'area-list';
    for (const area of data.areas || []) {
      const row = document.createElement('article');
      row.className = `thread-area-row${area.current ? ' is-current' : ''}`;
      row.dataset.testid = `area-row-${area.number}`;
      const copy = document.createElement('div');
      copy.className = 'thread-area-copy';
      const name = document.createElement('strong');
      name.textContent = area.name;
      const detail = document.createElement('small');
      detail.textContent = area.current ? 'You are here now.' : 'Unlocked · available for travel';
      copy.append(name, detail);

      const action = document.createElement('button');
      action.type = 'button';
      action.className = area.current ? '' : 'primary-action';
      action.dataset.testid = `area-travel-${area.number}`;
      action.textContent = area.current ? 'Current' : 'Travel';
      action.disabled = Boolean(area.current);
      action.addEventListener('click', async () => {
        action.disabled = true;
        showError('');
        try {
          const next = await api(`/api/areas/${area.number}/travel`, { method: 'POST' });
          renderArea(next.area);
        } catch (error) {
          showError(error.message);
          action.disabled = false;
        }
      });
      row.append(copy, action);
      list.append(row);
    }
    card.append(list);

    if (data.nextLockedArea) {
      const locked = data.nextLockedArea;
      const challenge = locked.progressionChallenge;
      const unlock = document.createElement('article');
      unlock.className = 'thread-area-unlock';
      unlock.dataset.testid = 'next-locked-area';
      unlock.dataset.areaNumber = String(locked.number);

      const status = document.createElement('span');
      status.textContent = `Area ${locked.number} · Locked`;
      const name = document.createElement('strong');
      name.textContent = locked.name;
      const recommendation = document.createElement('small');
      recommendation.dataset.testid = 'area-next-recommended-level';
      recommendation.textContent = `Recommended ${recommendedLevel(locked.recommendedLevel)}.`;
      const reason = document.createElement('small');
      reason.dataset.testid = 'area-next-lock-reason';
      reason.textContent = locked.lockReason || 'Complete the progression challenge to open this Area.';
      unlock.append(status, name, recommendation, reason);

      if (challenge) {
        const challengeName = document.createElement('strong');
        challengeName.dataset.testid = 'area-progression-challenge';
        challengeName.textContent = challenge.name;
        const requirement = document.createElement('small');
        requirement.dataset.testid = 'area-progression-requirement';
        requirement.textContent = `Clear this challenge in ${challenge.areaName || data.highestUnlockedArea.name} with ${challenge.requiredHumanPlayers} ready human players.`;
        unlock.append(challengeName, requirement);
      }
      card.append(unlock);
    }

    const note = document.createElement('p');
    note.className = 'thread-area-note';
    note.textContent = 'Only unlocked Areas are travel options. Threadbound persists travel and decides unlocks.';
    card.append(note);
    card.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  async function openArea() {
    try {
      const payload = await api('/api/areas');
      renderArea(payload.area);
    } catch (error) {
      showError(error.message);
    }
  }

  function installComposerIntercept() {
    const form = stream.querySelector('[data-testid="stream-composer"]');
    const input = stream.querySelector('[data-testid="stream-message"]');
    if (!form || !input || form.dataset.areaCommandInstalled === 'true') return false;
    form.dataset.areaCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const value = String(input.value || '').trim().toLowerCase();
      if (!['area', '/area', 'areas', '/areas', 'travel', '/travel'].includes(value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      showError('');
      openArea();
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
