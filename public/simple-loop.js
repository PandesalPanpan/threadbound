import { createSpriteElement, enemySpriteFrame, weaverSpriteFrame } from './sprite-catalog.js';

const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  // Module scripts can finish loading in a different order, especially on cached local
  // reloads. Mount only after adventure-stream.js has created its stable DOM boundary.
  if (!stream.querySelector('[data-testid="stream-composer"]')) {
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!stream.querySelector('[data-testid="stream-composer"]')) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(stream, { childList: true, subtree: true });
    });
  }

  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const composer = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const commandCard = stream.querySelector('[data-testid="stream-command-card"]');
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const errorEl = stream.querySelector('[data-testid="stream-error"]');

  // Keep the Figma-simple action surface separate from the legacy suggestion renderer.
  // adventure-stream.js remains available for persisted tactical runs, but cannot redraw
  // or erase this player-facing bar during realtime/party updates.
  const actionBar = document.createElement('div');
  actionBar.className = 'simple-loop-actions';
  actionBar.dataset.testid = 'simple-loop-actions';
  actionBar.setAttribute('aria-label', 'Current actions');
  actionBar.hidden = true;
  if (composer) composer.before(actionBar);
  else stream.append(actionBar);

  const style = document.createElement('style');
  style.textContent = `
    /* The default Figma-inspired loop is a chat, not a compressed dashboard. */
    body.threadbound-player.simple-gameplay-loop[data-game-view="play"] #character,
    body.threadbound-player.simple-gameplay-loop[data-game-view="play"] #dungeon,
    body.threadbound-player.simple-gameplay-loop #stream .stream-combat-dock,
    body.threadbound-player.simple-gameplay-loop #stream .stream-heading,
    body.threadbound-player.simple-gameplay-loop #stream > .stream-suggestions {
      display:none !important;
    }
    body.threadbound-player.simple-gameplay-loop #stream {
      padding-top:0 !important;
    }
    body.threadbound-player.simple-gameplay-loop #stream .adventure-stream-log {
      height:min(70vh,720px) !important;
      min-height:430px !important;
      padding-top:8px !important;
    }
    body.threadbound-player #stream .stream-entry-system p { white-space:pre-line; }

    /* Discord/Figma-like bot identity. The APP badge is presentation only. */
    body.threadbound-player #stream .stream-app-badge,
    body.threadbound-player #stream .threadbound-app-kicker::after {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:14px;
      margin-left:5px;
      padding:1px 4px;
      border-radius:4px;
      background:#5b45b7;
      color:#fff;
      font-size:.47rem;
      font-weight:800;
      line-height:1;
      letter-spacing:.03em;
      vertical-align:middle;
    }
    body.threadbound-player #stream .threadbound-app-kicker::after { content:'APP'; }

    /* Command responses are ordinary Threadbound responses, never a private-view concept. */
    body.threadbound-player #stream .thread-reply-header .threadbound-app-kicker {
      display:inline-flex !important;
      align-items:center;
      color:#9b7bff !important;
      font-size:.61rem !important;
      font-weight:760;
      letter-spacing:.02em !important;
    }

    /* Only the decision needed right now stays beside the composer. */
    body.threadbound-player #stream .simple-loop-actions {
      display:none;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:7px;
      padding:7px 0 5px;
      border-top:1px solid #292c34;
    }
    body.threadbound-player.simple-gameplay-loop #stream .simple-loop-actions:not([hidden]) {
      display:grid !important;
    }
    body.threadbound-player #stream .simple-loop-actions:has(.simple-loop-action[data-kind="attack"]) {
      grid-template-columns:1fr;
    }
    body.threadbound-player #stream .simple-loop-action {
      display:inline-flex !important;
      align-items:center !important;
      justify-content:center !important;
      min-width:0 !important;
      min-height:44px !important;
      padding:7px 10px !important;
      border:1px solid #292c34 !important;
      border-radius:9px !important;
      background:#15171d !important;
      color:#d6d7dc !important;
      box-shadow:none !important;
      font-size:.68rem !important;
      font-weight:650 !important;
      white-space:nowrap !important;
    }
    body.threadbound-player #stream .simple-loop-action[data-kind="hunt"] { color:#a98eff !important; }
    body.threadbound-player #stream .simple-loop-action[data-kind="attack"] { color:#ff7080 !important; }
    body.threadbound-player #stream .simple-loop-action[data-kind="dungeon"] { color:#f0b541 !important; }
    body.threadbound-player #stream .simple-loop-action[data-kind="heal"] { color:#73dfa7 !important; }
    body.threadbound-player #stream .simple-loop-action[data-kind="inventory"] { color:#55d6ff !important; }
    body.threadbound-player #stream .simple-loop-action[data-kind="shop"] { color:#e6b86a !important; }
    body.threadbound-player #stream .simple-loop-action:disabled { opacity:.55 !important; }
    body.threadbound-player #stream .simple-loop-help {
      margin:4px 0 0;
      padding:7px 0;
      border-top:1px solid #292c34;
      color:#b8bac3;
      font-size:.67rem;
      line-height:1.45;
    }
    @media (max-width:720px) {
      body.threadbound-player.simple-gameplay-loop #stream .adventure-stream-log {
        height:calc(100dvh - 226px) !important;
        min-height:430px !important;
      }
    }
    @media (max-width:390px) {
      body.threadbound-player #stream .simple-loop-action { font-size:.63rem !important; padding-inline:7px !important; }
    }
  `;
  document.head.append(style);

  let dashboard = null;
  let syncing = false;
  let resyncRequested = false;
  const BARE_COMMANDS = new Set(['hunt', 'dungeon', 'run', 'attack', 'help', 'heal', 'potion', 'rest', 'recovery', 'shop', 'buy potion', 'guard', 'interrupt', 'mend', 'revive', 'upgrade', 'skill']);

  function normalizedCommand(value) {
    const trimmed = String(value || '').trim();
    if (trimmed.startsWith('/')) return trimmed;
    return BARE_COMMANDS.has(trimmed.toLowerCase()) ? `/${trimmed}` : null;
  }
  let scheduled = null;
  let acting = false;
  let lastSignature = '';
  let recoveryFetchedAt = Date.now();
  let hasRenderedInitialDungeonSurface = false;
  let previousSimpleRunId = null;

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

  function showError(message = '') {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function legacyTestId(button) {
    const testId = button.dataset.testid;
    if (!testId || button.classList.contains('simple-loop-action')) return;
    if (['stream-start-dungeon', 'stream-attack', 'stream-guard', 'stream-interrupt'].includes(testId)) {
      button.dataset.testid = `${testId}-legacy`;
    }
  }

  function normalizeLegacyControls() {
    if (!suggestions) return;
    for (const button of suggestions.querySelectorAll('button:not(.simple-loop-action)')) legacyTestId(button);
  }

  function decorateFigmaSurface() {
    if (log) {
      for (const meta of log.querySelectorAll('.stream-entry-system .stream-entry-meta')) {
        if (meta.closest('[data-message-role="npc"]')) {
          meta.querySelector('.stream-app-badge')?.remove();
          continue;
        }
        if (meta.querySelector('.stream-app-badge')) continue;
        const author = meta.querySelector('strong');
        if (!author) continue;
        const badge = document.createElement('span');
        badge.className = 'stream-app-badge';
        badge.textContent = 'APP';
        author.after(badge);
      }
    }

    if (commandCard && commandCard.dataset.simpleDungeonSurface !== 'true') {
      const kicker = commandCard.querySelector('.thread-reply-header span');
      if (kicker) {
        if (kicker.textContent !== 'THREADBOUND') kicker.textContent = 'THREADBOUND';
        kicker.classList.add('threadbound-app-kicker');
      }
      const close = commandCard.querySelector('.thread-reply-close');
      if (close) close.setAttribute('aria-label', 'Dismiss Threadbound response');
    }
  }

  function addButton(label, kind, onClick, testId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'simple-loop-action';
    button.dataset.kind = kind;
    button.dataset.testid = testId;
    button.textContent = label;
    // Concurrency is guarded by `acting` in the handler. Fresh controls must never
    // inherit a disabled state from the action that triggered their rerender.
    button.disabled = false;
    button.addEventListener('click', async () => {
      if (acting) return;
      acting = true;
      showError('');
      button.disabled = true;
      try {
        await onClick();
        await sync({ force: true });
      } catch (error) {
        showError(error.message);
      } finally {
        acting = false;
        button.disabled = false;
      }
    });
    actionBar.append(button);
    return button;
  }

  function firstDungeon() {
    const dungeon = dashboard?.dungeons?.[0];
    const readiness = dashboard?.simpleLoop?.dungeonReadiness?.find((entry) => entry.dungeonId === dungeon?.id);
    return { dungeon, readiness };
  }

  async function hunt() {
    await api('/api/hunt', { method: 'POST' });
  }

  async function startDungeon() {
    const { dungeon } = firstDungeon();
    if (!dungeon) throw new Error('No dungeon is available.');
    await api(`/api/dungeons/${encodeURIComponent(dungeon.id)}/start-simple`, { method: 'POST' });
  }

  async function setPartyReady(ready) {
    await api('/api/party/ready', { method: 'POST', body: JSON.stringify({ ready }) });
  }

  async function leaveParty() {
    await api('/api/party/leave', { method: 'POST' });
  }

  async function attack() {
    const run = dashboard?.activeRun;
    if (!run) throw new Error('No active dungeon.');
    await api(`/api/runs/${encodeURIComponent(run.id)}/attack`, { method: 'POST' });
  }

  function renderHelp() {
    if (!commandCard) return;
    commandCard.hidden = false;
    commandCard.innerHTML = '';
    delete commandCard.dataset.simpleDungeonSurface;
    delete commandCard.dataset.richCardKind;
    const help = document.createElement('div');
    help.className = 'simple-loop-help';
    help.innerHTML = '<strong>Simple loop</strong><br><strong>hunt</strong> — quick solo battle for Dust and gear<br><strong>inventory</strong> — inspect, equip, Temper, or salvage permanent gear<br><strong>shop</strong> — buy healing supplies from Mara<br><strong>heal</strong> — use a health potion now; HP also returns naturally over time<br><strong>dungeon</strong> — enter the harder stat-check dungeon<br><strong>attack</strong> — attack the current dungeon enemy<br>Only the two most relevant actions stay beside the composer; every command remains available by typing it.';
    commandCard.append(help);
    decorateFigmaSurface();
  }

  async function heal() {
    await api('/api/recovery/potion', { method: 'POST' });
  }

  function submitMetaCommand(command) {
    if (!input || !composer) return;
    input.value = command;
    composer.requestSubmit();
  }

  function openShop() {
    submitMetaCommand('shop');
  }

  function openInventory() {
    submitMetaCommand('inventory');
  }

  function durationLabel(seconds) {
    const value = Math.max(0, Math.ceil(Number(seconds || 0)));
    if (value < 60) return `${value}s`;
    return `${Math.floor(value / 60)}m ${value % 60}s`;
  }

  function remainingRecoverySeconds(field) {
    const elapsed = Math.floor((Date.now() - recoveryFetchedAt) / 1000);
    return Math.max(0, Number(dashboard?.character?.healthRecovery?.[field] || 0) - elapsed);
  }

  function renderRecovery() {
    if (!commandCard || !dashboard) return;
    const character = dashboard.character;
    commandCard.hidden = false;
    commandCard.innerHTML = '';
    delete commandCard.dataset.simpleDungeonSurface;
    delete commandCard.dataset.bankRichCard;
    delete commandCard.dataset.inventoryRichCard;
    delete commandCard.dataset.shopRichCard;
    commandCard.dataset.richCardKind = 'recovery';
    commandCard.setAttribute('aria-label', 'Heal panel');
    const recovery = document.createElement('div');
    recovery.className = 'simple-loop-help tb-v2-recovery-card';
    recovery.innerHTML = `<strong>Heal · ${character.currentHealth}/${character.maxHealth} HP</strong><br>${character.currentHealth >= character.maxHealth ? 'Fully healed.' : 'Natural healing: next HP in <span data-simple-recovery-next></span> · full in <span data-simple-recovery-full></span>.'}<br>${character.healthPotions} potion${character.healthPotions === 1 ? '' : 's'} available.`;
    const actions = document.createElement('div');
    actions.className = 'thread-card-actions rich-chat-card-actions';
    const potion = document.createElement('button');
    potion.type = 'button';
    potion.className = 'primary-action rich-chat-card-action';
    potion.dataset.testid = 'simple-recovery-use-potion';
    potion.dataset.richCardAction = 'true';
    potion.textContent = 'Use potion · +12 HP';
    potion.disabled = character.currentHealth >= character.maxHealth || character.healthPotions <= 0;
    potion.addEventListener('click', async () => {
      potion.disabled = true;
      try {
        await heal();
        await sync({ force: true });
        renderRecovery();
      } catch (error) {
        showError(error.message);
      }
    });
    const shop = document.createElement('button');
    shop.type = 'button';
    shop.className = 'rich-chat-card-action';
    shop.dataset.testid = 'simple-recovery-open-shop';
    shop.dataset.richCardAction = 'true';
    shop.textContent = 'Open shop';
    shop.addEventListener('click', openShop);
    actions.append(potion, shop);
    commandCard.append(recovery, actions);
    updateRecoveryClock();
    decorateFigmaSurface();
  }

  function textElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  function hpText(current, maximum) {
    return `${Math.max(0, Number(current) || 0)} / ${Math.max(1, Number(maximum) || 1)} HP`;
  }

  function hpPercent(current, maximum) {
    const max = Math.max(1, Number(maximum) || 1);
    return Math.max(0, Math.min(100, (Math.max(0, Number(current) || 0) / max) * 100));
  }

  function appendHealthBar(parent, current, maximum, className, label) {
    const bar = textElement('div', className);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', label);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(Math.max(1, Number(maximum) || 1)));
    bar.setAttribute('aria-valuenow', String(Math.max(0, Number(current) || 0)));
    bar.style.setProperty('--progress', `${hpPercent(current, maximum)}%`);
    bar.append(textElement('span'));
    parent.append(bar);
    return bar;
  }

  function appendKeyValue(parent, label, value, { testId = null, tone = '' } = {}) {
    const row = textElement('div', `simple-dungeon-stat${tone ? ` is-${tone}` : ''}`);
    row.append(textElement('span', '', label), textElement('strong', '', value));
    if (testId) row.dataset.testid = testId;
    parent.append(row);
    return row;
  }

  function dungeonHeader({ dungeonName, state, roomLabel = '' }) {
    const header = textElement('div', 'thread-reply-header simple-dungeon-card-header');
    const copy = textElement('div', 'simple-dungeon-card-title');
    const kicker = textElement('span', 'simple-dungeon-kicker', state === 'boss' ? 'BOSS ROOM' : 'DUNGEON');
    const title = textElement('strong', '', dungeonName || 'Dungeon');
    copy.append(kicker, title);
    if (roomLabel) copy.append(textElement('small', '', roomLabel));
    header.append(copy);
    return header;
  }

  function dungeonCardShell(state, dungeonName) {
    commandCard.hidden = false;
    commandCard.innerHTML = '';
    commandCard.dataset.simpleDungeonSurface = 'true';
    commandCard.dataset.richCardKind = 'dungeon';
    commandCard.dataset.dungeonState = state;
    commandCard.setAttribute('aria-label', `${dungeonName || 'Dungeon'} ${state} panel`);
    const card = textElement('section', `simple-dungeon-card is-${state}`);
    card.dataset.testid = 'simple-dungeon-card';
    card.dataset.state = state;
    commandCard.append(card);
    return card;
  }

  function renderDungeonEntryCard() {
    const { dungeon, readiness } = firstDungeon();
    if (!dungeon || !readiness) return;
    const card = dungeonCardShell('entry', dungeon.name);
    card.append(dungeonHeader({ dungeonName: dungeon.name, state: 'entry', roomLabel: 'Entry' }));

    card.append(textElement('p', 'simple-dungeon-intro', 'A server-backed dungeon run. Your run HP stays with you between rooms.'));

    const summary = textElement('div', 'simple-dungeon-entry-summary');
    const name = textElement('strong', '', dungeon.name);
    name.dataset.testid = 'dungeon-name';
    const details = textElement('small', '', `Recommended Attack ${readiness.recommendedAttack}+ · ${dungeon.recommendedPlayers || 1} player${dungeon.recommendedPlayers === 1 ? '' : 's'} recommended`);
    details.dataset.testid = 'dungeon-entry-recommendation';
    summary.append(name, details);
    card.append(summary);

    const rules = textElement('div', 'simple-dungeon-stat-list');
    appendKeyValue(rules, 'Combat', 'Attack only', { testId: 'dungeon-entry-combat-rule' });
    appendKeyValue(rules, 'HP', 'Persists between rooms', { testId: 'dungeon-entry-hp-rule', tone: 'gold' });
    appendKeyValue(rules, 'Healing', 'Explicit when the run permits it', { testId: 'dungeon-entry-healing-rule', tone: 'green' });
    card.append(rules);

    if (dashboard.party) {
      const party = textElement('div', 'simple-dungeon-readiness');
      party.append(textElement('span', 'simple-dungeon-section-label', `PARTY · ${dashboard.party.members.length}/2`));
      const readinessByPlayer = new Map((readiness.members || []).map((member) => [member.playerId, member]));
      for (const member of dashboard.party.members) {
        const row = textElement('div', 'simple-dungeon-ready-row');
        row.dataset.testid = 'dungeon-readiness-member';
        const memberCheck = readinessByPlayer.get(member.playerId);
        const stateLabel = member.ready ? 'READY' : 'WAITING';
        row.append(
          createSpriteElement(weaverSpriteFrame(member.playerId), { className: 'simple-dungeon-party-sprite', label: member.displayName }),
          textElement('span', 'simple-dungeon-ready-copy', `${member.displayName} · ${memberCheck ? hpText(memberCheck.maxHealth, memberCheck.maxHealth) : 'Readiness unavailable'}`),
          textElement('strong', `simple-dungeon-ready-state is-${member.ready ? 'ready' : 'waiting'}`, stateLabel),
        );
        party.append(row);
      }
      party.append(textElement('small', 'simple-dungeon-note', dashboard.party.allReady ? 'Everyone is ready. The leader can enter.' : 'Ready up here, then wait for the rest of the party.'));
      card.append(party);
    } else {
      card.append(textElement('p', 'simple-dungeon-note', 'Solo entry is available. Party runs snapshot their members when they start.'));
    }
  }

  function renderActiveDungeonCard(run) {
    const definition = run.dungeonDefinition || {};
    const dungeonName = definition.name || run.dungeonId || 'Dungeon';
    const encounterCount = Array.isArray(definition.encounters) ? definition.encounters.length : 0;
    const totalRooms = Math.max(1, encounterCount + (definition.boss ? 1 : 0));
    const roomNumber = run.phase === 'boss'
      ? totalRooms
      : Math.min(totalRooms, Math.max(1, Number(run.encounterIndex || 0) + 1));
    const roomLabel = `Room ${roomNumber} of ${totalRooms}`;
    const state = run.phase === 'boss' || run.enemy?.isBoss ? 'boss' : 'combat';
    const card = dungeonCardShell(state, dungeonName);
    card.classList.toggle('is-party', run.participants.length > 1);
    card.append(dungeonHeader({ dungeonName, state, roomLabel }));

    const room = textElement('div', 'simple-dungeon-room-meta');
    room.dataset.testid = 'dungeon-room';
    room.append(textElement('span', 'simple-dungeon-section-label', state === 'boss' ? 'BOSS ENCOUNTER' : 'ACTIVE ROOM'), textElement('strong', '', roomLabel));
    card.append(room);

    if (run.enemy) {
      const enemy = textElement('article', 'simple-dungeon-enemy');
      enemy.dataset.testid = 'dungeon-enemy';
      const sprite = createSpriteElement(enemySpriteFrame(run.enemy), {
        className: 'simple-dungeon-enemy-sprite',
        testId: 'simple-dungeon-enemy-sprite',
        label: run.enemy.name || 'Enemy',
      });
      const enemyCopy = textElement('div', 'simple-dungeon-enemy-copy');
      const enemyKicker = textElement('span', 'simple-dungeon-enemy-kicker', state === 'boss' ? `BOSS · ${run.enemy.name}` : run.enemy.name);
      const enemyName = textElement('strong', '', run.enemy.name || 'Enemy');
      enemyName.dataset.testid = 'dungeon-enemy-name';
      const enemyHp = textElement('span', 'simple-dungeon-enemy-hp', hpText(run.enemy.hp, run.enemy.maxHp));
      enemyHp.dataset.testid = 'dungeon-enemy-hp';
      enemyCopy.append(enemyKicker, enemyName, enemyHp);
      enemy.append(sprite, enemyCopy);
      appendHealthBar(enemy, run.enemy.hp, run.enemy.maxHp, 'simple-dungeon-enemy-bar', `${run.enemy.name || 'Enemy'} HP`);
      card.append(enemy);
    }

    const party = textElement('div', 'simple-dungeon-party');
    party.append(textElement('span', 'simple-dungeon-section-label', run.participants.length > 1 ? 'PARTY HP' : 'YOUR HP'));
    for (const participant of run.participants) {
      const isViewer = participant.playerId === run.viewer?.playerId;
      const row = textElement('div', `simple-dungeon-party-row${isViewer ? ' is-you' : ''}`);
      row.dataset.testid = 'dungeon-party-member';
      row.dataset.playerId = participant.playerId;
      if (isViewer) row.dataset.currentPlayer = 'true';
      const copy = textElement('div', 'simple-dungeon-party-copy');
      copy.append(textElement('strong', '', isViewer ? `${participant.displayName} · You` : participant.displayName));
      const hp = textElement('span', '', hpText(participant.hp, participant.maxHp));
      if (isViewer) hp.dataset.testid = 'dungeon-player-hp';
      copy.append(hp);
      row.append(createSpriteElement(weaverSpriteFrame(participant.playerId), { className: 'simple-dungeon-party-sprite', label: participant.displayName }), copy);
      appendHealthBar(row, participant.hp, participant.maxHp, 'simple-dungeon-party-bar', `${participant.displayName} HP`);
      party.append(row);
    }
    card.append(party);
    card.append(textElement('p', 'simple-dungeon-note', state === 'boss'
      ? 'Boss turns remain automatic unless authoritative state supplies a sparse decision.'
      : 'Attack resolves against the current enemy. HP carries into the next room.'));
  }

  function renderDungeonSurface({ initial = false } = {}) {
    if (!commandCard || !dashboard) return;
    const run = dashboard.activeRun?.simpleCombat ? dashboard.activeRun : null;
    if (run) {
      hasRenderedInitialDungeonSurface = true;
      previousSimpleRunId = run.id;
      renderActiveDungeonCard(run);
      return;
    }
    if (previousSimpleRunId) {
      previousSimpleRunId = null;
      if (commandCard.dataset.simpleDungeonSurface === 'true') {
        commandCard.hidden = true;
        commandCard.innerHTML = '';
        delete commandCard.dataset.simpleDungeonSurface;
        delete commandCard.dataset.richCardKind;
      }
      return;
    }
    if (initial && !hasRenderedInitialDungeonSurface) {
      hasRenderedInitialDungeonSurface = true;
      if (commandCard.hidden || commandCard.childElementCount === 0) renderDungeonEntryCard();
    }
  }

  function updateRecoveryClock() {
    if (!dashboard) return;
    const nextSeconds = remainingRecoverySeconds('nextHealthInSeconds');
    const fullSeconds = remainingRecoverySeconds('fullHealthInSeconds');
    const next = commandCard?.querySelector('[data-simple-recovery-next]');
    const full = commandCard?.querySelector('[data-simple-recovery-full]');
    if (next) next.textContent = durationLabel(nextSeconds);
    if (full) full.textContent = durationLabel(fullSeconds);
    const rest = actionBar.querySelector('[data-testid="stream-rest"]');
    if (rest) rest.textContent = `Heal · ${durationLabel(nextSeconds)}`;
    if (nextSeconds === 0 && dashboard.character.currentHealth < dashboard.character.maxHealth && !syncing) sync({ force: true }).then(() => {
      if (commandCard?.querySelector('[data-simple-recovery-next]')) renderRecovery();
    }).catch(() => {});
  }

  function revealCommandCard() {
    if (!commandCard || commandCard.hidden) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      commandCard.scrollIntoView({ block: 'end', inline: 'nearest' });
    }));
  }

  function isSimpleSurface() {
    return Boolean(dashboard && (!dashboard.activeRun || dashboard.activeRun.simpleCombat));
  }

  function renderControls() {
    if (!dashboard) return;
    const simple = Boolean(dashboard.activeRun?.simpleCombat);
    const noRun = !dashboard.activeRun;

    normalizeLegacyControls();
    actionBar.replaceChildren();
    actionBar.hidden = !(noRun || simple);

    if (!noRun && !simple) return;

    if (noRun) {
      if (dashboard.character.currentHealth <= 0) {
        addButton(`Heal · ${durationLabel(dashboard.character.healthRecovery?.nextHealthInSeconds)}`, 'heal', async () => renderRecovery(), 'stream-rest');
        addButton('Shop', 'shop', async () => openShop(), 'stream-shop');
        return;
      }

      const { dungeon, readiness } = firstDungeon();
      if (dashboard.party && !dashboard.party.canStart) {
        const partyMember = dashboard.party.members.find((member) => member.playerId === dashboard.character.id);
        addButton(partyMember?.ready ? 'Unready' : 'Ready up', async () => setPartyReady(!partyMember?.ready), 'party-ready');
        addButton('Leave party', leaveParty, 'party-leave');
        return;
      }
      const viewer = readiness?.members?.find((member) => member.playerId === dashboard.character.id) || readiness?.members?.[0];
      const current = Number(viewer?.attackPower ?? dashboard.character.attackPower ?? 0);
      const recommended = Number(readiness?.recommendedAttack ?? 9);
      const hasInventory = (dashboard.inventory?.length || 0) > 0;
      const readyForDungeon = Boolean(dungeon && current >= recommended);

      if (readyForDungeon) {
        addButton(`Dungeon · ${current}/${recommended}`, 'dungeon', startDungeon, 'stream-start-dungeon');
        if (hasInventory) addButton('Inventory', 'inventory', async () => openInventory(), 'stream-inventory');
        else addButton('Hunt', 'hunt', hunt, 'stream-hunt');
        return;
      }

      addButton('Hunt', 'hunt', hunt, 'stream-hunt');
      if (hasInventory) addButton('Inventory', 'inventory', async () => openInventory(), 'stream-inventory');
      else if (dungeon) addButton(`Dungeon · ${current}/${recommended}`, 'dungeon', startDungeon, 'stream-start-dungeon');
      return;
    }

    if (['combat', 'boss'].includes(dashboard.activeRun.phase) && dashboard.activeRun.viewer?.hp > 0) {
      addButton('Attack', 'attack', attack, 'stream-attack');
    }
  }

  function restorePresentationAfterExternalRender() {
    normalizeLegacyControls();
    decorateFigmaSurface();
    if (isSimpleSurface() && actionBar.childElementCount === 0) renderControls();
  }

  async function sync({ force = false } = {}) {
    if (syncing) {
      resyncRequested = true;
      return;
    }
    syncing = true;
    try {
      dashboard = await api('/api/dashboard');
      recoveryFetchedAt = Date.now();
      const signature = JSON.stringify([
        dashboard.activeRun?.id || null,
        dashboard.activeRun?.version ?? null,
        dashboard.activeRun?.phase || null,
        dashboard.activeRun?.simpleCombat || false,
        dashboard.activeRun?.encounterIndex ?? null,
        dashboard.activeRun?.enemy?.hp ?? null,
        ...(dashboard.activeRun?.participants || []).map((participant) => `${participant.playerId}:${participant.hp}`),
        dashboard.character?.attackPower || 0,
        dashboard.inventory?.length || 0,
        dashboard.party?.id || null,
        dashboard.party?.allReady || false,
      ]);
      if (force || signature !== lastSignature || (isSimpleSurface() && actionBar.childElementCount === 0)) {
        lastSignature = signature;
        renderControls();
      }
      if (input) input.placeholder = dashboard.activeRun?.simpleCombat ? 'Message party or type attack…' : 'Message party or type hunt…';
      document.body.classList.toggle('simple-gameplay-loop', isSimpleSurface());
      renderDungeonSurface({ initial: !hasRenderedInitialDungeonSurface });
      restorePresentationAfterExternalRender();
    } finally {
      syncing = false;
      if (resyncRequested) {
        resyncRequested = false;
        queueMicrotask(() => sync({ force: true }).catch((error) => showError(error.message)));
      }
    }
  }

  function scheduleSync(delay = 45) {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => sync().catch(() => {}), delay);
  }

  if (composer && input) {
    composer.addEventListener('submit', async (event) => {
      const raw = normalizedCommand(input.value);
      if (!raw) return;
      const [command, ...args] = raw.toLowerCase().split(/\s+/);
      const activeRun = dashboard?.activeRun || null;
      const simpleCombat = Boolean(activeRun?.simpleCombat);
      const noRun = !activeRun;
      if (!noRun && !simpleCombat) return;

      // Bare /run keeps the one-tap simplified loop. An explicit /run <dungeon-id>
      // belongs to the full adventure command handler so generated/workshop dungeons
      // remain reachable without adding a permanent dungeon picker back to the UI.
      if (command === '/run' && args.length > 0) return;

      // If this presentation model is still on a stale no-run snapshot immediately
      // after the full command handler started a dungeon, do not steal run-scoped
      // commands. The authoritative adventure handler has the fresher run context.
      if (noRun && command === '/attack') return;

      if (['/hunt', '/dungeon', '/run', '/attack', '/help', '/heal', '/potion', '/rest', '/recovery'].includes(command)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (acting) return;
        acting = true;
        input.value = '';
        showError('');
        try {
          if (command === '/hunt') await hunt();
          else if (command === '/dungeon' || command === '/run') await startDungeon();
          else if (command === '/attack') await attack();
          else if (command === '/heal' || command === '/potion') await heal();
          else if (command === '/rest' || command === '/recovery') renderRecovery();
          else renderHelp();
          await sync({ force: true });
        } catch (error) {
          showError(error.message);
        } finally {
          acting = false;
        }
        input.focus();
        revealCommandCard();
        return;
      }

      if (simpleCombat && ['/guard', '/interrupt', '/mend', '/revive', '/upgrade', '/skill'].includes(command)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = '';
        showError('The new combat loop uses /attack only. Hunt for stronger permanent gear if a dungeon is too difficult.');
        input.focus();
      }
    }, { capture: true });
  }

  setInterval(updateRecoveryClock, 1000);

  // Legacy suggestions may redraw for old persisted runs. Keep their test hooks normalized,
  // but never mount the Figma controls inside a container another renderer owns.
  const observer = suggestions ? new MutationObserver(() => {
    queueMicrotask(restorePresentationAfterExternalRender);
    scheduleSync();
  }) : null;
  if (suggestions) observer.observe(suggestions, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-testid'] });

  const streamObserver = new MutationObserver(() => {
    queueMicrotask(restorePresentationAfterExternalRender);
    scheduleSync(70);
  });
  streamObserver.observe(stream, { childList: true, subtree: true });

  normalizeLegacyControls();
  decorateFigmaSurface();
  sync({ force: true }).catch((error) => showError(error.message));
  window.addEventListener('beforeunload', () => {
    clearTimeout(scheduled);
    observer?.disconnect();
    streamObserver.disconnect();
  }, { once: true });
}
