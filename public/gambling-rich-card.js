const stream = document.querySelector('[data-testid="adventure-stream"]');

if (stream) {
  const styles = document.createElement('style');
  styles.dataset.gamblingRichCardStyles = 'true';
  styles.textContent = `
    .stream-command-card[data-gambling-rich-card="true"] { scroll-margin-top:76px; }
    .thread-gambling-balance { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border:1px solid rgba(255,209,102,.24); border-radius:12px; background:rgba(255,209,102,.07); }
    .thread-gambling-balance span { color:var(--muted); font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
    .thread-gambling-balance strong { color:var(--gold); font-size:1rem; }
    .thread-gambling-grid { display:grid; gap:10px; margin-top:10px; }
    .thread-gambling-game { display:grid; gap:9px; padding:11px; border:1px solid rgba(255,255,255,.09); border-radius:12px; background:rgba(8,14,28,.62); }
    .thread-gambling-title { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .thread-gambling-title strong { font-size:.88rem; }
    .thread-gambling-title small { color:var(--muted); font-size:.62rem; line-height:1.35; text-align:right; }
    .thread-gambling-controls { display:flex; flex-wrap:wrap; gap:7px; align-items:end; }
    .thread-gambling-field { display:grid; gap:4px; min-width:90px; flex:1 1 100px; }
    .thread-gambling-field label { color:var(--muted); font-size:.6rem; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
    .thread-gambling-field input { width:100%; min-height:44px; box-sizing:border-box; border:1px solid rgba(255,255,255,.14); border-radius:10px; background:rgba(3,8,18,.7); color:var(--text); padding:8px 10px; }
    .thread-gambling-button { min-height:44px; padding:8px 12px; border:1px solid rgba(85,214,255,.28); border-radius:10px; background:rgba(85,214,255,.08); color:#8fe9ff; font-weight:900; cursor:pointer; }
    .thread-gambling-button.gold { border-color:rgba(255,209,102,.3); background:rgba(255,209,102,.08); color:#ffe097; }
    .thread-gambling-button:disabled { opacity:.55; cursor:wait; }
    .thread-gambling-result { min-height:20px; color:var(--muted); font-size:.69rem; line-height:1.45; }
    .thread-gambling-result strong { color:var(--text); }
    .thread-blackjack-hand { display:flex; flex-wrap:wrap; gap:5px; }
    .thread-playing-card { display:inline-flex; align-items:center; justify-content:center; min-width:32px; min-height:42px; padding:4px 6px; border-radius:7px; background:#f4f2ea; color:#15171d; font-size:.72rem; font-weight:950; box-shadow:0 2px 7px rgba(0,0,0,.24); }
    .thread-slot-reels { display:flex; gap:6px; font-weight:950; color:var(--text); }
    .thread-gambling-note { margin:8px 0 0; color:var(--muted); font-size:.64rem; line-height:1.45; }
    @media (max-width:420px) {
      .thread-gambling-controls { display:grid; grid-template-columns:1fr 1fr; align-items:end; }
      .thread-gambling-field { min-width:0; }
      .thread-gambling-controls .thread-gambling-field:first-child { grid-column:1 / -1; }
      .thread-gambling-button { width:100%; }
    }
  `;
  document.head.append(styles);

  let busy = false;
  let lastState = null;

  function showError(message = '') {
    const error = stream.querySelector('[data-testid="stream-error"]');
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

  function header(card) {
    const wrap = document.createElement('div');
    wrap.className = 'thread-reply-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'PRIVATE THREAD REPLY · /gambling';
    const heading = document.createElement('strong');
    heading.textContent = 'Guild Hall Games';
    const small = document.createElement('small');
    small.textContent = 'Gold-only side activities · outcomes are server authoritative';
    copy.append(kicker, heading, small);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss gambling panel');
    close.textContent = '×';
    close.addEventListener('click', () => {
      card.hidden = true;
      card.innerHTML = '';
    });
    wrap.append(copy, close);
    return wrap;
  }

  function wagerField(testid) {
    const field = document.createElement('div');
    field.className = 'thread-gambling-field';
    const label = document.createElement('label');
    label.textContent = 'Wager Gold';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.value = '10';
    input.inputMode = 'numeric';
    input.dataset.testid = testid;
    label.htmlFor = testid;
    input.id = testid;
    field.append(label, input);
    return { field, input };
  }

  function gameSection(title, subtitle, testid) {
    const section = document.createElement('section');
    section.className = 'thread-gambling-game';
    section.dataset.testid = testid;
    const titleRow = document.createElement('div');
    titleRow.className = 'thread-gambling-title';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const small = document.createElement('small');
    small.textContent = subtitle;
    titleRow.append(strong, small);
    const result = document.createElement('div');
    result.className = 'thread-gambling-result';
    section.append(titleRow);
    return { section, result };
  }

  function setBusy(value) {
    busy = value;
    for (const button of stream.querySelectorAll('.thread-gambling-button')) button.disabled = value;
  }

  function outcomeText(wager, payoutGold) {
    const delta = Number(payoutGold || 0) - Number(wager || 0);
    if (delta > 0) return `+${delta} Gold`;
    if (delta < 0) return `−${Math.abs(delta)} Gold`;
    return '±0 Gold';
  }

  function blackjackResult(result) {
    const round = result?.round;
    if (!round) return 'No active round. Deal a hand to begin.';
    const dealer = `${round.dealerHand.join(' ')}${round.dealerHiddenCardCount ? ' + hidden card' : ''}`;
    if (round.status === 'active') return `Hand ${round.playerHand.join(' ')} = ${round.playerScore} · Dealer ${dealer} = ${round.dealerScore} · ${round.wager} Gold wager.`;
    return `${String(round.outcome).toUpperCase()} · Hand ${round.playerScore} vs Dealer ${round.dealerScore} · ${outcomeText(round.wager, round.payoutGold)}.`;
  }

  async function openCard() {
    try {
      showError('');
      const payload = await api('/api/gambling');
      lastState = payload.blackjack;
      render(payload.blackjack);
    } catch (error) {
      showError(error.message);
    }
  }

  function render(blackjackState = lastState) {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    lastState = blackjackState || lastState;
    const carriedGold = Number(lastState?.carriedGold || 0);
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'gambling';
    card.dataset.gamblingRichCard = 'true';
    card.append(header(card));

    const balance = document.createElement('div');
    balance.className = 'thread-gambling-balance';
    balance.dataset.testid = 'gambling-carried-gold';
    const balanceLabel = document.createElement('span');
    balanceLabel.textContent = 'Carried Gold';
    const balanceValue = document.createElement('strong');
    balanceValue.textContent = String(carriedGold);
    balance.append(balanceLabel, balanceValue);
    card.append(balance);

    const grid = document.createElement('div');
    grid.className = 'thread-gambling-grid';

    const bj = gameSection('Blackjack', 'Beat the dealer without going over 21.', 'gambling-blackjack');
    const bjControls = document.createElement('div');
    bjControls.className = 'thread-gambling-controls';
    const bjWager = wagerField('blackjack-wager');
    const deal = document.createElement('button');
    deal.type = 'button';
    deal.className = 'thread-gambling-button gold';
    deal.dataset.testid = 'blackjack-deal';
    deal.textContent = 'Deal';
    deal.addEventListener('click', async () => {
      if (busy) return;
      setBusy(true);
      try {
        const payload = await api('/api/gambling/blackjack', {
          method: 'POST', headers: { 'Idempotency-Key': key('blackjack-deal') }, body: JSON.stringify({ wager: Number(bjWager.input.value) }),
        });
        lastState = payload.blackjack;
        render(lastState);
      } catch (error) { showError(error.message); setBusy(false); }
    });
    bjControls.append(bjWager.field, deal);
    const round = lastState?.round;
    if (round?.status === 'active') {
      for (const action of ['hit', 'stand']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'thread-gambling-button';
        button.dataset.testid = `blackjack-${action}`;
        button.textContent = action === 'hit' ? 'Hit' : 'Stand';
        button.addEventListener('click', async () => {
          if (busy) return;
          setBusy(true);
          try {
            const payload = await api(`/api/gambling/blackjack/${encodeURIComponent(round.id)}/${action}`, {
              method: 'POST', headers: { 'Idempotency-Key': key(`blackjack-${action}`) },
            });
            lastState = payload.blackjack;
            render(lastState);
          } catch (error) { showError(error.message); setBusy(false); }
        });
        bjControls.append(button);
      }
    }
    bj.result.textContent = blackjackResult(lastState);
    bj.section.append(bjControls, bj.result);
    grid.append(bj.section);

    const cf = gameSection('Coinflip', 'Call Heads or Tails. Win returns 2× the wager.', 'gambling-coinflip');
    const cfControls = document.createElement('div');
    cfControls.className = 'thread-gambling-controls';
    const cfWager = wagerField('coinflip-wager');
    cfControls.append(cfWager.field);
    for (const choice of ['heads', 'tails']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'thread-gambling-button';
      button.dataset.testid = `coinflip-${choice}`;
      button.textContent = title(choice);
      button.addEventListener('click', async () => {
        if (busy) return;
        setBusy(true);
        try {
          const payload = await api('/api/gambling/coinflip', {
            method: 'POST', headers: { 'Idempotency-Key': key(`coinflip-${choice}`) }, body: JSON.stringify({ wager: Number(cfWager.input.value), choice }),
          });
          lastState = { ...lastState, carriedGold: payload.coinflip.carriedGold };
          render(lastState);
        } catch (error) { showError(error.message); setBusy(false); }
      });
      cfControls.append(button);
    }
    cf.result.textContent = 'Choose a side to flip.';
    cf.section.append(cfControls, cf.result);
    grid.append(cf.section);

    const sl = gameSection('Slots', 'Three reels. Pairs refund the wager; triples pay more.', 'gambling-slots');
    const slControls = document.createElement('div');
    slControls.className = 'thread-gambling-controls';
    const slWager = wagerField('slots-wager');
    const spin = document.createElement('button');
    spin.type = 'button';
    spin.className = 'thread-gambling-button gold';
    spin.dataset.testid = 'slots-spin';
    spin.textContent = 'Spin';
    spin.addEventListener('click', async () => {
      if (busy) return;
      setBusy(true);
      try {
        const payload = await api('/api/gambling/slots', {
          method: 'POST', headers: { 'Idempotency-Key': key('slots-spin') }, body: JSON.stringify({ wager: Number(slWager.input.value) }),
        });
        lastState = { ...lastState, carriedGold: payload.slots.carriedGold };
        render(lastState);
      } catch (error) { showError(error.message); setBusy(false); }
    });
    slControls.append(slWager.field, spin);
    sl.result.textContent = 'Spin the reels for a Gold-only side bet.';
    sl.section.append(slControls, sl.result);
    grid.append(sl.section);

    card.append(grid);
    const note = document.createElement('p');
    note.className = 'thread-gambling-note';
    note.textContent = 'These activities use carried Gold only. Banked Gold and Honey are never wagered. Every play writes a public Adventure Stream receipt.';
    card.append(note);
    card.scrollIntoView({ block: 'start', inline: 'nearest' });
    setBusy(false);
  }

  function title(value) {
    const text = String(value || '');
    return text ? text[0].toUpperCase() + text.slice(1) : '';
  }

  function installComposerIntercept() {
    const form = stream.querySelector('[data-testid="stream-composer"]');
    const input = stream.querySelector('[data-testid="stream-message"]');
    if (!form || !input || form.dataset.gamblingCommandInstalled === 'true') return false;
    form.dataset.gamblingCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const value = String(input.value || '').trim().toLowerCase();
      if (!['gambling', '/gambling', 'casino', '/casino', 'blackjack', '/blackjack', 'coinflip', '/coinflip', 'slots', '/slots'].includes(value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      openCard();
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
