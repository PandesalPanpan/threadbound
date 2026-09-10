const minimalUi = document.createElement('link');
minimalUi.rel = 'stylesheet';
minimalUi.href = '/minimal-ui.css';
document.head.append(minimalUi);

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
let loadRevision = 0;
let lastResult = null;
let directoryEntries = [];

async function api(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function escapeText(value) {
  return String(value ?? '');
}

function titleize(value) {
  return String(value || '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Unknown';
}

function categoryLabel(category) {
  return CATEGORIES.find(([key]) => key === category)?.[1] || titleize(category);
}

function entryIcon(entry) {
  if (entry.category === 'items') return '↗';
  if (entry.category === 'enemies') return '◎';
  if (entry.category === 'bosses') return '♛';
  if (entry.category === 'lore') return '✦';
  if (entry.category === 'achievements') return '★';
  if (entry.category === 'history') return '⌛';
  return '◇';
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

function mergeDirectory(entries = []) {
  const byKey = new Map(directoryEntries.map((entry) => [`${entry.category}:${entry.id}`, entry]));
  for (const entry of entries) byKey.set(`${entry.category}:${entry.id}`, entry);
  directoryEntries = [...byKey.values()];
}

function wikiLink(label, onClick, { testId = null, title = '' } = {}) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'wiki-link';
  link.textContent = label;
  if (testId) link.dataset.testid = testId;
  if (title) link.title = title;
  link.addEventListener('click', () => Promise.resolve(onClick()).catch((error) => {
    statusEl.textContent = error.message;
  }));
  return link;
}

async function openEntry(entry) {
  if (!entry) return;
  clearTimeout(timer);
  timer = null;
  activeCategory = entry.category;
  activeId = entry.id;
  searchEl.value = '';
  setHash(entry.category, entry.id);
  renderTabs();
  await load();
  detailEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function openCategory(category) {
  clearTimeout(timer);
  timer = null;
  activeCategory = category;
  activeId = null;
  searchEl.value = '';
  history.replaceState(null, '', location.pathname);
  renderTabs();
  return load();
}

function appendLinkedText(container, text, currentEntry) {
  const source = escapeText(text);
  if (!source) return;
  const currentKey = currentEntry ? `${currentEntry.category}:${currentEntry.id}` : '';
  const candidates = directoryEntries
    .filter((entry) => `${entry.category}:${entry.id}` !== currentKey && entry.title && entry.title.length >= 3)
    .map((entry) => ({ entry, title: String(entry.title), lower: String(entry.title).toLowerCase() }))
    .sort((a, b) => b.title.length - a.title.length);

  const lowerSource = source.toLowerCase();
  const linked = new Set();
  let cursor = 0;
  while (cursor < source.length) {
    let next = null;
    for (const candidate of candidates) {
      if (linked.has(`${candidate.entry.category}:${candidate.entry.id}`)) continue;
      const index = lowerSource.indexOf(candidate.lower, cursor);
      if (index < 0) continue;
      if (!next || index < next.index || (index === next.index && candidate.title.length > next.candidate.title.length)) {
        next = { index, candidate };
      }
    }
    if (!next) {
      container.append(document.createTextNode(source.slice(cursor)));
      break;
    }
    if (next.index > cursor) container.append(document.createTextNode(source.slice(cursor, next.index)));
    const exact = source.slice(next.index, next.index + next.candidate.title.length);
    container.append(wikiLink(exact, () => openEntry(next.candidate.entry), { title: `Open ${next.candidate.title}` }));
    linked.add(`${next.candidate.entry.category}:${next.candidate.entry.id}`);
    cursor = next.index + next.candidate.title.length;
  }
}

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const [key, label] of CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.testid = `codex-tab-${key}`;
    button.setAttribute('aria-pressed', String(activeCategory === key));
    button.addEventListener('click', () => openCategory(key));
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

function metadataRows(entry) {
  const rows = [];
  rows.push(['Type', categoryLabel(entry.category).replace(/s$/, '')]);
  if (entry.source) rows.push(['Source', entry.source]);
  if (entry.revision) rows.push(['Revision', entry.revision]);
  if (entry.discoveredAt) rows.push(['Discovered', entry.discoveredAt]);
  if (entry.createdAt) rows.push(['Recorded', entry.createdAt]);
  if (entry.category === 'achievements') rows.push(['Status', entry.unlocked ? 'Unlocked' : 'Locked']);
  if (entry.unlockedAt) rows.push(['Unlocked', entry.unlockedAt]);
  return rows;
}

function relatedEntries(entry) {
  const tags = new Set((entry.tags || []).map((tag) => String(tag).toLowerCase()));
  const body = `${entry.summary || ''} ${entry.body || ''}`.toLowerCase();
  return directoryEntries
    .filter((candidate) => !(candidate.id === entry.id && candidate.category === entry.category))
    .map((candidate) => {
      let score = 0;
      if (candidate.source && entry.source && candidate.source === entry.source) score += 2;
      for (const tag of candidate.tags || []) if (tags.has(String(tag).toLowerCase())) score += 2;
      if (candidate.title && body.includes(String(candidate.title).toLowerCase())) score += 4;
      if (candidate.category === entry.category) score += 1;
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(a.candidate.title).localeCompare(String(b.candidate.title)))
    .slice(0, 8)
    .map(({ candidate }) => candidate);
}

function renderInfobox(entry) {
  const box = document.createElement('section');
  box.className = 'wiki-infobox';
  const title = document.createElement('div');
  title.className = 'wiki-infobox-title';
  const name = document.createElement('strong');
  name.textContent = String(entry.title || 'Entry').toUpperCase();
  const category = document.createElement('span');
  category.textContent = categoryLabel(entry.category).toUpperCase();
  title.append(name, category);
  box.append(title);

  for (const [label, value] of metadataRows(entry)) {
    const cell = document.createElement('div');
    cell.className = 'wiki-infobox-cell';
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('span');
    val.textContent = escapeText(value);
    cell.append(key, val);
    box.append(cell);
  }
  return box;
}

function renderContents(sections) {
  const contents = document.createElement('section');
  contents.className = 'wiki-contents';
  const heading = document.createElement('strong');
  heading.textContent = 'Contents';
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Article contents');
  sections.forEach(([id, label], index) => {
    const anchor = document.createElement('a');
    anchor.href = `#${id}`;
    anchor.textContent = `${index + 1}. ${label}`;
    nav.append(anchor);
  });
  contents.append(heading, nav);
  return contents;
}

function renderDetail(entry) {
  if (!entry) {
    detailEl.innerHTML = '<div class="empty">Choose an entry to open its full record.</div>';
    return;
  }
  activeId = entry.id;
  setHash(entry.category, entry.id);
  detailEl.innerHTML = '';

  const breadcrumbs = document.createElement('nav');
  breadcrumbs.className = 'wiki-breadcrumbs';
  breadcrumbs.setAttribute('aria-label', 'Breadcrumb');
  breadcrumbs.append(wikiLink('Codex', () => openCategory('all')), document.createTextNode(' › '), wikiLink(categoryLabel(entry.category), () => openCategory(entry.category)), document.createTextNode(` › ${entry.title}`));
  detailEl.append(breadcrumbs);

  const titleRow = document.createElement('header');
  titleRow.className = 'wiki-title-row';
  const icon = document.createElement('div');
  icon.className = 'wiki-entry-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = entryIcon(entry);
  const copy = document.createElement('div');
  const heading = document.createElement('h2');
  heading.dataset.testid = 'codex-detail-title';
  heading.textContent = entry.title;
  const subtitle = document.createElement('div');
  subtitle.className = 'wiki-subtitle';
  subtitle.textContent = `${categoryLabel(entry.category).replace(/s$/, '')}${entry.tags?.length ? ` · ${entry.tags.slice(0, 2).join(' · ')}` : ''}`;
  copy.append(heading, subtitle);
  titleRow.append(icon, copy);
  detailEl.append(titleRow);

  const summary = document.createElement('p');
  summary.className = 'wiki-lead';
  summary.dataset.testid = 'codex-detail-summary';
  appendLinkedText(summary, entry.summary, entry);
  detailEl.append(summary, renderInfobox(entry));

  const sections = [['codex-overview', 'Overview']];
  if (entry.mechanics && Object.keys(entry.mechanics).length) sections.push(['codex-mechanics-section', 'Mechanics']);
  sections.push(['codex-related', 'Related pages'], ['codex-history', 'History']);
  detailEl.append(renderContents(sections));

  const overview = document.createElement('section');
  overview.className = 'wiki-section';
  overview.id = 'codex-overview';
  const overviewTitle = document.createElement('h3');
  overviewTitle.textContent = 'Overview';
  const body = document.createElement('p');
  body.dataset.testid = 'codex-detail-body';
  appendLinkedText(body, entry.body || entry.summary, entry);
  overview.append(overviewTitle, body);
  detailEl.append(overview);

  if (entry.mechanics && Object.keys(entry.mechanics).length) {
    const mechanicsSection = document.createElement('section');
    mechanicsSection.className = 'wiki-section';
    mechanicsSection.id = 'codex-mechanics-section';
    const mechanicsTitle = document.createElement('h3');
    mechanicsTitle.textContent = 'Mechanics';
    const mechanics = document.createElement('dl');
    mechanics.className = 'wiki-mechanics';
    mechanics.dataset.testid = 'codex-mechanics';
    for (const [key, value] of Object.entries(entry.mechanics)) {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
      const dd = document.createElement('dd');
      dd.textContent = escapeText(value);
      row.append(dt, dd);
      mechanics.append(row);
    }
    mechanicsSection.append(mechanicsTitle, mechanics);
    detailEl.append(mechanicsSection);
  }

  const relatedSection = document.createElement('section');
  relatedSection.className = 'wiki-section';
  relatedSection.id = 'codex-related';
  const relatedTitle = document.createElement('h3');
  relatedTitle.textContent = 'Related pages';
  const related = document.createElement('div');
  related.className = 'wiki-related';
  const relations = relatedEntries(entry);
  if (relations.length) {
    for (const candidate of relations) related.append(wikiLink(candidate.title, () => openEntry(candidate)));
  } else {
    related.append(wikiLink(`Browse ${categoryLabel(entry.category)}`, () => openCategory(entry.category)));
  }
  relatedSection.append(relatedTitle, related);
  detailEl.append(relatedSection);

  const historySection = document.createElement('section');
  historySection.className = 'wiki-section';
  historySection.id = 'codex-history';
  const historyTitle = document.createElement('h3');
  historyTitle.textContent = 'History';
  const historyCopy = document.createElement('p');
  historyCopy.className = 'wiki-history';
  const historyBits = [];
  if (entry.revision) historyBits.push(`Revision ${entry.revision}`);
  if (entry.source) historyBits.push(`Source: ${entry.source}`);
  if (entry.discoveredAt) historyBits.push(`Discovered ${entry.discoveredAt}`);
  if (entry.createdAt) historyBits.push(`Recorded ${entry.createdAt}`);
  historyCopy.textContent = historyBits.join(' · ') || 'This record is part of the living Threadbound Codex.';
  historySection.append(historyTitle, historyCopy);

  if (entry.tags?.length) {
    const tags = document.createElement('div');
    tags.className = 'wiki-related';
    tags.append(document.createTextNode('Tags: '));
    for (const tag of entry.tags) {
      tags.append(wikiLink(tag, async () => {
        activeCategory = 'all';
        activeId = null;
        searchEl.value = tag;
        history.replaceState(null, '', location.pathname);
        renderTabs();
        await load();
      }));
    }
    historySection.append(tags);
  }

  if (entry.category === 'history' && entry.entityType === 'item' && entry.entityId) {
    const target = directoryEntries.find((candidate) => candidate.category === 'items' && candidate.id === entry.entityId);
    const relatedItem = wikiLink('Open related item', async () => {
      if (target) await openEntry(target);
      else {
        activeCategory = 'items';
        searchEl.value = '';
        activeId = entry.entityId;
        renderTabs();
        await load();
      }
    }, { testId: 'codex-related-item' });
    historySection.append(relatedItem);
  }
  detailEl.append(historySection);
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
  const revision = ++loadRevision;
  statusEl.textContent = 'Loading…';
  try {
    const params = new URLSearchParams({ category: activeCategory });
    const query = searchEl.value.trim();
    if (query) params.set('q', query);
    const result = await api(`/api/codex?${params}`);
    if (revision !== loadRevision) return;
    lastResult = result;
    mergeDirectory(result.entries || []);
    renderCounts(lastResult.counts);
    renderList(lastResult.entries);
    statusEl.textContent = `${lastResult.total} record${lastResult.total === 1 ? '' : 's'} · living wiki`;
  } catch (error) {
    if (revision === loadRevision) statusEl.textContent = error.message;
  }
}

async function loadDirectory() {
  try {
    const result = await api('/api/codex?category=all');
    mergeDirectory(result.entries || []);
  } catch {
    // The normal category load remains useful even if this optional cross-link index fails.
  }
}

searchEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
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
loadDirectory().finally(() => load());
