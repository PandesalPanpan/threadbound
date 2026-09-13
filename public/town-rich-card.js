import { createSpriteElement, weaverSpriteFrame } from './sprite-catalog.js';

const stream = document.querySelector('#stream');

if (stream) {
  const styles = document.createElement('style');
  styles.dataset.townRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-town-rich-card="true"] { scroll-margin-top:76px; }
    .thread-town-heading { display:grid; gap:3px; }
    .thread-town-heading strong { font-size:1rem; }
    .thread-town-heading small { color:var(--muted); font-size:.7rem; line-height:1.4; }
    .thread-town-services { display:flex; flex-wrap:wrap; gap:6px; }
    .thread-town-service { padding:5px 8px; border:1px solid rgba(255,255,255,.09); border-radius:999px; background:rgba(255,255,255,.04); color:var(--muted); font-size:.66rem; font-weight:800; text-transform:capitalize; }
    .thread-town-npcs { display:grid; gap:8px; }
    .thread-town-npc { display:grid; grid-template-columns:58px minmax(0,1fr) auto; gap:10px; align-items:center; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:rgba(4,10,21,.48); }
    .thread-town-npc-sprite { width:58px; min-width:58px; border-radius:10px; background-color:rgba(255,255,255,.035); }
    .thread-town-npc-copy { display:grid; gap:2px; min-width:0; }
    .thread-town-npc-copy strong { font-size:.86rem; }
    .thread-town-npc-copy small { color:var(--muted); font-size:.68rem; line-height:1.4; }
    .thread-town-talk { min-width:62px; min-height:44px; padding:8px 10px; border-radius:10px; font-weight:800; }
    .thread-town-talk:disabled { opacity:.55; }
    .thread-town-empty { margin:0; padding:12px; border:1px dashed rgba(255,255,255,.11); border-radius:11px; color:var(--muted); font-size:.72rem; line-height:1.45; }
    .thread-town-note { margin:0; color:var(--muted); font-size:.68rem; line-height:1.45; }
    @media (max-width:420px) { .thread-town-npc { grid-template-columns:52px minmax(0,1fr); } .thread-town-npc-sprite { width:52px; min-width:52px; } .thread-town-talk { grid-column:2; justify-self:start; } }
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
    kicker.textContent = 'PRIVATE THREAD REPLY · /town';
    const heading = document.createElement('strong');
    heading.textContent = 'Town';
    const small = document.createElement('small');
    small.textContent = subtitle;
    copy.append(kicker, heading, small);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss Town panel');
    close.textContent = '×';
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    wrap.append(copy, close);
    return wrap;
  }

  async function interactWithNpc(town, npc, button = null) {
    if (button) button.disabled = true;
    try {
      showError('');
      await api(`/api/towns/${encodeURIComponent(town.id)}/npcs/${encodeURIComponent(npc.id)}/interact`, { method: 'POST' });
    } catch (error) {
      showError(error.message);
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }

  function renderTown(area) {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'town';
    card.dataset.townRichCard = 'true';
    card.append(header(card, `${area.currentArea.name} hub`));

    const town = area.towns?.[0] || null;
    if (!town) {
      const empty = document.createElement('p');
      empty.className = 'thread-town-empty';
      empty.dataset.testid = 'town-empty';
      empty.textContent = `No Town is available in ${area.currentArea.name} yet.`;
      card.append(empty);
      card.scrollIntoView({ block: 'start', inline: 'nearest' });
      return;
    }

    const heading = document.createElement('div');
    heading.className = 'thread-town-heading';
    const name = document.createElement('strong');
    name.dataset.testid = 'town-name';
    name.textContent = town.name;
    const detail = document.createElement('small');
    detail.textContent = `${area.currentArea.name} · ${town.npcs.length} resident${town.npcs.length === 1 ? '' : 's'}`;
    heading.append(name, detail);
    card.append(heading);

    const services = document.createElement('div');
    services.className = 'thread-town-services';
    services.dataset.testid = 'town-services';
    for (const service of town.services || []) {
      const chip = document.createElement('span');
      chip.className = 'thread-town-service';
      chip.textContent = service.replace('_', ' ');
      services.append(chip);
    }
    card.append(services);

    const npcs = document.createElement('div');
    npcs.className = 'thread-town-npcs';
    npcs.dataset.testid = 'town-npcs';
    for (const npc of town.npcs || []) {
      const row = document.createElement('article');
      row.className = 'thread-town-npc';
      row.dataset.testid = `town-npc-${npc.id}`;
      const sprite = createSpriteElement(
        weaverSpriteFrame(npc.id, { variant: npc.spriteVariant === 'female' ? 'female' : 'male' }),
        { className: 'thread-town-npc-sprite', testId: `town-npc-sprite-${npc.id}`, label: `${npc.name} portrait` },
      );
      const copy = document.createElement('div');
      copy.className = 'thread-town-npc-copy';
      const npcName = document.createElement('strong');
      npcName.textContent = npc.name;
      const role = document.createElement('small');
      role.textContent = `${npc.role} service · talk in the shared Adventure Stream`;
      copy.append(npcName, role);
      const talk = document.createElement('button');
      talk.type = 'button';
      talk.className = 'thread-town-talk';
      talk.dataset.testid = `town-talk-${npc.id}`;
      talk.textContent = 'Talk';
      talk.setAttribute('aria-label', `Talk to ${npc.name}`);
      talk.addEventListener('click', () => interactWithNpc(town, npc, talk));
      row.append(sprite, copy, talk);
      npcs.append(row);
    }
    card.append(npcs);

    const note = document.createElement('p');
    note.className = 'thread-town-note';
    note.textContent = 'Talk creates a shared stream receipt. Shop, Upgrade, Bank, and Heal mutations remain in their existing authoritative services.';
    card.append(note);
    card.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  async function loadTownArea() {
    const payload = await api('/api/areas');
    return payload.area;
  }

  async function openTown() {
    try {
      renderTown(await loadTownArea());
    } catch (error) {
      showError(error.message);
    }
  }

  async function talkByQuery(query) {
    try {
      const area = await loadTownArea();
      const town = area.towns?.[0] || null;
      if (!town) throw new Error(`No Town is available in ${area.currentArea.name} yet.`);
      const normalized = String(query || '').trim().toLowerCase();
      const npc = town.npcs.find((candidate) => [candidate.id, candidate.name, candidate.role, candidate.service]
        .some((value) => String(value || '').trim().toLowerCase() === normalized));
      if (!npc) throw new Error(`No Town resident matches “${query}”. Open town to see available NPCs.`);
      await interactWithNpc(town, npc);
    } catch (error) {
      showError(error.message);
    }
  }

  function installComposerIntercept() {
    const form = stream.querySelector('[data-testid="stream-composer"]');
    const input = stream.querySelector('[data-testid="stream-message"]');
    if (!form || !input || form.dataset.townCommandInstalled === 'true') return false;
    form.dataset.townCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const raw = String(input.value || '').trim();
      const value = raw.toLowerCase();
      if (['town', '/town'].includes(value)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = '';
        showError('');
        openTown();
        return;
      }
      const match = raw.match(/^\/?(?:talk|speak)\s+(.+)$/i);
      if (!match) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      showError('');
      talkByQuery(match[1]);
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
