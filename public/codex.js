const statusEl = document.querySelector('#codex-status');
const searchEl = document.querySelector('#codex-search');
const tabsEl = document.querySelector('#codex-tabs');
const countsEl = document.querySelector('#codex-counts');
const listEl = document.querySelector('#codex-list');
const detailEl = document.querySelector('#codex-detail');

const CATEGORIES = [
  ['all', 'All'],
  ['items', 'Items'],
  ['enemies', 'Enemies'],
  ['bosses', 'Bosses'],
  ['lore', 'Lore'],
  ['achievements', 'Achievements'],
  ['history', 'History'],
];

let activeCategory = 'all';
let activeId = null;
let timer = null;
let lastResult = null;

async function api(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function escapeText(value) {
  return String(value ?? '');
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return null;
  const [category, ...idParts] = raw.split('/');
  const id = decodeURIComponent(idParts.join('/'));
  return CATEGORIES.some(([key]) => key === category) && category !== 'all' && id ? { category, id } : null;
}

function setHash(category, id) {
  const next = `#${category}/${encodeURIComponent(id)}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const [key, label] of CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.testid = `codex-tab-${key}`;
    button.setAttribute('aria-pressed', String(activeCategory === key));
    button.addEventListener('click', async () => {
      activeCategory = key;
      activeId = null;
      history.replaceState(null, '', location.pathname);
      renderTabs();
      await load();
    });
    tabsEl.append(button);
  }
}

function renderCounts(counts) {
  countsEl.innerHTML = '';
  for (const [key, label] of CATEGORIES.filter(([key]) => key !== 'all')) {
    const chip = document.createElement('span');
    chip.className = 'count';
    chip.dataset.testid = `codex-count-${key}`;
    chip.textContent = `${label} ${counts[key] ?? 0}`;
    countsEl.append(chip);
  }
}

function renderDetail(entry) {
  if (!entry) {
    detailEl.innerHTML = '<div class="empty">Choose an entry to open its full record.</div>';
    return;
  }
  activeId = entry.id;
  setHash(entry.category, entry.id);
  detailEl.innerHTML = '';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = entry.category;
  detailEl.append(badge);

  const heading = document.createElement('h2');
  heading.dataset.testid = 'codex-detail-title';
  heading.textContent = entry.title;
  detailEl.append(heading);

  const summary = document.createElement('p');
  summary.className = 'muted';
  summary.dataset.testid = 'codex-detail-summary';
  summary.textContent = entry.summary;
  detailEl.append(summary);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const metadata = [];
  if (entry.source) metadata.push(['Source', entry.source]);
  if (entry.revision) metadata.push(['Revision', entry.revision]);
  if (entry.discoveredAt) metadata.push(['Discovered', entry.discoveredAt]);
  if (entry.createdAt) metadata.push(['Recorded', entry.createdAt]);
  if (entry.category === 'achievements') metadata.push(['Status', entry.unlocked ? 'Unlocked' : 'Locked']);
  if (entry.unlockedAt) metadata.push(['Unlocked', entry.unlockedAt]);
  for (const [label, value] of metadata) {
    const cell = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    cell.append(strong, document.createTextNode(escapeText(value)));
    meta.append(cell);
  }
  if (metadata.length) detailEl.append(meta);

  const body = document.createElement('p');
  body.className = 'body';
  body.dataset.testid = 'codex-detail-body';
  body.textContent = entry.body || entry.summary;
  detailEl.append(body);

  if (entry.mechanics && Object.keys(entry.mechanics).length) {
    const mechanicsTitle = document.createElement('h3');
    mechanicsTitle.textContent = 'Mechanics';
    detailEl.append(mechanicsTitle);
    const mechanics = document.createElement('dl');
    mechanics.dataset.testid = 'codex-mechanics';
    for (const [key, value] of Object.entries(entry.mechanics)) {
      const dt = document.createElement('dt');
      dt.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
      const dd = document.createElement('dd');
      dd.textContent = escapeText(value);
      mechanics.append(dt, dd);
    }
    detailEl.append(mechanics);
  }

  if (entry.tags?.length) {
    const tags = document.createElement('p');
    tags.className = 'muted';
    tags.textContent = `Tags: ${entry.tags.join(' · ')}`;
    detailEl.append(tags);
  }

  if (entry.category === 'history' && entry.entityType === 'item' && entry.entityId) {
    const related = document.createElement('button');
    related.type = 'button';
    related.dataset.testid = 'codex-related-item';
    related.textContent = 'Open related item';
    related.addEventListener('click', async () => {
      activeCategory = 'items';
      searchEl.value = '';
      activeId = entry.entityId;
      renderTabs();
      await load();
    });
    detailEl.append(related);
  }
}

function renderList(entries) {
  listEl.innerHTML = '';
  if (!entries.length) {
    listEl.innerHTML = '<div class="empty" data-testid="codex-empty">No records match this search.</div>';
    renderDetail(null);
    return;
  }

  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry';
    button.dataset.testid = 'codex-entry';
    button.dataset.category = entry.category;
    button.dataset.entryId = entry.id;
    button.setAttribute('aria-selected', String(entry.id === activeId));

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = entry.category;
    const heading = document.createElement('h3');
    heading.textContent = entry.title;
    const summary = document.createElement('p');
    summary.textContent = entry.summary;
    button.append(badge, heading, summary);
    button.addEventListener('click', () => {
      for (const other of listEl.querySelectorAll('.entry')) other.setAttribute('aria-selected', 'false');
      button.setAttribute('aria-selected', 'true');
      renderDetail(entry);
    });
    listEl.append(button);
  }

  const selected = entries.find((entry) => entry.id === activeId) || entries[0];
  renderDetail(selected);
}

async function load() {
  statusEl.textContent = 'Loading…';
  try {
    const params = new URLSearchParams({ category: activeCategory });
    const query = searchEl.value.trim();
    if (query) params.set('q', query);
    lastResult = await api(`/api/codex?${params}`);
    renderCounts(lastResult.counts);
    renderList(lastResult.entries);
    statusEl.textContent = `${lastResult.total} record${lastResult.total === 1 ? '' : 's'}`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

searchEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    activeId = null;
    load();
  }, 180);
});

const deepLink = parseHash();
if (deepLink) {
  activeCategory = deepLink.category;
  activeId = deepLink.id;
}
renderTabs();
load();
