const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const style = document.createElement('style');
  style.textContent = `
    /* Semantic combat palette: one meaning keeps one color across receipts and choices. */
    :root {
      --combat-damage:#ff647c;
      --combat-damage-in:#ff8e9d;
      --combat-heal:#62e6a7;
      --combat-defense:#55d6ff;
      --combat-focus:#6f9cff;
      --combat-special:#c796ff;
      --combat-reward:#ffd75e;
      --combat-preview:#ff9f5a;
    }

    .combat-metric { font-weight:950; font-variant-numeric:tabular-nums; }
    .combat-metric.damage { color:var(--combat-damage); text-shadow:0 0 12px rgba(255,100,124,.18); }
    .combat-metric.damage-in { color:var(--combat-damage-in); }
    .combat-metric.heal { color:var(--combat-heal); }
    .combat-metric.defense { color:var(--combat-defense); }
    .combat-metric.focus { color:var(--combat-focus); }
    .combat-metric.special { color:var(--combat-special); }
    .combat-metric.reward { color:var(--combat-reward); }

    .stream-result-chip.damage.damage-out {
      color:#ff9bad;
      border-color:rgba(255,100,124,.36);
      background:rgba(255,100,124,.13);
      box-shadow:inset 0 0 0 1px rgba(255,100,124,.04);
    }
    .stream-result-chip.damage.damage-in {
      color:#ffc0c9;
      border-color:rgba(255,91,116,.3);
      background:rgba(150,35,57,.19);
    }
    .stream-result-chip.heal {
      color:#9af2c2;
      border-color:rgba(98,230,167,.34);
      background:rgba(98,230,167,.12);
    }
    .stream-result-chip.guard, .stream-result-chip.defense {
      color:#a7eeff;
      border-color:rgba(85,214,255,.34);
      background:rgba(85,214,255,.11);
    }
    .stream-result-chip.focus {
      color:#b6c9ff;
      border-color:rgba(111,156,255,.36);
      background:rgba(111,156,255,.12);
    }
    .stream-result-chip.combo, .stream-result-chip.status, .stream-result-chip.skill {
      color:#dfc2ff;
      border-color:rgba(199,150,255,.34);
      background:rgba(199,150,255,.11);
    }
    .stream-result-chip.reward {
      color:#ffe89a;
      border-color:rgba(255,215,94,.38);
      background:rgba(255,215,94,.12);
    }

    /* Orange is prediction only; confirmed damage is always red. */
    .stream-health-preview, .stream-suggestions button[data-preview-label]::after,
    .combat-skill[data-preview-label]::after, .stream-health-preview-copy { color:var(--combat-preview) !important; }

    .run-power-card[data-power-tone="damage"] { border-color:rgba(255,100,124,.42) !important; box-shadow:inset 3px 0 0 rgba(255,100,124,.64); }
    .run-power-card[data-power-tone="heal"] { border-color:rgba(98,230,167,.4) !important; box-shadow:inset 3px 0 0 rgba(98,230,167,.58); }
    .run-power-card[data-power-tone="guard"] { border-color:rgba(85,214,255,.4) !important; box-shadow:inset 3px 0 0 rgba(85,214,255,.58); }
    .run-power-card[data-power-tone="special"] { border-color:rgba(199,150,255,.42) !important; box-shadow:inset 3px 0 0 rgba(199,150,255,.62); }
    .run-power-card[data-power-tone="damage"] .run-power-category { color:#ff9bad; }
    .run-power-card[data-power-tone="heal"] .run-power-category { color:#9af2c2; }
    .run-power-card[data-power-tone="guard"] .run-power-category { color:#a7eeff; }
    .run-power-card[data-power-tone="special"] .run-power-category { color:#dfc2ff; }

    .run-power-effect.damage { color:#ff9bad; background:rgba(255,100,124,.11); }
    .run-power-effect.heal { color:#9af2c2; background:rgba(98,230,167,.1); }
    .run-power-effect.guard { color:#a7eeff; background:rgba(85,214,255,.1); }
    .run-power-effect.focus { color:#b6c9ff; background:rgba(111,156,255,.1); }
    .run-power-effect.special { color:#dfc2ff; background:rgba(199,150,255,.1); }

    .stream-intent-receipt { border-color:rgba(255,100,124,.28); }
    .stream-outcome-banner:not(.upgrade) { color:var(--combat-reward); border-color:rgba(255,215,94,.3); background:rgba(255,215,94,.08); }
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
    chip.classList.remove('damage-out', 'damage-in', 'focus', 'combo', 'status', 'skill', 'reward', 'defense');
    if (text.includes('ENEMY HP')) chip.classList.add('damage', 'damage-out');
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
