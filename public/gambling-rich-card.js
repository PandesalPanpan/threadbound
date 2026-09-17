import { createBlackjackCard } from './blackjack-card.js';

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

  const form = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const card = stream.querySelector('[data-testid="stream-command-card"]');
  const suggestions = stream.querySelector('[data-testid="stream-suggestions"]');
  const error = stream.querySelector('[data-testid="stream-error"]');
  let busy = false;
  let renderedRound = null;
  let renderingActions = false;

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

  async function waitForEntry(entryId) {
    if (!entryId || !log) return;
    const exists = () => Boolean(log.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`));
    if (exists()) return;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(() => { if (exists()) finish(); });
      observer.observe(log, { childList: true, subtree: true });
      const timer = setTimeout(finish, 700);
    });
  }

  async function recordPlayerAction(body) {
    const payload = await api('/api/stream/messages', {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    await waitForEntry(payload.entry?.id);
  }

  function el(tagName, className = '', text = undefined) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  function withTestId(element, testId) {
    if (testId) element.dataset.testid = testId;
    return element;
  }

  function gold(value) {
    return `${Math.max(0, Number(value) || 0)} Gold`;
  }

  function scorePill(score, testId = null, tone = '') {
    const pill = withTestId(el('span', `blackjack-score-pill${tone ? ` is-${tone}` : ''}`, score), testId);
    return pill;
  }

  function handArea({ label, cards = [], score = 0, hiddenCardCount = 0, result = false, testPrefix }) {
    const area = el('section', `blackjack-hand-area${result ? ' is-result' : ''}`);
    const header = el('div', 'blackjack-hand-header');
    const heading = el('strong', '', label);
    const scoreValue = hiddenCardCount ? `${score} + ?` : score;
    const scoreElement = scorePill(scoreValue, `${testPrefix}-score`, result && score > 21 ? 'loss' : '');
    header.append(heading, scoreElement);
    const cardsRow = el('div', 'blackjack-card-row');
    cards.forEach((cardCode, index) => cardsRow.append(createBlackjackCard(cardCode, { testId: `${testPrefix}-card-${index}` })));
    for (let index = cards.length; index < cards.length + hiddenCardCount; index += 1) {
      cardsRow.append(createBlackjackCard('', { hidden: true, testId: `${testPrefix}-card-${index}` }));
    }
    area.append(header, cardsRow);
    return area;
  }

  function setCardVisibility(visible) {
    if (!card) return;
    card.hidden = !visible;
    if (!visible) {
      card.innerHTML = '';
      delete card.dataset.richCardKind;
      delete card.dataset.simpleDungeonSurface;
      delete card.dataset.dungeonState;
      delete card.dataset.gamblingRichCard;
      delete card.dataset.gamblingView;
      delete card.dataset.gamblingRoundId;
      renderedRound = null;
      if (suggestions?.dataset.gamblingSuggestions === 'blackjack') {
        suggestions.innerHTML = '';
        delete suggestions.dataset.gamblingSuggestions;
      }
    }
  }

  function addAction(label, command, testId, { disabled = false, tone = 'blue', onClick = null } = {}) {
    const button = el('button', `blackjack-action is-${tone}`, label);
    button.type = 'button';
    button.dataset.command = command || '';
    button.dataset.blackjackAction = 'true';
    if (testId) button.dataset.testid = testId;
    button.disabled = disabled;
    if (disabled) button.title = 'This action is not available in the authoritative Blackjack rules.';
    if (onClick) button.addEventListener('click', onClick);
    else button.addEventListener('click', () => runCommand(command));
    suggestions?.append(button);
    return button;
  }

  function renderActions(round) {
    if (!suggestions) return;
    renderingActions = true;
    suggestions.innerHTML = '';
    suggestions.dataset.gamblingSuggestions = 'blackjack';
    suggestions.hidden = false;
    if (round.status === 'active') {
      addAction('Hit', '/hit', 'blackjack-action-hit', { tone: 'red' });
      addAction('Stand', '/stand', 'blackjack-action-stand', { tone: 'blue' });
      // The Figma action dock reserves this third slot, but the authoritative
      // projection only permits Hit and Stand, so keep the visual affordance
      // present without presenting an invented mutation.
      addAction('Double', '', 'blackjack-action-double', { disabled: true, tone: 'gold' });
      renderingActions = false;
      return;
    }
    addAction(`Play ${round.wager}`, `blackjack ${round.wager}`, 'blackjack-action-play', { tone: 'red' });
    addAction('Change bet', '', 'blackjack-action-change-bet', {
      tone: 'blue',
      onClick: () => {
        setCardVisibility(false);
        if (input) {
          input.value = 'blackjack ';
          input.focus({ preventScroll: true });
        }
      },
    });
    addAction('Leave', '', 'blackjack-action-leave', { tone: 'gold', onClick: () => setCardVisibility(false) });
    renderingActions = false;
  }

  function appendTableHeader(surface, round) {
    const header = el('div', 'blackjack-table-header');
    const copy = el('div', 'blackjack-table-copy');
    copy.append(el('strong', '', round.status === 'active' ? 'GUILD BLACKJACK' : 'HAND COMPLETE'));
    copy.append(el('small', '', round.status === 'active' ? 'Dealer stands on 17 · blackjack pays 3:2' : resultSubtitle(round)));
    const wager = el('span', 'blackjack-wager-pill', `WAGER ${round.wager}`);
    wager.dataset.testid = 'blackjack-wager';
    header.append(copy, wager);
    surface.append(header);
  }

  function resultSubtitle(round) {
    if (round.outcome === 'win') return round.dealerScore > 21 ? 'Dealer busts · You win' : 'You beat the dealer';
    if (round.outcome === 'loss') return round.playerScore > 21 ? 'You busted' : 'Dealer wins this hand';
    return 'Tie hand · wager returned';
  }

  function appendActiveSurface(surface, round, carriedGold) {
    const dealer = handArea({
      label: 'DEALER',
      cards: round.dealerHand,
      score: round.dealerScore,
      hiddenCardCount: round.dealerHiddenCardCount,
      testPrefix: 'blackjack-dealer',
    });
    const player = handArea({
      label: String(window.THREADBOUND_PLAYER_NAME || 'YOU').toUpperCase(),
      cards: round.playerHand,
      score: round.playerScore,
      testPrefix: 'blackjack-player',
    });
    const bankroll = el('div', 'blackjack-bankroll');
    bankroll.append(el('span', 'blackjack-bankroll-dot', '●'), el('strong', '', `Bankroll ${gold(carriedGold)}`), el('span', 'blackjack-bankroll-divider', '•'), el('span', '', `Risked ${gold(round.wager)}`), scorePill('YOUR TURN', 'blackjack-turn', 'turn'));
    const hint = el('div', 'blackjack-decision-hint');
    hint.append(el('span', 'blackjack-hint-dot', '●'), el('small', '', round.playerScore >= 17
      ? `${round.playerScore} is playable: Hit risks busting; Stand makes the dealer resolve.`
      : 'Choose Hit to draw or Stand to make the dealer resolve.'));
    hint.dataset.testid = 'blackjack-decision-hint';
    surface.append(dealer, player, bankroll, hint);
  }

  function appendResultSurface(surface, round, carriedGold) {
    const dealerTone = round.dealerScore > 21 ? 'loss' : '';
    const dealer = handArea({
      label: 'DEALER',
      cards: round.dealerHand,
      score: round.dealerScore,
      result: true,
      testPrefix: 'blackjack-dealer',
    });
    if (dealerTone) dealer.querySelector('[data-testid="blackjack-dealer-score"]')?.classList.add(dealerTone);
    const player = handArea({
      label: String(window.THREADBOUND_PLAYER_NAME || 'YOU').toUpperCase(),
      cards: round.playerHand,
      score: round.playerScore,
      result: true,
      testPrefix: 'blackjack-player',
    });
    const wager = Number(round.wager) || 0;
    const profit = (Number(round.payoutGold) || 0) - wager;
    const payout = el('div', 'blackjack-payout');
    const payoutRow = el('div', 'blackjack-payout-row');
    payoutRow.append(el('span', 'blackjack-bankroll-dot', '●'), el('strong', '', round.outcome === 'loss' ? '0 stake returned' : `${wager} stake returned`), el('strong', `is-${profit > 0 ? 'win' : profit < 0 ? 'loss' : 'push'}`, `${profit > 0 ? '+' : ''}${profit} profit`));
    const bankrollRow = el('div', 'blackjack-payout-row');
    bankrollRow.append(el('span', 'blackjack-payout-label', 'Bankroll'), el('strong', 'blackjack-payout-bankroll', gold(carriedGold)));
    payout.append(payoutRow, bankrollRow);
    const history = el('div', 'blackjack-history-note');
    history.append(el('span', 'blackjack-hint-dot', '●'), el('small', '', 'This wager, result and payout stay in the shared chat history.'));
    history.dataset.testid = 'blackjack-history-note';
    surface.append(dealer, player, payout, history);
  }

  function renderBlackjackState(state) {
    const round = state?.round;
    if (!card || !round) {
      setCardVisibility(false);
      if (suggestions?.dataset.gamblingSuggestions === 'blackjack') {
        suggestions.innerHTML = '';
        delete suggestions.dataset.gamblingSuggestions;
      }
      return;
    }
    setCardVisibility(true);
    card.dataset.richCardKind = 'blackjack';
    card.dataset.gamblingRichCard = 'true';
    card.dataset.gamblingView = round.status;
    card.dataset.gamblingRoundId = round.id;
    renderedRound = round;
    card.setAttribute('aria-label', `Blackjack ${round.status} panel`);
    const surface = el('section', `blackjack-surface is-${round.status}`);
    surface.dataset.testid = round.status === 'active' ? 'blackjack-surface' : 'blackjack-result-surface';
    appendTableHeader(surface, round);
    if (round.status === 'active') appendActiveSurface(surface, round, state.carriedGold);
    else appendResultSurface(surface, round, state.carriedGold);
    card.append(surface);
    renderActions(round);
    requestAnimationFrame(() => card.scrollIntoView({ block: 'center', inline: 'nearest' }));
  }

  async function showHelp(game) {
    const payload = await api('/api/gambling/help', {
      method: 'POST',
      body: JSON.stringify({ game }),
    });
    await waitForEntry(payload.entry?.id);
    if (game === 'blackjack') renderBlackjackState(payload.blackjack);
  }

  async function runCommand(raw) {
    const normalized = String(raw || '').trim().replace(/^\//, '');
    const [name = '', ...args] = normalized.split(/\s+/);
    const command = name.toLowerCase();
    const lowerArgs = args.map((part) => part.toLowerCase());

    await recordPlayerAction(String(raw || '').trim());

    if (command === 'gambling' || command === 'casino') {
      await showHelp('games');
      return;
    }

    if (command === 'blackjack') {
      if (!args.length) {
        await showHelp('blackjack');
        return;
      }
      const payload = await api('/api/gambling/blackjack', {
        method: 'POST',
        headers: { 'Idempotency-Key': key('blackjack-deal') },
        body: JSON.stringify({ wager: Number(args[0]) }),
      });
      await waitForEntry(payload.entry?.id);
      renderBlackjackState(payload.blackjack);
      return;
    }

    if (command === 'hit' || command === 'stand') {
      const browse = await api('/api/gambling');
      const round = browse.blackjack?.round;
      if (!round || round.status !== 'active') throw new Error('No active Blackjack hand. Type blackjack <wager> to deal.');
      const payload = await api(`/api/gambling/blackjack/${encodeURIComponent(round.id)}/${command}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key(`blackjack-${command}`) },
      });
      await waitForEntry(payload.entry?.id);
      renderBlackjackState(payload.blackjack);
      return;
    }

    if (command === 'coinflip') {
      if (!args.length) {
        await showHelp('coinflip');
        return;
      }
      const choice = lowerArgs[1];
      const payload = await api('/api/gambling/coinflip', {
        method: 'POST',
        headers: { 'Idempotency-Key': key('coinflip') },
        body: JSON.stringify({ wager: Number(args[0]), choice }),
      });
      await waitForEntry(payload.entry?.id);
      return;
    }

    if (command === 'slots') {
      if (!args.length) {
        await showHelp('slots');
        return;
      }
      const payload = await api('/api/gambling/slots', {
        method: 'POST',
        headers: { 'Idempotency-Key': key('slots') },
        body: JSON.stringify({ wager: Number(args[0]) }),
      });
      await waitForEntry(payload.entry?.id);
    }
  }

  function parsedCommand(value) {
    const normalized = String(value || '').trim().replace(/^\//, '');
    const [name = ''] = normalized.split(/\s+/);
    return ['gambling', 'casino', 'blackjack', 'hit', 'stand', 'coinflip', 'slots'].includes(name.toLowerCase());
  }

  async function syncActiveRound() {
    try {
      const payload = await api('/api/gambling');
      if (payload.blackjack?.round?.status === 'active') renderBlackjackState(payload.blackjack);
    } catch {
      // Gambling presentation is optional; the stream remains usable if it is unavailable.
    }
  }

  form?.addEventListener('submit', async (event) => {
    const raw = String(input?.value || '').trim();
    if (!parsedCommand(raw)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy || !raw) return;
    busy = true;
    showError('');
    if (input) input.value = '';
    if (card && !card.hidden) setCardVisibility(false);
    try {
      await runCommand(raw);
    } catch (caught) {
      showError(caught.message);
    } finally {
      busy = false;
      input?.focus({ preventScroll: true });
    }
  }, { capture: true });

  if (suggestions) {
    const suggestionsObserver = new MutationObserver(() => {
      if (renderingActions || !renderedRound || suggestions.dataset.gamblingSuggestions !== 'blackjack') return;
      if (!suggestions.querySelector('[data-blackjack-action="true"]')) renderActions(renderedRound);
    });
    suggestionsObserver.observe(suggestions, { childList: true, subtree: true });
    window.addEventListener('beforeunload', () => suggestionsObserver.disconnect(), { once: true });
  }

  syncActiveRound();
}
