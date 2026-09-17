const DESKTOP_COMMANDS = Object.freeze([
  Object.freeze({ id: 'town', label: 'Town', command: 'town', icon: '⌂' }),
  Object.freeze({ id: 'hunt', label: 'Hunt', command: 'hunt', icon: '⚔' }),
  Object.freeze({ id: 'dungeon', label: 'Dungeon', command: 'dungeon', icon: '◇' }),
  Object.freeze({ id: 'inventory', label: 'Inventory', command: 'inventory', icon: '▣' }),
  Object.freeze({ id: 'quest', label: 'Quest', command: 'quest', icon: '!' }),
  Object.freeze({ id: 'guild-hall', label: 'Guild Hall', command: 'leaderboard', icon: '♜' }),
  Object.freeze({ id: 'bank', label: 'Bank', command: 'bank', icon: '◈' }),
]);

let contextSnapshot = null;
let contextFetchedAt = 0;
let contextRequest = null;

function textElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function fetchJson(path) {
  return fetch(path, { headers: { Accept: 'application/json' } }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  });
}

function submitStreamCommand(command) {
  const stream = document.querySelector('#stream');
  const input = stream?.querySelector('[data-testid="stream-message"]');
  const form = stream?.querySelector('[data-testid="stream-composer"]');
  if (!input || !form) return;
  input.value = command;
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function makeRailButton(command) {
  const button = textElement('button', 'desktop-rail-command');
  button.type = 'button';
  button.dataset.testid = `desktop-command-${command.id}`;
  button.dataset.command = command.command;
  button.setAttribute('aria-label', `${command.label} in the Adventure Stream`);
  const icon = textElement('span', 'desktop-rail-command-icon', command.icon);
  icon.setAttribute('aria-hidden', 'true');
  const label = textElement('span', 'desktop-rail-command-label', command.label);
  button.append(icon, label);
  button.addEventListener('click', () => submitStreamCommand(command.command));
  return button;
}

function createCommandRail() {
  const rail = textElement('aside', 'desktop-command-rail');
  rail.dataset.testid = 'desktop-command-rail';
  rail.setAttribute('aria-label', 'Quick commands');
  const inner = textElement('div', 'desktop-rail-inner');
  const heading = textElement('div', 'desktop-rail-kicker', 'QUICK COMMANDS');
  const commands = textElement('nav', 'desktop-rail-commands');
  commands.setAttribute('aria-label', 'Adventure Stream commands');
  for (const command of DESKTOP_COMMANDS) commands.append(makeRailButton(command));

  const divider = textElement('div', 'desktop-rail-divider');
  divider.setAttribute('aria-hidden', 'true');
  const partyHeading = textElement('div', 'desktop-rail-section-label', 'PARTY');
  const party = textElement('section', 'desktop-party-card');
  party.dataset.testid = 'desktop-party-card';
  party.setAttribute('aria-label', 'Party snapshot');
  const note = textElement('p', 'desktop-rail-note', 'Desktop shortcuts still post visible actions into the Adventure Stream.');
  note.dataset.testid = 'desktop-command-note';
  inner.append(heading, commands, divider, partyHeading, party, note);
  rail.append(inner);
  return rail;
}

function createContextRail() {
  const rail = textElement('aside', 'desktop-live-context');
  rail.dataset.testid = 'desktop-live-context';
  rail.setAttribute('aria-label', 'Read-only live context');
  const inner = textElement('div', 'desktop-context-inner');
  inner.append(textElement('div', 'desktop-rail-kicker', 'LIVE CONTEXT'));
  const cards = textElement('div', 'desktop-context-cards');
  cards.dataset.testid = 'desktop-context-cards';
  inner.append(cards);
  rail.append(inner);
  return rail;
}

function createHeaderContext() {
  const context = textElement('div', 'desktop-header-context');
  context.dataset.testid = 'desktop-header-context';
  const copy = textElement('span', 'desktop-header-context-copy', 'Threadspire · Adventure Stream');
  const live = textElement('span', 'desktop-header-live', 'LIVE');
  live.dataset.testid = 'desktop-header-live';
  const dot = textElement('span', 'desktop-header-live-dot');
  dot.setAttribute('aria-hidden', 'true');
  live.prepend(dot);
  const player = textElement('span', 'desktop-header-player');
  player.dataset.testid = 'desktop-header-player';
  context.append(copy, live, player);
  return context;
}

function installHeaderContext() {
  const nav = document.querySelector('.threadbound-topnav');
  if (!nav) return null;
  const existing = nav.querySelector('[data-testid="desktop-header-context"]');
  if (existing) return existing;
  const context = createHeaderContext();
  nav.append(context);
  return context;
}

export function installDesktopPlayerShell() {
  const page = document.querySelector('.threadbound-game-page');
  const stream = document.querySelector('#stream');
  if (!page || !stream) return null;
  const existing = page.querySelector('[data-testid="desktop-player-shell"]');
  if (existing) return existing;

  const identity = page.querySelector('#identity');
  const shell = textElement('div', 'desktop-player-shell');
  shell.dataset.testid = 'desktop-player-shell';
  const center = textElement('section', 'desktop-player-center');
  center.dataset.testid = 'desktop-player-center';
  center.setAttribute('aria-label', 'Adventure Stream');
  const commandRail = createCommandRail();
  const contextRail = createContextRail();
  center.append(stream);
  shell.append(commandRail, center, contextRail);
  page.insertBefore(shell, identity?.nextSibling || page.firstChild);
  installHeaderContext();
  return shell;
}

function levelBandText(area) {
  const band = area?.recommendedLevel;
  if (!band || !Number.isFinite(Number(band.min)) || !Number.isFinite(Number(band.max))) return '';
  return `Recommended Lv. ${band.min}–${band.max}`;
}

function renderParty(data) {
  const party = document.querySelector('[data-testid="desktop-party-card"]');
  if (!party) return;
  party.replaceChildren();
  const members = Array.isArray(data?.party?.members) && data.party.members.length > 0
    ? data.party.members
    : [{
      playerId: data?.character?.id,
      displayName: data?.character?.displayName || 'You',
      currentHealth: data?.character?.currentHealth,
      maxHealth: data?.character?.maxHealth,
    }];
  const title = textElement('strong', 'desktop-party-title', data?.party ? 'Current Party' : 'Solo Weaver');
  const online = textElement('span', 'desktop-party-online', `${members.length} / 2 online`);
  const header = textElement('div', 'desktop-party-header');
  header.append(title, online);
  party.append(header);
  const roster = textElement('div', 'desktop-party-roster');
  for (const member of members.slice(0, 4)) {
    const row = textElement('div', 'desktop-party-member');
    const name = textElement('span', '', member.displayName || member.playerId || 'Weaver');
    const health = member.currentHealth != null && member.maxHealth != null
      ? `${member.currentHealth}/${member.maxHealth} HP`
      : member.playerId === data?.character?.id
        ? `${data.character.currentHealth}/${data.character.maxHealth} HP`
        : 'Online';
    row.append(name, textElement('small', '', health));
    roster.append(row);
  }
  party.append(roster);
}

function createContextCard({ testId, kicker, title, subtitle = '', tone = '' } = {}) {
  const card = textElement('article', `desktop-context-card${tone ? ` desktop-context-card-${tone}` : ''}`);
  card.dataset.testid = testId;
  const header = textElement('header', 'desktop-context-card-header');
  const copy = textElement('div', 'desktop-context-card-copy');
  copy.append(textElement('span', 'desktop-context-kicker', kicker), textElement('strong', 'desktop-context-title', title));
  if (subtitle) copy.append(textElement('small', 'desktop-context-subtitle', subtitle));
  const icon = textElement('span', 'desktop-context-card-icon', tone === 'quest' ? '!' : tone === 'guild' ? '♜' : '⌖');
  icon.setAttribute('aria-hidden', 'true');
  header.append(copy, icon);
  card.append(header);
  return card;
}

function appendContextFact(card, label, value, testId = null) {
  const fact = textElement('div', 'desktop-context-fact');
  fact.append(textElement('span', '', label));
  const valueElement = textElement('strong', '', value);
  if (testId) valueElement.dataset.testid = testId;
  fact.append(valueElement);
  card.append(fact);
}

function activeQuest(quests = []) {
  return quests.find((quest) => ['active', 'claimable'].includes(quest.state)) || quests[0] || null;
}

function renderCurrentArea(cards, area, data) {
  const current = area?.currentArea || null;
  const areaName = current?.name || (area?.currentAreaNumber ? `Area ${area.currentAreaNumber}` : 'Current Area');
  const unlocked = Number(area?.highestUnlockedAreaNumber || current?.number || 0);
  const card = createContextCard({
    testId: 'desktop-current-area-card',
    kicker: 'CURRENT AREA',
    title: areaName,
    subtitle: levelBandText(current) || `${unlocked || 1} Area${unlocked === 1 ? '' : 's'} unlocked`,
    tone: 'area',
  });
  const activeRun = data?.activeRun;
  const dungeon = data?.dungeons?.find((entry) => entry.id === activeRun?.dungeonId);
  appendContextFact(card, 'Progression', `${area?.currentAreaNumber || current?.number || 1} / ${unlocked || current?.number || 1}`, 'desktop-area-progress');
  appendContextFact(card, 'Adventure', activeRun ? `${dungeon?.name || activeRun.dungeonId || 'Dungeon'} · ${activeRun.phase}` : 'No active run', 'desktop-area-adventure');
  cards.append(card);
}

function renderActiveQuest(cards, quests) {
  const quest = activeQuest(quests);
  if (!quest) {
    const card = createContextCard({ testId: 'desktop-active-quest-card', kicker: 'ACTIVE QUEST', title: 'No active Quest', subtitle: 'Open Quest in the stream to browse work.', tone: 'quest' });
    cards.append(card);
    return;
  }
  const card = createContextCard({ testId: 'desktop-active-quest-card', kicker: 'ACTIVE QUEST', title: quest.title, subtitle: quest.state.toUpperCase(), tone: 'quest' });
  const objective = quest.objectives?.[0];
  const progress = quest.progress?.objectiveProgress?.find((row) => row.objectiveId === objective?.id);
  const current = Number(progress?.current || 0);
  const target = Number(progress?.target || objective?.count || 0);
  const objectiveLabel = objective?.label || 'Objective progress';
  appendContextFact(card, objectiveLabel, target ? `${current}/${target}` : quest.state, 'desktop-quest-progress');
  cards.append(card);
}

function renderGuildSnapshot(cards, area) {
  const town = area?.towns?.find((entry) => entry.guildHall?.leaderboard) || null;
  const guildHall = town?.guildHall || null;
  const entries = Array.isArray(guildHall?.leaderboard) ? guildHall.leaderboard : [];
  const card = createContextCard({
    testId: 'desktop-guild-snapshot-card',
    kicker: 'GUILD SNAPSHOT',
    title: guildHall?.name || 'Guild Hall',
    subtitle: entries.length ? `${entries.length} ranked adventurer${entries.length === 1 ? '' : 's'}` : 'No ranked adventurers',
    tone: 'guild',
  });
  const roster = textElement('div', 'desktop-guild-roster');
  for (const entry of entries.slice(0, 3)) {
    const row = textElement('div', 'desktop-guild-row');
    const rank = textElement('span', 'desktop-guild-rank', `#${entry.placement || '?'}`);
    const name = textElement('strong', '', entry.name || 'Adventurer');
    const level = textElement('small', '', `Lv ${entry.level || 1}`);
    row.append(rank, name, level);
    roster.append(row);
  }
  if (!entries.length) roster.append(textElement('p', 'desktop-context-empty', 'Guild standings are unavailable in this Area.'));
  card.append(roster);
  const open = textElement('button', 'desktop-context-action', 'Open in stream');
  open.type = 'button';
  open.dataset.testid = 'desktop-open-guild';
  open.addEventListener('click', () => submitStreamCommand('leaderboard'));
  card.append(open);
  cards.append(card);
}

function renderContext(data, context) {
  const cards = document.querySelector('[data-testid="desktop-context-cards"]');
  if (!cards) return;
  cards.replaceChildren();
  renderCurrentArea(cards, context?.area, data);
  renderActiveQuest(cards, context?.quests || []);
  const note = textElement('p', 'desktop-context-note', 'Read-only context. Actions happen in the shared Adventure Stream.');
  note.dataset.testid = 'desktop-context-note';
  cards.append(note);
  renderGuildSnapshot(cards, context?.area);
}

function renderHeader(data) {
  const context = document.querySelector('[data-testid="desktop-header-context"]');
  if (!context) return;
  const player = context.querySelector('[data-testid="desktop-header-player"]');
  if (!player) return;
  const name = data?.character?.displayName || data?.threadedUser?.name || 'Weaver';
  const hp = `${data?.character?.currentHealth ?? 0} / ${data?.character?.maxHealth ?? 0} HP`;
  player.textContent = `${name} · ${hp}`;
}

async function loadContext() {
  const now = Date.now();
  if (contextSnapshot && now - contextFetchedAt < 8000) return contextSnapshot;
  if (contextRequest) return contextRequest;
  contextRequest = Promise.all([fetchJson('/api/areas'), fetchJson('/api/quests')])
    .then(([areaPayload, questPayload]) => {
      contextSnapshot = { area: areaPayload.area || null, quests: questPayload.quests || [] };
      contextFetchedAt = Date.now();
      return contextSnapshot;
    })
    .finally(() => { contextRequest = null; });
  return contextRequest;
}

export async function updateDesktopPlayerShell(data) {
  const shell = installDesktopPlayerShell();
  if (!shell) return;
  renderParty(data);
  renderHeader(data);
  let context = contextSnapshot;
  try { context = await loadContext(); }
  catch (error) {
    context = { area: null, quests: [] };
    const cards = document.querySelector('[data-testid="desktop-context-cards"]');
    if (cards) {
      cards.replaceChildren(textElement('p', 'desktop-context-error', error.message || 'Live context unavailable.'));
    }
  }
  renderContext(data, context);
}
