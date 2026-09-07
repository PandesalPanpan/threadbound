import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, oldText, newText) {
  const text = await readFile(path, 'utf8');
  if (!text.includes(oldText)) throw new Error(`Patch anchor not found in ${path}: ${oldText.slice(0, 120)}`);
  await writeFile(path, text.replace(oldText, newText, 1));
}

await replaceOnce(
  'src/app.js',
  '<p>Auto-strike through the Hollow. Time Guard, Interrupt, Mend, and Revive when the fight demands it.</p>',
  '<p>Fight through the Hollow one deliberate action at a time. Build Focus, answer enemy telegraphs, and combine Power Strike, Guard, Interrupt, Mend, and Revive.</p>',
);
await replaceOnce(
  'src/app.js',
  "  app.post('/api/runs/:runId/attack', requireConnection, (request, response) => response.json(gameService.attack(request.session.threaded.playerId, request.params.runId)));\n  app.post('/api/runs/:runId/guard'",
  "  app.post('/api/runs/:runId/attack', requireConnection, (request, response) => response.json(gameService.attack(request.session.threaded.playerId, request.params.runId)));\n  app.post('/api/runs/:runId/power-strike', requireConnection, (request, response) => response.json(gameService.powerStrike(request.session.threaded.playerId, request.params.runId)));\n  app.post('/api/runs/:runId/guard'",
);
await replaceOnce(
  'src/app.js',
  '/not found|Unknown|active dungeon|active run|party|leader|ready|member|participant|cannot act|Mend|Revive|interrupt|enemy action|only be chosen|not currently in combat|full|state changed|salvag/i',
  '/not found|Unknown|active dungeon|active run|party|leader|ready|member|participant|cannot act|Mend|Revive|interrupt|Power Strike|Focus|cooling down|counter|enemy action|only be chosen|not currently in combat|full|state changed|salvag/i',
);

