import { attachBattleDetails } from './battle-details.js';
import { renderSimulatedAdventurerProfile } from './simulated-profile-rich-card.js';
import { createSpriteElement, weaverSpriteFrame } from './sprite-catalog.js';

const stream = document.querySelector('#stream');

if (stream) {
  const styles = document.createElement('style');
  styles.dataset.leaderboardRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-leaderboard-rich-card="true"] { scroll-margin-top:76px; }
    .thread-leaderboard-list { display:grid; gap:8px; }
    .thread-leaderboard-row { display:grid; grid-template-columns:34px 48px minmax(0,1fr); gap:9px; align-items:center; padding:9px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:rgba(8,14,28,.62); }
    .thread-leaderboard-place { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:999px; border:1px solid rgba(255,255,255,.12); font-size:.72rem; font-weight:950; }
    .thread-leaderboard-row[data-place="1"] .thread-leaderboard-place { color:var(--gold); border-color:rgba(255,209,102,.35); background:rgba(255,209,102,.08); }
    .thread-leaderboard-avatar { width:46px; min-width:46px; border-radius:9px; background-color:rgba(255,255,255,.035); }
    .thread-leaderboard-copy { display:grid; gap:4px; min-width:0; }
    .thread-leaderboard-name { display:flex; align-items:center; flex-wrap:wrap; gap:5px; min-width:0; }
    .thread-leaderboard-name strong { font-size:.82rem; overflow-wrap:anywhere; }
    .thread-leaderboard-badge { padding:3px 6px; border:1px solid rgba(255,255,255,.11); border-radius:999px; color:var(--muted); font-size:.55rem; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
    .thread-leaderboard-badge.rival { color:#ffe097; border-color:rgba(255,209,102,.25); }
    .thread-leaderboard-metrics { display:flex; flex-wrap:wrap; gap:4px 8px; color:var(--muted); font-size:.64rem; line-height:1.35; }
    .thread-leaderboard-metrics strong { color:var(--text); font-weight:850; }
    .thread-leaderboard-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
    .thread-leaderboard-profile, .thread-leaderboard-duel { min-height:44px; min-width:82px; padding:8px 13px; border-radius:10px; font-weight:900; cursor:pointer; }
    .thread-leaderboard-profile { border:1px solid rgba(85,214,255,.28); background:rgba(85,214,255,.08); color:#8fe9ff; }
    .thread-leaderboard-duel { border:1px solid rgba(255,209,102,.28); background:rgba(255,209,102,.08); color:#ffe097; }
    .thread-leaderboard-profile:disabled, .thread-leaderboard-duel:disabled { opacity:.55; cursor:wait; }
    .thread-leaderboard-result { display:grid; gap:6px; padding:10px; border:1px solid rgba(85,214,255,.2); border-radius:11px; background:rgba(85,214,255,.06); }
    .thread-leaderboard-result strong { font-size:.82rem; }
    .thread-leaderboard-result p { margin:0; color:var(--muted); font-size:.68rem; line-height:1.45; }
    .thread-leaderboard-note { margin:0; color:var(--muted); font-size:.67rem; line-height:1.45; }
    @media (max-width:420px) {
      .thread-leaderboard-row { grid-template-columns:30px 42px minmax(0,1fr); gap:7px; padding:8px 7px; }
      .thread-leaderboard-place { width:28px; height:28px; }
      .thread-leaderboard-avatar { width:40px; min-width:40px; }
      .thread-leaderboard-metrics { font-size:.61rem; gap:3px 7px; }
      .thread-leaderboard-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
      .thread-leaderboard-profile, .thread-leaderboard-duel { width:100%; min-width:0; padding-inline:8px; }
    }
  `;
  document.head.append(styles);

  function showError(message = '') {
    const error = stream.querySelector('[data-testid="stream-error"]');
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

  async function loadLeaderboard() {
    const payload = await api('/api/areas');
    const towns = payload.area?.towns || [];
    const guildHall = towns.find((town) => town.guildHall?.leaderboard)?.guildHall || null;
    if (!guildHall) throw new Error('No Guild Hall leaderboard is available in the current Area.');
    return guildHall;
  }

  function header(card, subtitle) {
    const wrap = document.createElement('div');
    wrap.className = 'thread-reply-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'PRIVATE THREAD REPLY · /leaderboard';
    const heading = document.createElement('strong');
    heading.textContent = 'Leaderboard';
    const small = document.createElement('small');
    small.textContent = subtitle;
    copy.append(kicker, heading, small);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss Leaderboard panel');
    close.textContent = '×';
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    wrap.append(copy, close);
    return wrap;
  }

  function metric(label, value) {
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    span.append(`${label} `, strong);
    return span;
  }

  function resultPanel(duel) {
    const host = document.createElement('section');
    host.className = 'thread-leaderboard-result';
    host.dataset.testid = 'duel-result';
    const heading = document.createElement('strong');
    heading.textContent = duel.battle?.receipt?.headline || 'Duel resolved';
    const copy = document.createElement('p');
    const record = duel.record || { wins: 0, losses: 0, draws: 0 };
    copy.textContent = `${duel.opponent?.name || 'Opponent'} · Record ${record.wins}-${record.losses}-${record.draws}`;
    host.append(heading, copy);
    if (duel.battle?.receipt?.detailsAvailable) attachBattleDetails(host, duel.battle);
    return host;
  }

  async function startDuel(entry, button) {
    const previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Dueling…';
    try {
      showError('');
      const idempotencyKey = `duel-${entry.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload = await api(`/api/duels/${encodeURIComponent(entry.id)}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      const guildHall = await loadLeaderboard();
      renderLeaderboard(guildHall, payload.duel);
    } catch (error) {
      showError(error.message);
      button.disabled = false;
      button.textContent = previousLabel;
    }
  }

  function renderLeaderboard(guildHall, latestDuel = null) {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    const entries = Array.isArray(guildHall.leaderboard) ? guildHall.leaderboard : [];
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'leaderboard';
    card.dataset.leaderboardRichCard = 'true';
    card.append(header(card, `${guildHall.name || 'Guild Hall'} standings · server ranked`));

    const list = document.createElement('div');
    list.className = 'thread-leaderboard-list';
    list.dataset.testid = 'leaderboard-list';
    for (const entry of entries) {
      const row = document.createElement('article');
      row.className = 'thread-leaderboard-row';
      row.dataset.testid = `leaderboard-row-${entry.id}`;
      row.dataset.place = String(entry.placement);

      const place = document.createElement('span');
      place.className = 'thread-leaderboard-place';
      place.dataset.testid = `leaderboard-place-${entry.id}`;
      place.textContent = `#${entry.placement}`;

      const sprite = createSpriteElement(
        weaverSpriteFrame(entry.id, { variant: entry.spriteVariant === 'female' ? 'female' : 'male' }),
        { className: 'thread-leaderboard-avatar', label: `${entry.name} portrait` },
      );

      const copy = document.createElement('div');
      copy.className = 'thread-leaderboard-copy';
      const name = document.createElement('div');
      name.className = 'thread-leaderboard-name';
      const strong = document.createElement('strong');
      strong.textContent = entry.name;
      name.append(strong);
      const kind = document.createElement('span');
      kind.className = 'thread-leaderboard-badge';
      kind.textContent = entry.isSimulated ? 'Simulated' : 'Player';
      name.append(kind);
      if (entry.strongRival) {
        const rival = document.createElement('span');
        rival.className = 'thread-leaderboard-badge rival';
        rival.textContent = 'Veteran rival';
        name.append(rival);
      }

      const progression = document.createElement('div');
      progression.className = 'thread-leaderboard-metrics';
      progression.append(
        metric('Lv', entry.level),
        metric('Hunts', entry.huntCount),
        metric('Area', entry.highestUnlockedAreaNumber),
        metric('Achievements', entry.achievementCount || 0),
      );
      const power = document.createElement('div');
      power.className = 'thread-leaderboard-metrics';
      power.append(
        metric('ATK', entry.power?.attack || 0),
        metric('DEF', entry.power?.defense || 0),
        metric('Inventory', `${entry.power?.equippedCount || 0}/5`),
      );
      if (entry.duelRecord) power.append(metric('Duels', `${entry.duelRecord.wins}-${entry.duelRecord.losses}-${entry.duelRecord.draws}`));
      copy.append(name, progression, power);
      if (entry.isSimulated) {
        const actions = document.createElement('div');
        actions.className = 'thread-leaderboard-actions';
        const profile = document.createElement('button');
        profile.type = 'button';
        profile.className = 'thread-leaderboard-profile';
        profile.dataset.testid = `leaderboard-profile-${entry.id}`;
        profile.textContent = 'Profile';
        profile.setAttribute('aria-label', `Inspect ${entry.name} profile`);
        profile.addEventListener('click', () => renderSimulatedAdventurerProfile(entry));
        const duel = document.createElement('button');
        duel.type = 'button';
        duel.className = 'thread-leaderboard-duel';
        duel.dataset.testid = `leaderboard-duel-${entry.id}`;
        duel.textContent = entry.strongRival ? 'Duel rival' : 'Duel';
        duel.addEventListener('click', () => startDuel(entry, duel));
        actions.append(profile, duel);
        copy.append(actions);
      }
      row.append(place, sprite, copy);
      list.append(row);
    }
    card.append(list);
    if (latestDuel) card.append(resultPanel(latestDuel));

    const note = document.createElement('p');
    note.className = 'thread-leaderboard-note';
    note.textContent = 'Placement uses persisted Level/XP, Area, Hunt activity, achievements, canonical equipment stats, and authoritative Duel records. Inspect Profile for full bot equipment, stats, and recent history.';
    card.append(note);
    card.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  async function openLeaderboard() {
    try {
      showError('');
      renderLeaderboard(await loadLeaderboard());
    } catch (error) {
      showError(error.message);
    }
  }

  function installComposerIntercept() {
    const form = stream.querySelector('[data-testid="stream-composer"]');
    const input = stream.querySelector('[data-testid="stream-message"]');
    if (!form || !input || form.dataset.leaderboardCommandInstalled === 'true') return false;
    form.dataset.leaderboardCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const value = String(input.value || '').trim().toLowerCase();
      if (!['leaderboard', '/leaderboard'].includes(value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      openLeaderboard();
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
