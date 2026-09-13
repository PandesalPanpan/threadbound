import { createSpriteElement, itemSpriteFrame, weaverSpriteFrame } from './sprite-catalog.js';

const stream = document.querySelector('#stream');
const SLOT_LABELS = Object.freeze({ weapon: 'Weapon', helmet: 'Helmet', armor: 'Armor', boots: 'Boots', accessory: 'Accessory' });

if (stream) {
  const styles = document.createElement('style');
  styles.dataset.simulatedProfileRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-simulated-profile-rich-card="true"] { scroll-margin-top:76px; }
    .thread-sim-profile-hero { display:grid; grid-template-columns:64px minmax(0,1fr); gap:12px; align-items:center; }
    .thread-sim-profile-avatar { width:64px; min-width:64px; border-radius:12px; background-color:rgba(255,255,255,.035); }
    .thread-sim-profile-copy { display:grid; gap:3px; min-width:0; }
    .thread-sim-profile-copy > span { color:var(--muted); font-size:.64rem; font-weight:900; letter-spacing:.06em; text-transform:uppercase; }
    .thread-sim-profile-copy > strong { font-size:1.02rem; overflow-wrap:anywhere; }
    .thread-sim-profile-copy > small { color:var(--muted); font-size:.69rem; line-height:1.4; }
    .thread-sim-profile-badges { display:flex; flex-wrap:wrap; gap:5px; margin-top:2px; }
    .thread-sim-profile-badge { padding:3px 6px; border:1px solid rgba(255,255,255,.11); border-radius:999px; color:var(--muted); font-size:.55rem; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
    .thread-sim-profile-badge.rival { color:#ffe097; border-color:rgba(255,209,102,.28); }
    .thread-sim-profile-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .thread-sim-profile-cell { display:grid; gap:2px; min-width:0; padding:9px 10px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.03); }
    .thread-sim-profile-cell > span { color:var(--muted); font-size:.62rem; font-weight:850; text-transform:uppercase; letter-spacing:.05em; }
    .thread-sim-profile-cell > strong { font-size:.88rem; overflow-wrap:anywhere; }
    .thread-sim-profile-section { display:grid; gap:7px; }
    .thread-sim-profile-section > h3 { margin:0; font-size:.76rem; text-transform:uppercase; letter-spacing:.07em; }
    .thread-sim-profile-section > p { margin:0; color:var(--muted); font-size:.7rem; line-height:1.45; }
    .thread-sim-profile-slot { display:flex; align-items:center; gap:8px; min-width:0; padding:7px 8px; border-radius:9px; background:rgba(255,255,255,.025); }
    .thread-sim-profile-slot img { width:36px; height:36px; flex:0 0 36px; }
    .thread-sim-profile-slot-copy { display:grid; min-width:0; flex:1; }
    .thread-sim-profile-slot-copy > span { color:var(--muted); font-size:.61rem; font-weight:800; text-transform:uppercase; }
    .thread-sim-profile-slot-copy > strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.78rem; }
    .thread-sim-profile-slot-copy > small { color:var(--muted); font-size:.62rem; }
    .thread-sim-profile-history { display:grid; gap:6px; }
    .thread-sim-profile-history-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; padding:8px 9px; border:1px solid rgba(255,255,255,.07); border-radius:9px; background:rgba(8,14,28,.48); }
    .thread-sim-profile-history-row strong { font-size:.72rem; }
    .thread-sim-profile-history-row span { color:var(--muted); font-size:.62rem; text-align:right; }
    @media (max-width:420px) {
      .thread-sim-profile-hero { grid-template-columns:54px minmax(0,1fr); gap:9px; }
      .thread-sim-profile-avatar { width:54px; min-width:54px; }
      .thread-sim-profile-grid { gap:6px; }
      .thread-sim-profile-cell { padding:8px; }
    }
  `;
  document.head.append(styles);
}

function formatCrit(stats = {}) {
  const percent = Number(stats.critChancePercent);
  if (Number.isFinite(percent)) return `${percent}%`;
  const chance = Number(stats.critChance);
  return Number.isFinite(chance) ? `${Math.round(chance * 1000) / 10}%` : '0%';
}

function friendlyId(value) {
  return String(value || '').trim().split(/[-_]/g).filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function timestampLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function cell(label, value, testId = null) {
  const host = document.createElement('div');
  host.className = 'thread-sim-profile-cell';
  const name = document.createElement('span');
  name.textContent = label;
  const amount = document.createElement('strong');
  amount.textContent = String(value);
  if (testId) amount.dataset.testid = testId;
  host.append(name, amount);
  return host;
}

function header(card, entry) {
  const wrap = document.createElement('div');
  wrap.className = 'thread-reply-header';
  const copy = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.textContent = 'PRIVATE THREAD REPLY · /adventurer-profile';
  const heading = document.createElement('strong');
  heading.textContent = 'Adventurer Profile';
  const small = document.createElement('small');
  small.textContent = `Level ${entry.level} · highest Area ${entry.highestUnlockedAreaNumber}`;
  copy.append(kicker, heading, small);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'thread-reply-close';
  close.setAttribute('aria-label', 'Dismiss Adventurer Profile panel');
  close.textContent = '×';
  close.addEventListener('click', () => {
    card.hidden = true;
    card.innerHTML = '';
  });
  wrap.append(copy, close);
  return wrap;
}

function historyText(item) {
  if (item.type === 'duel') {
    const result = item.outcome === 'win' ? 'Won Duel' : item.outcome === 'loss' ? 'Lost Duel' : 'Drew Duel';
    return `${result} · ${Number(item.turnCount) || 0} turns`;
  }
  const label = item.type === 'adventure' ? 'Adventure' : 'Hunt';
  return `${label} · +${Number(item.experienceAward) || 0} XP`;
}

export function renderSimulatedAdventurerProfile(entry) {
  if (!stream || !entry?.isSimulated) return;
  const card = stream.querySelector('[data-testid="stream-command-card"]');
  if (!card) return;
  card.hidden = false;
  card.innerHTML = '';
  card.dataset.richCardKind = 'simulated-profile';
  card.dataset.simulatedProfileRichCard = 'true';
  card.append(header(card, entry));

  const hero = document.createElement('section');
  hero.className = 'thread-sim-profile-hero';
  hero.append(createSpriteElement(
    weaverSpriteFrame(entry.id, { variant: entry.spriteVariant === 'female' ? 'female' : 'male' }),
    { className: 'thread-sim-profile-avatar', testId: 'simulated-profile-avatar', label: `${entry.name} portrait` },
  ));
  const copy = document.createElement('div');
  copy.className = 'thread-sim-profile-copy';
  const role = document.createElement('span');
  role.textContent = 'Simulated Adventurer';
  const name = document.createElement('strong');
  name.textContent = entry.name;
  name.dataset.testid = 'simulated-profile-name';
  const note = document.createElement('small');
  note.textContent = entry.personality || entry.note || 'Guild Hall adventurer';
  const badges = document.createElement('div');
  badges.className = 'thread-sim-profile-badges';
  const activity = document.createElement('span');
  activity.className = 'thread-sim-profile-badge';
  activity.textContent = entry.activityProfile?.label || friendlyId(entry.activityProfile?.id || 'steady');
  badges.append(activity);
  if (entry.strongRival) {
    const rival = document.createElement('span');
    rival.className = 'thread-sim-profile-badge rival';
    rival.textContent = 'Veteran rival';
    badges.append(rival);
  }
  copy.append(role, name, note, badges);
  hero.append(copy);
  card.append(hero);

  const progress = document.createElement('div');
  progress.className = 'thread-sim-profile-grid';
  const record = entry.duelRecord || { wins: 0, losses: 0, draws: 0 };
  progress.append(
    cell('Level', entry.level, 'simulated-profile-level'),
    cell('XP', entry.experience, 'simulated-profile-xp'),
    cell('Highest Area', entry.highestUnlockedAreaNumber, 'simulated-profile-area'),
    cell('Hunts', entry.history?.huntCount ?? entry.huntCount ?? 0, 'simulated-profile-hunts'),
    cell('Adventures', entry.history?.adventureCount ?? entry.adventureCount ?? 0, 'simulated-profile-adventures'),
    cell('Duel record', `${record.wins}-${record.losses}-${record.draws}`, 'simulated-profile-duels'),
  );
  card.append(progress);

  const stats = document.createElement('section');
  stats.className = 'thread-sim-profile-section';
  const statsTitle = document.createElement('h3');
  statsTitle.textContent = 'Stats';
  const statGrid = document.createElement('div');
  statGrid.className = 'thread-sim-profile-grid';
  statGrid.append(
    cell('Attack', entry.stats?.attack ?? 0, 'simulated-profile-stat-attack'),
    cell('Defense', entry.stats?.defense ?? 0, 'simulated-profile-stat-defense'),
    cell('Max HP', entry.stats?.maxHp ?? 0, 'simulated-profile-stat-max-hp'),
    cell('Speed', entry.stats?.speed ?? 0, 'simulated-profile-stat-speed'),
    cell('Crit Chance', formatCrit(entry.stats), 'simulated-profile-stat-crit'),
  );
  stats.append(statsTitle, statGrid);
  card.append(stats);

  const equipment = document.createElement('section');
  equipment.className = 'thread-sim-profile-section';
  const equipmentTitle = document.createElement('h3');
  equipmentTitle.textContent = 'Equipment';
  equipment.append(equipmentTitle);
  for (const [slot, label] of Object.entries(SLOT_LABELS)) {
    const item = entry.equipment?.[slot] || null;
    const row = document.createElement('div');
    row.className = 'thread-sim-profile-slot';
    row.dataset.testid = `simulated-profile-slot-${slot}`;
    if (item) row.append(createSpriteElement(itemSpriteFrame(item), { className: 'thread-generated-item-sprite', label: item.name }));
    else {
      const empty = document.createElement('span');
      empty.textContent = '◇';
      empty.setAttribute('aria-hidden', 'true');
      row.append(empty);
    }
    const slotCopy = document.createElement('div');
    slotCopy.className = 'thread-sim-profile-slot-copy';
    const slotLabel = document.createElement('span');
    slotLabel.textContent = label;
    const itemName = document.createElement('strong');
    itemName.textContent = item?.name || 'Empty';
    const detail = document.createElement('small');
    detail.textContent = item ? `${friendlyId(item.rarity || 'common')} · Area ${item.areaNumber || 1}` : 'No equipment';
    slotCopy.append(slotLabel, itemName, detail);
    row.append(slotCopy);
    equipment.append(row);
  }
  card.append(equipment);

  const achievements = document.createElement('section');
  achievements.className = 'thread-sim-profile-section';
  const achievementsTitle = document.createElement('h3');
  achievementsTitle.textContent = 'Achievements';
  const achievementsCopy = document.createElement('p');
  const achievementNames = (entry.achievements || []).map(friendlyId).filter(Boolean);
  achievementsCopy.textContent = achievementNames.length ? achievementNames.join(' · ') : 'No achievements recorded yet.';
  achievementsCopy.dataset.testid = 'simulated-profile-achievements';
  achievements.append(achievementsTitle, achievementsCopy);
  card.append(achievements);

  const history = document.createElement('section');
  history.className = 'thread-sim-profile-section';
  history.dataset.testid = 'simulated-profile-history';
  const historyTitle = document.createElement('h3');
  historyTitle.textContent = 'Recent history';
  history.append(historyTitle);
  const recent = Array.isArray(entry.history?.recent) ? entry.history.recent : [];
  if (!recent.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No recent simulated activity or Duels recorded yet.';
    history.append(empty);
  } else {
    const rows = document.createElement('div');
    rows.className = 'thread-sim-profile-history';
    for (const item of recent) {
      const row = document.createElement('div');
      row.className = 'thread-sim-profile-history-row';
      const summary = document.createElement('strong');
      summary.textContent = historyText(item);
      const when = document.createElement('span');
      when.textContent = timestampLabel(item.occurredAt);
      row.append(summary, when);
      rows.append(row);
    }
    history.append(rows);
  }
  card.append(history);
  card.scrollIntoView({ block: 'start', inline: 'nearest' });
}

async function currentSimulatedEntries() {
  const response = await fetch('/api/areas', { headers: { Accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Could not load Guild Hall profiles.');
  const entries = [];
  for (const town of payload.area?.towns || []) {
    for (const entry of town.guildHall?.leaderboard || []) {
      if (entry.isSimulated) entries.push(entry);
    }
  }
  return entries;
}

async function openByQuery(query) {
  try {
    const normalized = String(query || '').trim().toLowerCase();
    const entries = await currentSimulatedEntries();
    const entry = entries.find((candidate) => [candidate.id, candidate.name]
      .some((value) => String(value || '').trim().toLowerCase() === normalized));
    if (!entry) throw new Error(`No current Guild Hall adventurer matches “${query}”. Open leaderboard to inspect available rivals.`);
    renderSimulatedAdventurerProfile(entry);
  } catch (error) {
    const errorEl = stream?.querySelector('[data-testid="stream-error"]');
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  }
}

function installComposerIntercept() {
  if (!stream) return false;
  const form = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  if (!form || !input || form.dataset.simulatedProfileCommandInstalled === 'true') return false;
  form.dataset.simulatedProfileCommandInstalled = 'true';
  form.addEventListener('submit', (event) => {
    const raw = String(input.value || '').trim();
    const match = raw.match(/^\/?profile\s+(.+)$/i);
    if (!match) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    openByQuery(match[1]);
  }, true);
  return true;
}

if (stream && !installComposerIntercept()) {
  const observer = new MutationObserver(() => {
    if (installComposerIntercept()) observer.disconnect();
  });
  observer.observe(stream, { childList: true, subtree: true });
}
