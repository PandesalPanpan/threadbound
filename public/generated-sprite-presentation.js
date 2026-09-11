import { createSpriteElement, enemySpriteFrame, itemSpriteFrame, weaverSpriteFrame } from './sprite-catalog.js';

const stream = document.querySelector('#stream');

if (stream) {
  const style = document.createElement('style');
  style.textContent = `
    /* Generated art stays presentation-only. Atlas frames are cropped with CSS so the
       original sheets remain the single source of truth in /public/assets/generated. */
    #stream .thread-generated-sprite,
    #inventory .thread-generated-sprite {
      display:inline-block;
      flex:0 0 auto;
      overflow:hidden;
      border:1px solid rgba(255,255,255,.09);
      border-radius:9px;
      background-color:#11141b;
      background-clip:padding-box;
      box-shadow:inset 0 0 0 1px rgba(0,0,0,.22);
    }
    #stream .stream-health-unit .thread-generated-sprite {
      width:32px;
      min-width:32px;
      align-self:center;
    }
    #stream .thread-status-unit .thread-generated-sprite,
    #stream .thread-generated-status-sprite {
      width:38px;
      min-width:38px;
    }
    #stream .thread-generated-item-sprite,
    #inventory .thread-generated-item-sprite {
      width:38px;
      min-width:38px;
      align-self:center;
    }
    #stream .stream-hunt-visual {
      display:grid;
      grid-template-columns:44px minmax(0,1fr);
      gap:9px;
      align-items:center;
      margin-top:7px;
      padding:8px;
      border:1px solid rgba(179,109,255,.18);
      border-radius:10px;
      background:linear-gradient(145deg,rgba(179,109,255,.075),rgba(5,10,20,.38));
    }
    #stream .stream-hunt-visual .thread-generated-sprite {
      width:44px;
      min-width:44px;
      border-color:rgba(179,109,255,.25);
      background-color:#181425;
    }
    #stream .stream-hunt-copy {
      min-width:0;
      display:grid;
      gap:2px;
    }
    #stream .stream-hunt-copy > span {
      color:#a98eff;
      font-size:.53rem;
      font-weight:900;
      letter-spacing:.1em;
    }
    #stream .stream-hunt-copy > strong {
      overflow:hidden;
      color:var(--text,#f5f6f8);
      font-size:.76rem;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    #stream .stream-hunt-copy > small {
      color:var(--muted,#a8abb4);
      font-size:.64rem;
      line-height:1.35;
    }
    #stream .stream-hunt-ledger { display:flex; flex-wrap:wrap; gap:5px; margin-top:3px; }
    #stream .stream-hunt-chip { padding:2px 6px; border-radius:5px; background:#171922; color:#d6d7dc; font-size:.61rem; font-weight:800; font-variant-numeric:tabular-nums; }
    #stream .stream-hunt-chip.loss { color:#ff7c89; }
    #stream .stream-hunt-chip.reward { color:#f0c35b; }
    #stream .stream-hunt-chip.health { color:#83dfae; }
    #stream .stream-hunt-loot { display:grid; grid-template-columns:28px minmax(0,1fr); gap:6px; align-items:center; margin-top:5px; color:#c8cad2; font-size:.62rem; }
    #stream .stream-hunt-loot .thread-generated-sprite { width:28px; min-width:28px; }
    @media (max-width:520px) {
      #stream .stream-health-unit .thread-generated-sprite { width:28px; min-width:28px; }
      #stream .stream-hunt-visual { grid-template-columns:40px minmax(0,1fr); gap:8px; padding:7px; }
      #stream .stream-hunt-visual .thread-generated-sprite { width:40px; min-width:40px; }
      #stream .thread-generated-item-sprite,
      #inventory .thread-generated-item-sprite { width:34px; min-width:34px; }
    }
  `;
  document.head.append(style);

  let dashboard = null;
  let streamEntries = new Map();
  let refreshTimer = null;
  let refreshing = false;
  let refreshAgain = false;

  async function api(path) {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function slugify(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function replaceImage(image, frame, { className = '', testId = null, label = '' } = {}) {
    if (!image || image.dataset.generatedSpriteReplaced === 'true') return image;
    const generated = createSpriteElement(frame, { className, testId, label });
    for (const classNameFromImage of image.classList) generated.classList.add(classNameFromImage);
    if (image.dataset.testid && !generated.dataset.testid) generated.dataset.testid = image.dataset.testid;
    image.dataset.generatedSpriteReplaced = 'true';
    image.replaceWith(generated);
    return generated;
  }

  function entryForElement(element) {
    const row = element.closest('.stream-entry[data-entry-id]');
    return row ? streamEntries.get(row.dataset.entryId) || null : null;
  }

  function enemyIdentity(unit) {
    const entry = entryForElement(unit);
    const metadata = entry?.metadata || {};
    const name = unit.querySelector('.stream-health-top strong, strong')?.textContent?.trim() || metadata.enemyName || 'Enemy';
    const label = unit.querySelector('.stream-health-label, span')?.textContent || '';
    return {
      id: metadata.enemyId || metadata.defeatedEnemyId || slugify(name),
      name,
      isBoss: Boolean(metadata.defeatedBoss || metadata.enemy?.isBoss || /boss/i.test(label)),
    };
  }

  function decorateHealthUnits() {
    const playerSeed = dashboard?.character?.id || dashboard?.threadedUser?.id || 'threadbound-weaver';
    for (const unit of stream.querySelectorAll('.stream-health-unit')) {
      const image = unit.querySelector('img');
      if (!image) continue;
      if (unit.classList.contains('enemy')) {
        const enemy = enemyIdentity(unit);
        replaceImage(image, enemySpriteFrame(enemy), {
          className: 'generated-enemy-sprite',
          testId: 'stream-generated-enemy-sprite',
          label: enemy.name,
        });
      } else {
        replaceImage(image, weaverSpriteFrame(playerSeed), {
          className: 'generated-weaver-sprite',
          testId: 'stream-generated-weaver-sprite',
          label: dashboard?.character?.displayName || 'Weaver',
        });
      }
    }
  }

  function decorateStatusUnits() {
    const playerSeed = dashboard?.character?.id || dashboard?.threadedUser?.id || 'threadbound-weaver';
    const player = stream.querySelector('[data-testid="stream-weaver-sprite"]');
    if (player?.tagName === 'IMG') {
      replaceImage(player, weaverSpriteFrame(playerSeed), {
        className: 'thread-generated-status-sprite generated-weaver-sprite',
        testId: 'stream-weaver-sprite',
        label: dashboard?.character?.displayName || 'Weaver',
      });
    }
    for (const unit of stream.querySelectorAll('.thread-status-unit.enemy')) {
      const image = unit.querySelector('img');
      if (!image) continue;
      const name = unit.querySelector('strong')?.textContent?.trim() || 'Enemy';
      replaceImage(image, enemySpriteFrame({ id: slugify(name), name, isBoss: /boss/i.test(unit.textContent) }), {
        className: 'thread-generated-status-sprite generated-enemy-sprite',
        testId: 'stream-status-enemy-sprite',
        label: name,
      });
    }
  }

  function decorateHuntRows() {
    for (const row of stream.querySelectorAll('.stream-entry-system[data-entry-id]')) {
      if (row.dataset.generatedHuntVisual === 'true') continue;
      const entry = streamEntries.get(row.dataset.entryId);
      if (entry?.eventType !== 'HuntResolved') continue;
      const metadata = entry.metadata || {};
      const content = row.querySelector('.stream-entry-content');
      if (!content) continue;
      const sourceCopy = content.querySelector(':scope > p');
      if (sourceCopy) sourceCopy.classList.add('sr-only');

      const visual = document.createElement('div');
      visual.className = 'stream-hunt-visual';
      visual.dataset.testid = 'stream-hunt-visual';
      const enemyName = metadata.enemyName || 'Hunt enemy';
      visual.append(createSpriteElement(enemySpriteFrame({ id: metadata.enemyId, name: enemyName }), {
        className: 'stream-hunt-sprite generated-enemy-sprite',
        testId: 'stream-hunt-sprite',
        label: enemyName,
      }));

      const copy = document.createElement('div');
      copy.className = 'stream-hunt-copy';
      const kicker = document.createElement('span');
      kicker.textContent = metadata.victory ? 'HUNT CLEARED' : 'HUNT FAILED';
      const title = document.createElement('strong');
      title.textContent = enemyName;
      const ledger = document.createElement('div');
      ledger.className = 'stream-hunt-ledger';
      const chip = (text, kind) => {
        const element = document.createElement('span');
        element.className = `stream-hunt-chip ${kind}`;
        element.textContent = text;
        return element;
      };
      const gold = Number(metadata.gold ?? metadata.threadDust ?? 0);
      ledger.append(
        chip(`−${metadata.damageTaken || 0} HP`, 'loss'),
        chip(`${metadata.remainingHp}/${metadata.maxHp} HP`, 'health'),
        chip(metadata.victory ? `+${gold} Gold` : 'No reward', 'reward'),
      );
      copy.append(kicker, title, ledger);
      if (metadata.itemName) {
        const loot = document.createElement('div');
        loot.className = 'stream-hunt-loot';
        const item = itemForName(metadata.itemName) || { id: metadata.itemId, name: metadata.itemName };
        loot.append(createSpriteElement(itemSpriteFrame(item), { className: 'thread-generated-item-sprite', label: metadata.itemName }));
        const lootCopy = document.createElement('span');
        lootCopy.textContent = `You got ${metadata.itemName} · +${metadata.itemAttackBonus || 0} ATK`;
        loot.append(lootCopy);
        copy.append(loot);
      }
      if (metadata.healthPotionsFound) {
        const potion = document.createElement('div');
        potion.className = 'stream-hunt-loot';
        potion.append(createSpriteElement(itemSpriteFrame({ visualAssetId: 'item.health-potion.v1', id: 'health-potion', name: 'Health Potion' }), { className: 'thread-generated-item-sprite', label: 'Health Potion' }));
        const potionCopy = document.createElement('span');
        potionCopy.textContent = '+1 health potion';
        potion.append(potionCopy);
        copy.append(potion);
      }
      visual.append(copy);
      content.append(visual);
      row.dataset.generatedHuntVisual = 'true';
    }
  }

  function itemForName(name) {
    return dashboard?.inventory?.find((item) => String(item.name) === String(name)) || null;
  }

  function decorateGear() {
    if (!dashboard) return;

    const inventoryRows = document.querySelectorAll('#inventory [data-testid="inventory-item"]');
    inventoryRows.forEach((row, index) => {
      const image = row.querySelector('img[src="/sprites/relic.svg"]');
      const item = dashboard.inventory?.[index];
      if (!image || !item) return;
      replaceImage(image, itemSpriteFrame(item), {
        className: 'thread-generated-item-sprite generated-item-sprite',
        testId: 'generated-inventory-item-sprite',
        label: item.name,
      });
    });

    for (const row of stream.querySelectorAll('.thread-gear-row')) {
      const image = row.querySelector('img[src="/sprites/relic.svg"]');
      if (!image) continue;
      const name = row.querySelector('.thread-gear-copy strong')?.textContent?.trim();
      const item = itemForName(name);
      if (!item) continue;
      replaceImage(image, itemSpriteFrame(item), {
        className: 'thread-generated-item-sprite generated-item-sprite',
        testId: 'stream-generated-item-sprite',
        label: item.name,
      });
    }

    const loadout = stream.querySelector('.thread-loadout-line');
    const loadoutImage = loadout?.querySelector('img[src="/sprites/relic.svg"]');
    if (loadoutImage && dashboard.character?.equippedItem) {
      replaceImage(loadoutImage, itemSpriteFrame(dashboard.character.equippedItem), {
        className: 'thread-generated-item-sprite generated-item-sprite',
        testId: 'stream-equipped-item-sprite',
        label: dashboard.character.equippedItem.name,
      });
    }
  }

  function decorate() {
    decorateHealthUnits();
    decorateStatusUnits();
    decorateHuntRows();
    decorateGear();
  }

  async function refresh() {
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    try {
      const [nextDashboard, streamPayload] = await Promise.all([
        api('/api/dashboard'),
        api('/api/stream?limit=100'),
      ]);
      dashboard = nextDashboard;
      streamEntries = new Map((streamPayload.entries || []).map((entry) => [entry.id, entry]));
      decorate();
    } catch {
      // Generated art is progressive enhancement. A temporary read-model failure must
      // never block the underlying chat/gameplay presentation.
    } finally {
      refreshing = false;
      if (refreshAgain) {
        refreshAgain = false;
        queueMicrotask(() => refresh());
      }
    }
  }

  function scheduleRefresh(delay = 60) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh(), delay);
  }

  const observer = new MutationObserver(() => scheduleRefresh());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('threadbound:activity', () => scheduleRefresh(25));
  window.addEventListener('threadbound:context-refresh', () => scheduleRefresh(25));
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });

  await refresh();
}