await replaceOnce(
  'public/adventure-stream.js',
  "    hero.querySelector('small').textContent = `HP ${viewer?.hp ?? dashboard.character.maxHealth}/${viewer?.maxHp ?? dashboard.character.maxHealth} · ATK ${dashboard.character.attackPower}`;",
  "    hero.querySelector('small').textContent = `HP ${viewer?.hp ?? dashboard.character.maxHealth}/${viewer?.maxHp ?? dashboard.character.maxHealth} · ATK ${dashboard.character.attackPower}${viewer ? ` · FOCUS ${viewer.focus}/${viewer.maxFocus}` : ''}`;",
);
await replaceOnce(
  'public/adventure-stream.js',
  `  function addSuggestion(label, command, { primary = false, testId = null } = {}) {\n    const button = document.createElement('button');\n    button.type = 'button';\n    button.textContent = label;\n    button.className = primary ? 'is-primary' : '';\n    button.dataset.command = command;\n    if (testId) button.dataset.testid = testId;\n    button.addEventListener('click', () => executeCommand(command));\n    suggestionsEl.append(button);\n  }`,
  `  function addSuggestion(label, command, { primary = false, testId = null, disabled = false, counter = false, title = '' } = {}) {\n    const button = document.createElement('button');\n    button.type = 'button';\n    button.textContent = label;\n    button.className = [primary ? 'is-primary' : '', counter ? 'is-counter' : ''].filter(Boolean).join(' ');\n    button.dataset.command = command;\n    button.disabled = disabled;\n    if (title) button.title = title;\n    if (testId) button.dataset.testid = testId;\n    button.addEventListener('click', () => executeCommand(command));\n    suggestionsEl.append(button);\n  }`,
);
await replaceOnce(
  'public/adventure-stream.js',
  `    } else if (['combat', 'boss'].includes(run.phase) && run.viewer?.hp > 0) {\n      addSuggestion('Attack now', '/attack', { primary: true, testId: 'stream-attack' });\n      addSuggestion(run.enemyIntent ? 'Guard heavy' : 'Guard', '/guard', { testId: 'stream-guard' });\n      if (run.enemyIntent) addSuggestion(\`Interrupt ${'${'}run.enemyIntent.name}\`, '/interrupt', { primary: true, testId: 'stream-interrupt' });\n      if (run.viewer.mendCharges > 0 && run.participants.some((p) => p.hp > 0 && p.hp < p.maxHp)) addSuggestion('Mend ally', '/mend');\n      if (run.viewer.reviveCharges > 0 && run.participants.some((p) => p.hp <= 0)) addSuggestion('Revive ally', '/revive');\n    } else if (run.phase === 'upgrade' && run.isLeader) {`,
  `    } else if (['combat', 'boss'].includes(run.phase) && run.viewer?.hp > 0) {\n      const viewer = run.viewer;\n      const cooldowns = viewer.cooldowns || {};\n      const powerCost = Math.max(1, Number(run.runModifiers?.powerStrikeCost || 2));\n      const counter = run.enemyIntent?.counter || null;\n      const state = document.createElement('span');\n      state.className = 'stream-action-state';\n      state.dataset.testid = 'combat-resource-state';\n      const cooling = Object.entries(cooldowns).filter(([, value]) => Number(value) > 0).map(([skill, value]) => \`${'${'}skill === 'powerStrike' ? 'Power' : skill} ${'${'}value}\`).join(' · ');\n      state.textContent = \`FOCUS ${'${'}viewer.focus}/${'${'}viewer.maxFocus}${'${'}cooling ? \` · CD ${'${'}cooling}\` : ''}\`;\n      suggestionsEl.append(state);\n\n      addSuggestion('Attack · +1 Focus', '/attack', { primary: !counter, testId: 'stream-attack' });\n      addSuggestion(\`Power Strike · ${'${'}powerCost} Focus${'${'}cooldowns.powerStrike ? \` · CD ${'${'}cooldowns.powerStrike}\` : ''}\`, '/power', {\n        primary: counter === 'power-strike', counter: counter === 'power-strike', testId: 'stream-power-strike',\n        disabled: Number(viewer.focus) < powerCost || Number(cooldowns.powerStrike || 0) > 0,\n        title: Number(viewer.focus) < powerCost ? \`Build ${'${'}powerCost} Focus first.\` : '',\n      });\n      addSuggestion(\`${'${'}counter === 'guard' ? 'Counter: ' : ''}Guard${'${'}cooldowns.guard ? \` · CD ${'${'}cooldowns.guard}\` : ''}\`, '/guard', {\n        primary: counter === 'guard', counter: counter === 'guard', testId: 'stream-guard', disabled: Number(cooldowns.guard || 0) > 0,\n      });\n      if (run.enemyIntent?.counter === 'interrupt') addSuggestion(\`Counter: Interrupt ${'${'}run.enemyIntent.name}${'${'}cooldowns.interrupt ? \` · CD ${'${'}cooldowns.interrupt}\` : ''}\`, '/interrupt', {\n        primary: true, counter: true, testId: 'stream-interrupt', disabled: Number(cooldowns.interrupt || 0) > 0,\n      });\n      if (run.participants.some((p) => p.hp > 0 && p.hp < p.maxHp)) addSuggestion(\`Mend ally${'${'}cooldowns.mend ? \` · CD ${'${'}cooldowns.mend}\` : ''}\`, '/mend', {\n        testId: 'stream-mend', disabled: Number(cooldowns.mend || 0) > 0,\n      });\n      if (viewer.reviveCharges > 0 && run.participants.some((p) => p.hp <= 0)) addSuggestion('Revive ally', '/revive', { testId: 'stream-revive' });\n    } else if (run.phase === 'upgrade' && run.isLeader) {`,
);
await replaceOnce(
  'public/adventure-stream.js',
  "      ? `You ${run.viewer.hp}/${run.viewer.maxHp} HP · ${run.enemy?.hp ?? 0}/${run.enemy?.maxHp ?? 0} enemy HP · Auto Strike ON`",
  "      ? `You ${run.viewer.hp}/${run.viewer.maxHp} HP · Focus ${run.viewer.focus}/${run.viewer.maxFocus} · ${run.enemy?.hp ?? 0}/${run.enemy?.maxHp ?? 0} enemy HP · explicit actions only`",
);
await replaceOnce(
  'public/adventure-stream.js',
  "      intent.textContent = `${run.enemyIntent.name} incoming · ${run.enemyIntent.damage} damage`;",
  "      intent.textContent = `${run.enemyIntent.name} incoming · ${run.enemyIntent.kind === 'fortify' ? 'armor stance' : `${run.enemyIntent.damage} damage`} · Counter with ${run.enemyIntent.counterLabel || run.enemyIntent.counter}`;",
);
await replaceOnce(
  'public/adventure-stream.js',
  `    const matching = suggestionsEl.querySelectorAll('button[data-command^="/attack"], button[data-command^="/guard"], button[data-command^="/interrupt"], button[data-command^="/mend"], button[data-command^="/revive"]');`,
  `    const matching = suggestionsEl.querySelectorAll('button[data-command^="/attack"], button[data-command^="/power"], button[data-command^="/guard"], button[data-command^="/interrupt"], button[data-command^="/mend"], button[data-command^="/revive"]');`,
);
await replaceOnce(
  'public/adventure-stream.js',
  "          commandCardEl.insertAdjacentHTML('beforeend', '<p><strong>/status</strong> HP + enemy · <strong>/gear</strong> equip/salvage · <strong>/party</strong> co-op · <strong>/codex</strong> search · <strong>/attack</strong> <strong>/guard</strong> <strong>/interrupt</strong> during combat.</p>');",
  "          commandCardEl.insertAdjacentHTML('beforeend', '<p><strong>/status</strong> HP + Focus + enemy · <strong>/gear</strong> equip/salvage · <strong>/party</strong> co-op · <strong>/codex</strong> search · <strong>/attack</strong> <strong>/power</strong> <strong>/guard</strong> <strong>/interrupt</strong> during combat.</p>');",
);
await replaceOnce(
  'public/adventure-stream.js',
  "        case '/attack': await runCombatAction('attack'); break;\n        case '/guard':",
  "        case '/attack': await runCombatAction('attack'); break;\n        case '/power':\n        case '/power-strike': await runCombatAction('power-strike'); break;\n        case '/guard':",
);

