import { createSpriteElement, itemSpriteFrame, weaverSpriteFrame } from './sprite-catalog.js';

const stream = document.querySelector('#stream');

if (stream) {
  const styles = document.createElement('style');
  styles.dataset.profileRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-profile-rich-card="true"] { scroll-margin-top:76px; }
    .thread-profile-hero { display:flex; align-items:center; gap:12px; min-width:0; }
    .thread-profile-avatar { width:64px; height:64px; flex:0 0 64px; }
    .thread-profile-hero-copy { display:grid; gap:2px; min-width:0; }
    .thread-profile-hero-copy > span { color:var(--muted); font-size:.72rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .thread-profile-hero-copy > strong { font-size:1.05rem; overflow-wrap:anywhere; }
    .thread-profile-hero-copy > small { color:var(--muted); }
    .thread-profile-resource-grid, .thread-profile-stat-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .thread-profile-resource, .thread-profile-stat { display:grid; gap:2px; min-width:0; padding:9px 10px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.03); }
    .thread-profile-resource > span, .thread-profile-stat > span { color:var(--muted); font-size:.68rem; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
    .thread-profile-resource > strong, .thread-profile-stat > strong { font-size:.92rem; }
    .thread-profile-equipment { display:grid; gap:7px; }
    .thread-profile-equipment > h3, .thread-profile-achievements > h3 { margin:0; font-size:.78rem; text-transform:uppercase; letter-spacing:.07em; }
    .thread-profile-slot { display:flex; align-items:center; gap:8px; min-width:0; padding:7px 8px; border-radius:9px; background:rgba(255,255,255,.025); }
    .thread-profile-slot img { width:36px; height:36px; flex:0 0 36px; }
    .thread-profile-slot-copy { display:grid; min-width:0; }
    .thread-profile-slot-copy > span { color:var(--muted); font-size:.62rem; font-weight:800; text-transform:uppercase; }
    .thread-profile-slot-copy > strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.78rem; }
    .thread-profile-achievements { display:grid; gap:6px; }
    .thread-profile-achievements p { margin:0; color:var(--muted); font-size:.72rem; line-height:1.4; }
    @media (max-width:420px) {
      .thread-profile-stat-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .thread-profile-resource-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
  `;
  document.head.append(styles);

  const SLOT_LABELS = Object.freeze({ weapon: 'Weapon', helmet: 'Helmet', armor: 'Armor', boots: 'Boots', accessory: 'Accessory' });

  function header(card, title, subtitle) {
    const wrap = document.createElement('div');
    wrap.className = 'thread-reply-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'PRIVATE THREAD REPLY · /profile';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const small = document.createElement('small');
    small.textContent = subtitle;
    copy.append(kicker, heading, small);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss Profile panel');
    close.textContent = '×';
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    wrap.append(copy, close);
    return wrap;
  }

  function formatCrit(character) {
    const value = Number(character.critChancePercent);
    if (Number.isFinite(value)) return `${value}%`;
    const fraction = Number(character.critChance);
    return Number.isFinite(fraction) ? `${Math.round(fraction * 100)}%` : '0%';
  }

  function statCell(label, value, testId) {
    const cell = document.createElement('div');
    cell.className = 'thread-profile-stat';
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = String(value);
    if (testId) amount.dataset.testid = testId;
    cell.append(name, amount);
    return cell;
  }

  function resourceCell(label, value, testId) {
    const cell = document.createElement('div');
    cell.className = 'thread-profile-resource';
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = String(value);
    if (testId) amount.dataset.testid = testId;
    cell.append(name, amount);
    return cell;
  }

  async function dashboard() {
    const response = await fetch('/api/dashboard', { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Could not load Profile.');
    return payload;
  }

  function renderProfile(data) {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    const character = data.character;
    const levelProgression = character.levelProgression || {};
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'profile';
    card.dataset.profileRichCard = 'true';
    card.append(header(card, 'Profile', `Level ${character.level} · ${character.gold} Gold`));

    const hero = document.createElement('div');
    hero.className = 'thread-profile-hero';
    hero.append(createSpriteElement(weaverSpriteFrame(character.id), { className: 'thread-profile-avatar', label: character.displayName }));
    const heroCopy = document.createElement('div');
    heroCopy.className = 'thread-profile-hero-copy';
    const role = document.createElement('span');
    role.textContent = 'Adventurer';
    const name = document.createElement('strong');
    name.textContent = character.displayName;
    name.dataset.testid = 'profile-name';
    const xp = document.createElement('small');
    const inLevel = Number(levelProgression.experienceIntoLevel || 0);
    const needed = Number(levelProgression.experienceForNextLevel || 0);
    xp.textContent = needed > 0 ? `Level ${character.level} · ${inLevel}/${needed} XP to next level` : `Level ${character.level} · ${character.xp} XP`;
    xp.dataset.testid = 'profile-xp';
    heroCopy.append(role, name, xp);
    hero.append(heroCopy);
    card.append(hero);

    const resources = document.createElement('div');
    resources.className = 'thread-profile-resource-grid';
    resources.append(
      resourceCell('Gold', character.gold, 'profile-gold'),
      resourceCell('Banked Gold', character.bankedGold ?? 0, 'profile-banked-gold'),
      resourceCell('Area', character.area?.name || data.area?.name || 'Not established', 'profile-area'),
      resourceCell('Achievements', data.achievements?.length || 0, 'profile-achievement-count'),
    );
    card.append(resources);

    const stats = document.createElement('div');
    stats.className = 'thread-profile-stat-grid';
    stats.append(
      statCell('Attack', character.attack ?? character.attackPower ?? 0, 'profile-stat-attack'),
      statCell('Defense', character.defense ?? 0, 'profile-stat-defense'),
      statCell('Max HP', character.maxHp ?? character.maxHealth ?? 0, 'profile-stat-max-hp'),
      statCell('Speed', character.speed ?? 0, 'profile-stat-speed'),
      statCell('Crit Chance', formatCrit(character), 'profile-stat-crit'),
    );
    card.append(stats);

    const equipment = document.createElement('section');
    equipment.className = 'thread-profile-equipment';
    const equipmentTitle = document.createElement('h3');
    equipmentTitle.textContent = 'Equipment';
    equipment.append(equipmentTitle);
    for (const [slot, label] of Object.entries(SLOT_LABELS)) {
      const item = character.equipment?.[slot] || null;
      const row = document.createElement('div');
      row.className = 'thread-profile-slot';
      row.dataset.testid = `profile-slot-${slot}`;
      if (item) row.append(createSpriteElement(itemSpriteFrame(item), { className: 'thread-generated-item-sprite', label: item.name }));
      else {
        const empty = document.createElement('span');
        empty.className = 'thread-profile-slot-empty';
        empty.textContent = '◇';
        empty.setAttribute('aria-hidden', 'true');
        row.append(empty);
      }
      const copy = document.createElement('div');
      copy.className = 'thread-profile-slot-copy';
      const slotLabel = document.createElement('span');
      slotLabel.textContent = label;
      const itemName = document.createElement('strong');
      itemName.textContent = item?.name || 'Empty';
      copy.append(slotLabel, itemName);
      row.append(copy);
      equipment.append(row);
    }
    card.append(equipment);

    const achievements = document.createElement('section');
    achievements.className = 'thread-profile-achievements';
    const achievementsTitle = document.createElement('h3');
    achievementsTitle.textContent = 'Achievements';
    const achievementsCopy = document.createElement('p');
    const names = (data.achievements || []).slice(0, 3).map((achievement) => achievement.name).filter(Boolean);
    achievementsCopy.textContent = names.length ? names.join(' · ') : 'No achievements unlocked yet.';
    achievements.append(achievementsTitle, achievementsCopy);
    card.append(achievements);
    card.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  async function openProfile() {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    try {
      renderProfile(await dashboard());
    } catch (error) {
      const errorEl = stream.querySelector('[data-testid="stream-error"]');
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
      }
    }
  }

  function installComposerIntercept() {
    const form = stream.querySelector('[data-testid="stream-composer"]');
    const input = stream.querySelector('[data-testid="stream-message"]');
    if (!form || !input || form.dataset.profileCommandInstalled === 'true') return false;
    form.dataset.profileCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const value = String(input.value || '').trim().toLowerCase();
      if (!['profile', '/profile'].includes(value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      openProfile();
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
