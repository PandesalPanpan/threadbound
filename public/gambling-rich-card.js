const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
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

  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const card = stream.querySelector('[data-testid="stream-command-card"]');
  const form = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const error = stream.querySelector('[data-testid="stream-error"]');

  // M10F-01: command surfaces are part of the Adventure Stream, not a private
  // panel below it. All existing rich-card modules share this stable node.
  if (log && card && card.parentElement !== log) log.append(card);

  const styles = document.createElement('style');
  styles.dataset.gamblingRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-gambling-rich-card="true"] { scroll-margin-top:76px; }
    .thread-gambling-shell { display:grid; gap:7px; }
    .thread-gambling-line { display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:0; }
    .thread-gambling-line strong { font-size:.82rem; }
    .thread-gambling-gold { color:var(--gold); font-weight:900; white-space:nowrap; }
    .thread-gambling-copy { margin:0; color:var(--muted); font-size:.68rem; line-height:1.4; }
    .thread-gambling-actions { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
    .thread-gambling-input { width:78px; min-height:44px; box-sizing:border-box; border:1px solid rgba(255,255,255,.14); border-radius:9px; background:rgba(3,8,18,.42); color:var(--text); padding:7px 9px; font-size:1rem; }
    .thread-gambling-button { min-height:44px; padding:8px 12px; border:1px solid rgba(255,255,255,.12); border-radius:9px; background:rgba(255,255,255,.035); color:var(--text); font-weight:800; cursor:pointer; }
    .thread-gambling-button.primary { border-color:rgba(255,209,102,.3); color:#ffe097; }
    .thread-gambling-button:disabled { opacity:.55; cursor:wait; }
    .thread-blackjack-state { display:grid; gap:3px; padding:2px 0; }
    .thread-blackjack-state div { color:var(--muted); font-size:.7rem; line-height:1.4; }
    .thread-blackjack-state strong { color:var(--text); }
    .thread-gambling-result { margin:0; color:var(--muted); font-size:.7rem; line-height:1.4; }
    .thread-gambling-result.win { color:var(--positive,#73dfa7); }
    .thread-gambling-result.loss { color:var(--danger,#ff7080); }
    @media (max-width:420px) {
      .thread-gambling-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
      .thread-gambling-actions.menu { grid-template-columns:1fr; }
      .thread-gambling-input { width:100%; }
      .thread-gambling-button { width:100%; }
    }
  `;
  document.head.append(styles);

  let busy = false;
  let view = 'menu';
  let blackjackState = null;
  let carriedGold = 0;
  let resultText = '';
  let resultTone = '';

  function showError(message = '') {
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  function key(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

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

  async function waitForStreamEntry(entryId) {
    if (!entryId || !log) return;
    const hasEntry = () => [...log.querySelectorAll('[data-entry-id]')].some((node) => node.dataset.entryId === entryId);
    if (hasEntry()) return;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(() => { if (hasEntry()) finish(); });
      observer.observe(log, { childList: true, subtree: true });
      const timer = setTimeout(finish, 450);
    });
  }

  async function recordPlayerAction(body) {
    const payload = await api('/api/stream/messages', {
      method: 'POST',
      body: JSON.stringify({ body: String(body || '').trim() }),
    });
    await waitForStreamEntry(payload.entry?.id);
  }

  function outcomeText(wager, payoutGold) {
    const delta = Number(payoutGold || 0) - Number(wager || 0);
    if (delta > 0) return `+${delta} Gold`;
    if (delta < 0) return `−${Math.abs(delta)} Gold`;
    return '±0 Gold';
  }

  function title(value) {
    const text = String(value || '');
    return text ? text[0].toUpperCase() + text.slice(1) : '';
  }

  function setBusy(value) {
    busy = value;
    for (const button of card?.querySelectorAll('.thread-gambling-button') || []) button.disabled = value;
  }

  function button(label, action, { primary = false, testId = null } = {}) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = `thread-gambling-button${primary ? ' primary' : ''}`;
    control.textContent = label;
    if (testId) control.dataset.testid = testId;
    control.addEventListener('click', async () => {
      if (busy) return;
      setBusy(true);
      showError('');
      try {
        await action();
      } catch (caught) {
        showError(caught.message);
      } finally {
        setBusy(false);
      }
    });
    return control;
  }

  function header(titleText) {
    const wrap = document.createElement('div');
    wrap.className = 'thread-reply-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'THREADBOUND';
    const heading = document.createElement('strong');
    heading.textContent = titleText;
    copy.append(kicker, heading);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss Threadbound response');
    close.textContent = '×';
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    wrap.append(copy, close);
    return wrap;
  }

  function wagerInput(testid) {
    const inputEl = document.createElement('input');
    inputEl.type = 'number';
    inputEl.min = '1';
    inputEl.max = '100';
    inputEl.step = '1';
    inputEl.value = '10';
    inputEl.inputMode = 'numeric';
    inputEl.className = 'thread-gambling-input';
    inputEl.dataset.testid = testid;
    inputEl.setAttribute('aria-label', 'Wager Gold');
    return inputEl;
  }

  function beginRender(kind, titleText) {
    if (!card) return null;
    if (log && card.parentElement !== log) log.append(card);
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'gambling';
    card.dataset.gamblingRichCard = 'true';
    card.dataset.gamblingView = kind;
    card.append(header(titleText));
    const shell = document.createElement('div');
    shell.className = 'thread-gambling-shell';
    card.append(shell);
    return shell;
  }

  function balanceLine(label) {
    const line = document.createElement('div');
    line.className = 'thread-gambling-line';
    const name = document.createElement('strong');
    name.textContent = label;
    const gold = document.createElement('span');
    gold.className = 'thread-gambling-gold';
    gold.dataset.testid = 'gambling-carried-gold';
    gold.textContent = `${carriedGold} Gold`;
    line.append(name, gold);
    return line;
  }

  async function choose(nextView, commandText = nextView) {
    await recordPlayerAction(commandText);
    view = nextView;
    resultText = '';
    resultTone = '';
    render();
  }

  function renderMenu() {
    const shell = beginRender('menu', 'Games');
    if (!shell) return;
    shell.append(balanceLine('Guild Hall'));
    const copy = document.createElement('p');
    copy.className = 'thread-gambling-copy';
    copy.textContent = 'Gold-only side games. Pick one.';
    shell.append(copy);
    const actions = document.createElement('div');
    actions.className = 'thread-gambling-actions menu';
    actions.append(
      button('Blackjack', () => choose('blackjack'), { testId: 'gambling-open-blackjack', primary: true }),
      button('Coinflip', () => choose('coinflip'), { testId: 'gambling-open-coinflip' }),
      button('Slots', () => choose('slots'), { testId: 'gambling-open-slots' }),
    );
    shell.append(actions);
  }

  function blackjackSummary(round) {
    const state = document.createElement('div');
    state.className = 'thread-blackjack-state';
    if (!round) {
      const copy = document.createElement('div');
      copy.textContent = 'Beat the dealer without going over 21.';
      state.append(copy);
      return state;
    }
    const player = document.createElement('div');
    player.innerHTML = `<strong>You</strong> ${round.playerHand.join(' ')} · ${round.playerScore}`;
    const dealer = document.createElement('div');
    const hidden = round.dealerHiddenCardCount ? ' ?' : '';
    dealer.innerHTML = `<strong>Dealer</strong> ${round.dealerHand.join(' ')}${hidden} · ${round.dealerScore}${round.dealerHiddenCardCount ? '+' : ''}`;
    state.append(player, dealer);
    return state;
  }

  function renderBlackjack() {
    const shell = beginRender('blackjack', 'Blackjack');
    if (!shell) return;
    shell.dataset.testid = 'gambling-blackjack';
    shell.append(balanceLine('Blackjack'));
    const round = blackjackState?.round || null;
    shell.append(blackjackSummary(round));
    const actions = document.createElement('div');
    actions.className = 'thread-gambling-actions';

    if (round?.status === 'active') {
      actions.append(
        button('Hit', async () => {
          await recordPlayerAction('hit');
          const payload = await api(`/api/gambling/blackjack/${encodeURIComponent(round.id)}/hit`, {
            method: 'POST', headers: { 'Idempotency-Key': key('blackjack-hit') },
          });
          blackjackState = payload.blackjack;
          carriedGold = Number(payload.blackjack.carriedGold || carriedGold);
          const resolved = payload.blackjack.round;
          if (resolved?.status !== 'active') {
            resultText = `${title(resolved.outcome)} · ${outcomeText(resolved.wager, resolved.payoutGold)}`;
            resultTone = Number(resolved.payoutGold || 0) >= Number(resolved.wager || 0) ? 'win' : 'loss';
          }
          render();
        }, { primary: true, testId: 'blackjack-hit' }),
        button('Stand', async () => {
          await recordPlayerAction('stand');
          const payload = await api(`/api/gambling/blackjack/${encodeURIComponent(round.id)}/stand`, {
            method: 'POST', headers: { 'Idempotency-Key': key('blackjack-stand') },
          });
          blackjackState = payload.blackjack;
          carriedGold = Number(payload.blackjack.carriedGold || carriedGold);
          const resolved = payload.blackjack.round;
          resultText = `${title(resolved.outcome)} · ${outcomeText(resolved.wager, resolved.payoutGold)}`;
          resultTone = Number(resolved.payoutGold || 0) >= Number(resolved.wager || 0) ? 'win' : 'loss';
          render();
        }, { testId: 'blackjack-stand' }),
      );
    } else {
      const wager = wagerInput('blackjack-wager');
      actions.append(wager, button('Deal', async () => {
        const amount = Number(wager.value);
        await recordPlayerAction(`blackjack ${amount}`);
        const payload = await api('/api/gambling/blackjack', {
          method: 'POST',
          headers: { 'Idempotency-Key': key('blackjack-deal') },
          body: JSON.stringify({ wager: amount }),
        });
        blackjackState = payload.blackjack;
        carriedGold = Number(payload.blackjack.carriedGold || carriedGold);
        const started = payload.blackjack.round;
        if (started?.status !== 'active') {
          resultText = `${title(started.outcome)} · ${outcomeText(started.wager, started.payoutGold)}`;
          resultTone = Number(started.payoutGold || 0) >= Number(started.wager || 0) ? 'win' : 'loss';
        } else {
          resultText = '';
          resultTone = '';
        }
        render();
      }, { primary: true, testId: 'blackjack-deal' }));
    }
    shell.append(actions);
    if (resultText) {
      const result = document.createElement('p');
      result.className = `thread-gambling-result ${resultTone}`.trim();
      result.textContent = resultText;
      shell.append(result);
    }
  }

  function renderCoinflip() {
    const shell = beginRender('coinflip', 'Coinflip');
    if (!shell) return;
    shell.dataset.testid = 'gambling-coinflip';
    shell.append(balanceLine('Coinflip'));
    const copy = document.createElement('p');
    copy.className = 'thread-gambling-copy';
    copy.textContent = 'Call it. Win returns 2× your wager.';
    shell.append(copy);
    const wager = wagerInput('coinflip-wager');
    const actions = document.createElement('div');
    actions.className = 'thread-gambling-actions';
    actions.append(wager);
    for (const choice of ['heads', 'tails']) {
      actions.append(button(title(choice), async () => {
        const amount = Number(wager.value);
        await recordPlayerAction(`coinflip ${amount} ${choice}`);
        const payload = await api('/api/gambling/coinflip', {
          method: 'POST', headers: { 'Idempotency-Key': key(`coinflip-${choice}`) }, body: JSON.stringify({ wager: amount, choice }),
        });
        carriedGold = Number(payload.coinflip.carriedGold || carriedGold);
        const flip = payload.coinflip.flip;
        resultText = `${title(flip.result)} · ${title(flip.outcome)} · ${outcomeText(flip.wager, flip.payoutGold)}`;
        resultTone = flip.outcome === 'win' ? 'win' : 'loss';
        render();
      }, { primary: choice === 'heads', testId: `coinflip-${choice}` }));
    }
    shell.append(actions);
    if (resultText) {
      const result = document.createElement('p');
      result.className = `thread-gambling-result ${resultTone}`.trim();
      result.textContent = resultText;
      shell.append(result);
    }
  }

  function renderSlots() {
    const shell = beginRender('slots', 'Slots');
    if (!shell) return;
    shell.dataset.testid = 'gambling-slots';
    shell.append(balanceLine('Slots'));
    const copy = document.createElement('p');
    copy.className = 'thread-gambling-copy';
    copy.textContent = 'Three reels. Pairs refund; triples pay more.';
    shell.append(copy);
    const wager = wagerInput('slots-wager');
    const actions = document.createElement('div');
    actions.className = 'thread-gambling-actions';
    actions.append(wager, button('Spin', async () => {
      const amount = Number(wager.value);
      await recordPlayerAction(`slots ${amount}`);
      const payload = await api('/api/gambling/slots', {
        method: 'POST', headers: { 'Idempotency-Key': key('slots-spin') }, body: JSON.stringify({ wager: amount }),
      });
      carriedGold = Number(payload.slots.carriedGold || carriedGold);
      const spin = payload.slots.spin;
      resultText = `${spin.reels.map(title).join(' · ')} · ${title(spin.outcome)} · ${outcomeText(spin.wager, spin.payoutGold)}`;
      resultTone = Number(spin.payoutGold || 0) >= Number(spin.wager || 0) ? 'win' : 'loss';
      render();
    }, { primary: true, testId: 'slots-spin' }));
    shell.append(actions);
    if (resultText) {
      const result = document.createElement('p');
      result.className = `thread-gambling-result ${resultTone}`.trim();
      result.textContent = resultText;
      shell.append(result);
    }
  }

  function render() {
    if (view === 'blackjack') renderBlackjack();
    else if (view === 'coinflip') renderCoinflip();
    else if (view === 'slots') renderSlots();
    else renderMenu();
    requestAnimationFrame(() => requestAnimationFrame(() => card?.scrollIntoView({ block: 'nearest', inline: 'nearest' })));
  }

  async function open(command, rawText) {
    showError('');
    await recordPlayerAction(rawText);
    const payload = await api('/api/gambling');
    blackjackState = payload.blackjack;
    carriedGold = Number(payload.blackjack?.carriedGold || 0);
    view = command;
    resultText = '';
    resultTone = '';
    render();
  }

  function installComposerIntercept() {
    if (!form || !input || form.dataset.gamblingCommandInstalled === 'true') return false;
    form.dataset.gamblingCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const raw = String(input.value || '').trim();
      const value = raw.toLowerCase().replace(/^\//, '');
      const aliases = new Map([
        ['gambling', 'menu'], ['casino', 'menu'],
        ['blackjack', 'blackjack'], ['coinflip', 'coinflip'], ['slots', 'slots'],
      ]);
      if (!aliases.has(value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      open(aliases.get(value), raw).catch((caught) => showError(caught.message));
    }, true);
    return true;
  }

  installComposerIntercept();
}
