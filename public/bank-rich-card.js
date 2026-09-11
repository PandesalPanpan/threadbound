const stream = document.querySelector('#stream');

if (stream) {
  const style = document.createElement('style');
  style.dataset.bankRichCardStyles = 'true';
  style.textContent = `
    .stream-command-card[data-bank-rich-card="true"] { scroll-margin-top:76px; }
    .thread-bank-balances { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .thread-bank-balance { display:grid; gap:3px; padding:11px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:rgba(255,255,255,.035); }
    .thread-bank-balance span { color:var(--muted); font-size:.66rem; font-weight:900; letter-spacing:.07em; text-transform:uppercase; }
    .thread-bank-balance strong { font-size:1.15rem; font-variant-numeric:tabular-nums; }
    .thread-bank-transfer { display:grid; grid-template-columns:minmax(0,1fr) repeat(2,auto); gap:7px; align-items:end; }
    .thread-bank-transfer label { display:grid; gap:4px; color:var(--muted); font-size:.68rem; font-weight:800; }
    .thread-bank-transfer input { width:100%; min-height:44px; box-sizing:border-box; }
    .thread-bank-transfer button { min-height:44px; margin:0 !important; }
    .thread-bank-note { margin:0; color:var(--muted); font-size:.7rem; line-height:1.4; }
    @media (max-width:480px) {
      .thread-bank-transfer { grid-template-columns:1fr 1fr; }
      .thread-bank-transfer label { grid-column:1 / -1; }
      .thread-bank-transfer button { width:100%; }
    }
  `;
  document.head.append(style);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    });
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

  function balanceCell(label, value, testId) {
    const cell = document.createElement('div');
    cell.className = 'thread-bank-balance';
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = `${value} Gold`;
    amount.dataset.testid = testId;
    cell.append(name, amount);
    return cell;
  }

  async function recordReceipt(result) {
    const verb = result.action === 'deposit' ? 'Deposited' : 'Withdrew';
    const direction = result.action === 'deposit' ? 'into the Bank' : 'from the Bank';
    await api('/api/stream/messages', {
      method: 'POST',
      body: JSON.stringify({ body: `🏦 ${verb} ${result.amount} Gold ${direction} · ${result.carriedGold} carried · ${result.bankedGold} banked` }),
    });
  }

  function header(card, balance) {
    const wrap = document.createElement('div');
    wrap.className = 'thread-reply-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'PRIVATE THREAD REPLY · /bank';
    const title = document.createElement('strong');
    title.textContent = 'Bank';
    const small = document.createElement('small');
    small.textContent = `${balance.carriedGold} carried · ${balance.bankedGold} banked`;
    copy.append(kicker, title, small);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'thread-reply-close';
    close.setAttribute('aria-label', 'Dismiss Bank panel');
    close.textContent = '×';
    close.addEventListener('click', () => { card.hidden = true; card.innerHTML = ''; });
    wrap.append(copy, close);
    return wrap;
  }

  async function renderBank() {
    const card = stream.querySelector('[data-testid="stream-command-card"]');
    if (!card) return;
    showError('');
    const shop = await api('/api/shop');
    const balance = shop.bank || { carriedGold: shop.currency?.balance || 0, bankedGold: 0 };
    card.hidden = false;
    card.innerHTML = '';
    card.dataset.richCardKind = 'bank';
    card.dataset.bankRichCard = 'true';
    card.append(header(card, balance));

    const balances = document.createElement('div');
    balances.className = 'thread-bank-balances';
    balances.append(
      balanceCell('Carried Gold', balance.carriedGold, 'bank-carried-gold'),
      balanceCell('Banked Gold', balance.bankedGold, 'bank-banked-gold'),
    );
    card.append(balances);

    const transfer = document.createElement('div');
    transfer.className = 'thread-bank-transfer rich-chat-card-actions';
    const label = document.createElement('label');
    label.textContent = 'Gold amount';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.inputMode = 'numeric';
    input.placeholder = '10';
    input.dataset.testid = 'bank-amount';
    label.append(input);

    const run = async (action) => {
      const amount = Math.floor(Number(input.value));
      if (!Number.isInteger(amount) || amount <= 0) throw new Error('Enter a positive whole number of Gold.');
      const payload = await api(`/api/shop/purchases/bank-${action}-${amount}`, { method: 'POST' });
      await recordReceipt(payload.purchase);
      await renderBank();
    };
    const actionButton = (labelText, action, testId) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rich-chat-card-action';
      button.dataset.richCardAction = 'true';
      button.dataset.testid = testId;
      button.textContent = labelText;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await run(action); } catch (error) { showError(error.message); }
        finally { button.disabled = false; }
      });
      return button;
    };
    transfer.append(label, actionButton('Deposit', 'deposit', 'bank-deposit'), actionButton('Withdraw', 'withdraw', 'bank-withdraw'));
    card.append(transfer);

    const note = document.createElement('p');
    note.className = 'thread-bank-note';
    note.textContent = 'Banked Gold is stored separately from carried Gold and is reserved for the protected balance used by later death rules.';
    card.append(note);
    card.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  function installComposerIntercept() {
    const form = stream.querySelector('[data-testid="stream-composer"]');
    const input = stream.querySelector('[data-testid="stream-message"]');
    if (!form || !input || form.dataset.bankCommandInstalled === 'true') return false;
    form.dataset.bankCommandInstalled = 'true';
    form.addEventListener('submit', (event) => {
      const value = String(input.value || '').trim().toLowerCase();
      if (!['bank', '/bank'].includes(value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      renderBank().catch((error) => showError(error.message));
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