await replaceOnce(
  'public/game.js',
  `function renderIntent(run) {\n  clearInterval(intentTicker);\n  intentTicker = null;\n  if (!run.enemyIntent) return;\n  const intent = document.createElement('div');\n  intent.className = 'enemy-intent';\n  intent.dataset.testid = 'enemy-intent';\n  intent.innerHTML = \`<div><span>ENEMY TELEGRAPH</span><strong>${'${'}run.enemyIntent.name}</strong><small>${'${'}run.enemyIntent.damage} incoming damage · answer from the thread</small></div><div class="intent-timer" data-testid="intent-timer"></div>\`;\n  dungeonEl.append(intent);\n  const timer = intent.querySelector('[data-testid="intent-timer"]');\n  const draw = () => {\n    const left = Math.max(0, new Date(run.enemyIntent.dueAt).getTime() - Date.now());\n    timer.textContent = \`${'${'}(left / 1000).toFixed(1)}s\`;\n    timer.style.setProperty('--intent-progress', \`${'${'}Math.min(100, (left / 3000) * 100)}%\`);\n  };\n  draw();\n  intentTicker = setInterval(draw, 100);\n}`,
  `function renderIntent(run) {\n  clearInterval(intentTicker);\n  intentTicker = null;\n  if (!run.enemyIntent) return;\n  const intent = document.createElement('div');\n  intent.className = \`enemy-intent counter-${'${'}run.enemyIntent.counter || 'interrupt'}\`;\n  intent.dataset.testid = 'enemy-intent';\n  const payload = run.enemyIntent.kind === 'fortify' ? 'fortifies for the next hits' : \`${'${'}run.enemyIntent.damage} incoming damage\`;\n  intent.innerHTML = \`<div><span>ENEMY TELEGRAPH</span><strong>${'${'}run.enemyIntent.name}</strong><small>${'${'}payload} · <b>Counter: ${'${'}run.enemyIntent.counterLabel || run.enemyIntent.counter}</b></small><em>${'${'}run.enemyIntent.hint || 'Answer from the thread.'}</em></div><div class="intent-timer" data-testid="intent-timer"></div>\`;\n  dungeonEl.append(intent);\n  const timer = intent.querySelector('[data-testid="intent-timer"]');\n  const draw = () => {\n    const left = Math.max(0, new Date(run.enemyIntent.dueAt).getTime() - Date.now());\n    timer.textContent = \`${'${'}(left / 1000).toFixed(1)}s\`;\n    timer.style.setProperty('--intent-progress', \`${'${'}Math.min(100, (left / 4500) * 100)}%\`);\n  };\n  draw();\n  intentTicker = setInterval(draw, 100);\n}`,
);
await replaceOnce(
  'public/game.js',
  `    row.innerHTML = \`<div class="participant-head"><span></span><span>HP ${'${'}participant.hp}/${'${'}participant.maxHp}</span></div>${'${'}progressBar(participant.hp, participant.maxHp)}<div class="participant-stats">damage ${'${'}participant.contributionDamage} · healing ${'${'}participant.healingDone} · revives ${'${'}participant.revives} · prevented ${'${'}participant.damagePrevented}</div>\`;`,
  `    row.innerHTML = \`<div class="participant-head"><span></span><span>HP ${'${'}participant.hp}/${'${'}participant.maxHp}</span></div>${'${'}progressBar(participant.hp, participant.maxHp)}<div class="participant-stats">Focus ${'${'}participant.focus}/${'${'}participant.maxFocus} · damage ${'${'}participant.contributionDamage} · healing ${'${'}participant.healingDone} · revives ${'${'}participant.revives} · prevented ${'${'}participant.damagePrevented}${'${'}participant.riposteBonus ? \` · Riposte +${'${'}participant.riposteBonus}\` : ''}</div>\`;`,
);
await replaceOnce(
  'public/game.js',
  `'<div class="combat-coach" data-testid="combat-coach"><strong>Your turn is waiting in the thread.</strong><span>Attack, Guard, Interrupt, Mend, or Revive there. Nothing attacks automatically.</span></div><p class="muted" data-testid="combat-help">Every combat action is explicit and server-authoritative; the shared thread records the result.</p>'`,
  `'<div class="combat-coach" data-testid="combat-coach"><strong>Your turn is waiting in the thread.</strong><span>Attack builds Focus. Spend it on Power Strike, or answer telegraphs with Guard and Interrupt. Mend and Revive keep the party moving. Nothing attacks automatically.</span></div><p class="muted" data-testid="combat-help">Every combat action is explicit and server-authoritative; the shared thread records the result.</p>'`,
);

