import './combat-transition-presentation.js';

const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const style = document.createElement('style');
  style.textContent = `
    /* Semantic combat palette: one meaning keeps one high-contrast color. */
    :root {
      --combat-damage:#ff5f78;
      --combat-damage-in:#ff8999;
      --combat-heal:#66f0ae;
      --combat-defense:#62ddff;
      --combat-focus:#79a7ff;
      --combat-special:#d2a4ff;
      --combat-reward:#ffe06b;
      --combat-preview:#ffe45c;
      --combat-preview-ink:#211a00;
    }

    .combat-metric { font-weight:1000; font-variant-numeric:tabular-nums; }
    .combat-metric.damage { color:#ff7288; text-shadow:0 0 12px rgba(255,95,120,.25); }
    .combat-metric.damage-in { color:#ff9cab; }
    .combat-metric.heal { color:var(--combat-heal); }
    .combat-metric.defense { color:var(--combat-defense); }
    .combat-metric.focus { color:var(--combat-focus); }
    .combat-metric.special { color:var(--combat-special); }
    .combat-metric.reward { color:var(--combat-reward); }

    .stream-result-chip {
      text-shadow:none;
      font-variant-numeric:tabular-nums;
    }
    .stream-result-chip.damage.damage-out {
      color:#fff3f5;
      border-color:rgba(255,95,120,.68);
      background:rgba(189,35,59,.42);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.055),0 0 12px rgba(255,95,120,.08);
    }
    .stream-result-chip.damage.damage-in {
      color:#fff5f6;
      border-color:rgba(255,137,153,.62);
      background:rgba(151,32,51,.42);
    }
    .stream-result-chip.heal {
      color:#effff7;
      border-color:rgba(102,240,174,.54);
      background:rgba(29,126,82,.34);
    }
    .stream-result-chip.guard, .stream-result-chip.defense {
      color:#f0fcff;
      border-color:rgba(98,221,255,.56);
      background:rgba(25,111,138,.34);
    }
    .stream-result-chip.focus {
      color:#f3f7ff;
      border-color:rgba(121,167,255,.56);
      background:rgba(48,80,155,.36);
    }
    .stream-result-chip.combo, .stream-result-chip.status, .stream-result-chip.skill {
      color:#fbf5ff;
      border-color:rgba(210,164,255,.55);
      background:rgba(94,55,139,.36);
    }
    .stream-result-chip.reward {
      color:#fffbed;
      border-color:rgba(255,224,107,.62);
      background:rgba(132,102,16,.38);
    }
    .stream-result-chip.critical {
      color:#221700;
      border-color:#fff3a1;
      background:linear-gradient(135deg,#ffe45c,#ffb84d);
      box-shadow:0 0 14px rgba(255,228,92,.32);
      text-shadow:none;
    }

    /* Yellow is forecast only; confirmed damage stays red. */
    .stream-health-preview,
    .stream-health-preview-copy { color:var(--combat-preview) !important; }
    .stream-suggestions button[data-preview-label]::after,
    .combat-skill[data-preview-label]::after {
      color:var(--combat-preview-ink) !important;
      background:var(--combat-preview) !important;
      border-color:rgba(255,255,255,.7) !important;
      text-shadow:none !important;
    }

    .run-power-card[data-power-tone="damage"] { border-color:rgba(255,95,120,.5) !important; box-shadow:inset 3px 0 0 rgba(255,95,120,.76); }
    .run-power-card[data-power-tone="heal"] { border-color:rgba(102,240,174,.46) !important; box-shadow:inset 3px 0 0 rgba(102,240,174,.66); }
    .run-power-card[data-power-tone="guard"] { border-color:rgba(98,221,255,.46) !important; box-shadow:inset 3px 0 0 rgba(98,221,255,.66); }
    .run-power-card[data-power-tone="special"] { border-color:rgba(210,164,255,.48) !important; box-shadow:inset 3px 0 0 rgba(210,164,255,.7); }
    .run-power-card[data-power-tone="damage"] .run-power-category { color:#ff94a5; }
    .run-power-card[data-power-tone="heal"] .run-power-category { color:#a8ffd0; }
    .run-power-card[data-power-tone="guard"] .run-power-category { color:#acf1ff; }
    .run-power-card[data-power-tone="special"] .run-power-category { color:#e6ccff; }

    .run-power-effect.damage { color:#ffdce2; background:rgba(255,95,120,.17); }
    .run-power-effect.heal { color:#c9ffe2; background:rgba(102,240,174,.14); }
    .run-power-effect.guard { color:#c8f7ff; background:rgba(98,221,255,.14); }
    .run-power-effect.focus { color:#d6e3ff; background:rgba(121,167,255,.14); }
    .run-power-effect.special { color:#ecd9ff; background:rgba(210,164,255,.14); }

    .stream-intent-receipt { border-color:rgba(255,95,120,.33); }
    .stream-outcome-banner:not(.upgrade) { color:var(--combat-reward); border-color:rgba(255,224,107,.34); background:rgba(255,224,107,.1); }
  `;
  document.head.append(style);

  function wrapFirstNumber(element, value, tone) {
    if (!element || value === null || value === undefined || element.querySelector('.combat-metric')) return;
    const text = element.textContent || '';
    const needle = String(value);
    const index = text.indexOf(needle);
    if (index < 0) return;
    const before = text.slice(0, index);
    const after = text.slice(index + needle.length);
    element.textContent = '';
    if (before) element.append(document.createTextNode(before));
    const metric = document.createElement('strong');
    metric.className = `combat-metric ${tone}`;
    metric.textContent = needle;
    element.append(metric);
    if (after) element.append(document.createTextNode(after));
  }

  function numberFrom(text, pattern) {
    const match = String(text || '').match(pattern);
    return match ? Number(match[1]) : null;
  }

  function classifyChip(chip) {
    const text = String(chip.textContent || '').toUpperCase();
    chip.classList.remove('damage-out', 'damage-in', 'focus', 'combo', 'status', 'skill', 'reward', 'defense', 'critical');
    if (text.includes('CRIT')) chip.classList.add('critical');
    else if (text.includes('ENEMY HP')) chip.classList.add('damage', 'damage-out');
    else if ((text.includes(' HP') || text.includes('DMG')) && (text.includes('−') || text.includes('-'))) chip.classList.add('damage', 'damage-in');
    else if (text.includes('FOCUS')) chip.classList.add('focus');
    else if (text.includes('BLOCK') || text.includes('PREVENT') || text.includes('PROTECTED')) chip.classList.add('guard', 'defense');
    else if (text.includes('COMBO')) chip.classList.add('combo');
    else if (text.includes('EXPOSED') || text.includes('STATUS')) chip.classList.add('status');
    else if (text.includes('DEFEATED') || text.includes('REWARD') || text.includes('CLEARED')) chip.classList.add('reward');
    else if (text.includes('SKILL') || text.includes('INTERRUPTED')) chip.classList.add('skill');
  }

  function decorateCombatReceipt(row) {
    if (!row || row.dataset.semanticColors === 'true') return;
    const summary = row.querySelector('.stream-rich-summary');
    const text = summary?.textContent || '';
    if (row.classList.contains('stream-action-attack') || row.classList.contains('stream-action-skill')) {
      wrapFirstNumber(summary, numberFrom(text, /for\s+(\d+)\s+damage/i), 'damage');
    } else if (row.classList.contains('stream-action-mend')) {
      wrapFirstNumber(summary, numberFrom(text, /for\s+(\d+)\s+HP/i), 'heal');
    } else if (row.classList.contains('stream-action-revive')) {
      wrapFirstNumber(summary, numberFrom(text, /with\s+(\d+)\s+HP/i), 'heal');
    } else if (row.classList.contains('stream-action-guard')) {
      wrapFirstNumber(summary, numberFrom(text, /(?:blocked|prevented)\s+(\d+)\s+damage/i), 'defense');
    }

    for (const chip of row.querySelectorAll('.stream-result-chip')) classifyChip(chip);
    const intent = row.querySelector('.stream-intent-receipt');
    if (intent && !intent.querySelector('.combat-metric')) {
      wrapFirstNumber(intent, numberFrom(intent.textContent, /(?:·\s*)?(\d+)\s+DMG/i), 'damage-in');
    }
    row.dataset.semanticColors = 'true';
  }

  function effectTone(text) {
    const normalized = String(text || '').toUpperCase();
    if (normalized.includes('ATTACK') || normalized.includes('DAMAGE')) return 'damage';
    if (normalized.includes('HP') || normalized.includes('HEAL')) return 'heal';
    if (normalized.includes('GUARD') || normalized.includes('BLOCK')) return 'guard';
    if (normalized.includes('FOCUS')) return 'focus';
    return 'special';
  }

  function decoratePowerCard(card) {
    if (!card || card.dataset.semanticPower === 'true') return;
    const category = card.querySelector('.run-power-category')?.textContent || '';
    const categoryText = category.toUpperCase();
    const tone = categoryText.includes('OFFENSE') ? 'damage'
      : categoryText.includes('SUSTAIN') ? 'heal'
        : [...card.querySelectorAll('.run-power-effect')].some((effect) => /GUARD|BLOCK/i.test(effect.textContent || '')) ? 'guard'
          : 'special';
    card.dataset.powerTone = tone;
    for (const effect of card.querySelectorAll('.run-power-effect')) effect.classList.add(effectTone(effect.textContent));
    card.dataset.semanticPower = 'true';
  }

  function decorateAll() {
    for (const row of stream.querySelectorAll('.stream-entry-rich')) decorateCombatReceipt(row);
    for (const card of stream.querySelectorAll('.run-power-card')) decoratePowerCard(card);
  }

  const observer = new MutationObserver(() => queueMicrotask(decorateAll));
  observer.observe(stream, { childList: true, subtree: true, characterData: true });
  decorateAll();
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