await replaceOnce(
  'public/adventure-meta-commands.js',
  '    .stream-action-interrupt .stream-rich-kicker { color:var(--gold); }',
  `    .stream-action-interrupt .stream-rich-kicker, .stream-action-power-strike .stream-rich-kicker { color:var(--gold); }\n    .stream-action-power-strike { border-color:rgba(255,209,102,.32); box-shadow:inset 3px 0 0 rgba(255,209,102,.82),0 8px 24px rgba(0,0,0,.14); }\n    .stream-action-state { flex:1 0 100%; padding:4px 7px; border-radius:8px; color:var(--cyan); background:rgba(85,214,255,.07); font-size:.63rem; font-weight:900; letter-spacing:.06em; }\n    .stream-suggestions button.is-counter { box-shadow:0 0 0 2px rgba(255,209,102,.38),0 7px 18px rgba(0,0,0,.2); }\n    .stream-suggestions button:disabled { opacity:.46; cursor:not-allowed; }`,
);
await replaceOnce(
  'public/adventure-meta-commands.js',
  "      attack: ['⚔', 'ATTACK'],\n      guard:",
  "      attack: ['⚔', 'ATTACK'],\n      'power-strike': ['✹', 'POWER STRIKE'],\n      guard:",
);
await replaceOnce(
  'public/adventure-meta-commands.js',
  "    if (action === 'attack') summary = defeated ? `${actor} attacked ${titleize(metadata.defeatedEnemyId)} for ${damage} and defeated it.` : `${actor} attacked ${enemy} for ${damage} damage.`;\n    else if (action === 'guard')",
  "    if (action === 'attack') summary = defeated ? `${actor} attacked ${titleize(metadata.defeatedEnemyId)} for ${damage} and defeated it.` : `${actor} attacked ${enemy} for ${damage} damage.`;\n    else if (action === 'power-strike') summary = defeated ? `${actor} Power Struck ${titleize(metadata.defeatedEnemyId)} for ${damage} and defeated it.` : `${actor} Power Struck ${enemy} for ${damage} damage.`;\n    else if (action === 'guard')",
);
await replaceOnce(
  'public/adventure-meta-commands.js',
  "    if (presentation.action === 'attack' && presentation.damage > 0) chips.append(resultChip(`⚔ −${presentation.damage} ENEMY HP`, 'damage'));",
  "    if (['attack', 'power-strike'].includes(presentation.action) && presentation.damage > 0) chips.append(resultChip(`${presentation.action === 'power-strike' ? '✹' : '⚔'} −${presentation.damage} ENEMY HP`, 'damage'));",
);
await replaceOnce(
  'public/adventure-meta-commands.js',
  "    if (metadata.interruptedIntentId || presentation.action === 'interrupt') chips.append(resultChip('⚡ INTERRUPTED', 'special'));\n    if (presentation.defeated)",
  "    if (metadata.focusGained > 0) chips.append(resultChip(`✦ +${metadata.focusGained} FOCUS`, 'guard'));\n    if (metadata.focusSpent > 0) chips.append(resultChip(`✹ −${metadata.focusSpent} FOCUS`, 'special'));\n    if (metadata.interruptedIntentId || presentation.action === 'interrupt') chips.append(resultChip('⚡ INTERRUPTED', 'special'));\n    if (metadata.counteredIntentId) chips.append(resultChip(`✓ COUNTERED${metadata.counterAction ? ` · ${String(metadata.counterAction).toUpperCase()}` : ''}`, 'special'));\n    if (metadata.staggered || metadata.enemyStaggeredHits > 0) chips.append(resultChip('✦ STAGGERED · NEXT HIT BOOSTED', 'special'));\n    if (metadata.ripostePrimed > 0) chips.append(resultChip(`↩ RIPOSTE +${metadata.ripostePrimed}`, 'guard'));\n    if (metadata.enemyFortifiedHits > 0) chips.append(resultChip(`🛡 ENEMY FORTIFIED ×${metadata.enemyFortifiedHits}`, 'guard'));\n    if (presentation.defeated)",
);
await replaceOnce(
  'public/adventure-meta-commands.js',
  "      intent.textContent = `⚠ ${metadata.enemyIntent.name || 'Heavy attack'} incoming${intentDamage === null ? '' : ` · ${intentDamage} DMG`}`;",
  "      intent.textContent = `⚠ ${metadata.enemyIntent.name || 'Heavy action'} · ${metadata.enemyIntent.kind === 'fortify' ? 'ARMOR' : `${intentDamage ?? '?'} DMG`} · COUNTER: ${(metadata.enemyIntent.counterLabel || titleize(metadata.enemyIntent.counter)).toUpperCase()}`;",
);

console.log('Combat v2 presentation patches applied.');
