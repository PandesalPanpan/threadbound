import './gambling-rich-card.js';

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

  const composer = stream.querySelector('[data-testid="stream-composer"]');
  const input = stream.querySelector('[data-testid="stream-message"]');
  const error = stream.querySelector('[data-testid="stream-error"]');
  const log = stream.querySelector('[data-testid="adventure-stream-log"]');
  const commandCard = stream.querySelector('[data-testid="stream-command-card"]');
  let acting = false;
  let ordering = false;
  let revealScheduled = false;

  function alignActiveCommand() {
    if (!log || !commandCard || commandCard.hidden) return;

    // Position the card relative to the actual scroll container instead of using
    // offsetTop (whose offset parent is not guaranteed to be the Adventure Stream).
    const logRectBefore = log.getBoundingClientRect();
    const cardRectBefore = commandCard.getBoundingClientRect();
    log.scrollTop = Math.max(0, log.scrollTop + cardRectBefore.top - logRectBefore.top - 8);

    // Then make sure the chat scroller itself is visible below the sticky nav.
    const navBottom = document.querySelector('.threadbound-topnav')?.getBoundingClientRect().bottom || 0;
    const desiredTop = navBottom + 8;
    const cardRect = commandCard.getBoundingClientRect();
    if (cardRect.top < desiredTop || cardRect.top > window.innerHeight - 80) {
      window.scrollBy({ top: cardRect.top - desiredTop, left: 0, behavior: 'auto' });
    }
  }

  function revealActiveCommand() {
    if (!commandCard || commandCard.hidden || revealScheduled) return;
    alignActiveCommand();
    revealScheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      revealScheduled = false;
      alignActiveCommand();
    }));
  }

  function keepActiveCommandAtTail() {
    if (!log || !commandCard || commandCard.hidden || ordering) return;
    if (commandCard.parentElement !== log || commandCard !== log.lastElementChild) {
      ordering = true;
      log.append(commandCard);
      queueMicrotask(() => { ordering = false; });
    }
    revealActiveCommand();
  }

  // Rich command modules all reuse one card node. Stream receipts/messages are
  // appended independently, so preserve chronological chat flow by keeping the
  // active Threadbound response after the newest durable entry instead of letting
  // it become an off-screen pseudo-private panel.
  const streamOrderObserver = log ? new MutationObserver(() => {
    queueMicrotask(keepActiveCommandAtTail);
  }) : null;
  streamOrderObserver?.observe(log, { childList: true });

  // Most command renderers mutate the existing shared card rather than insert a
  // new log child. Watch that card too so a freshly rendered Town/Profile/etc.
  // response is aligned by its header below the sticky navigation, even when it
  // is taller than the mobile viewport.
  const commandCardObserver = commandCard ? new MutationObserver(() => {
    queueMicrotask(keepActiveCommandAtTail);
  }) : null;
  commandCardObserver?.observe(commandCard, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'data-rich-card-kind'],
  });

  function showError(message = '') {
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  async function runAdventure() {
    const response = await fetch('/api/adventure', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  }

  composer?.addEventListener('submit', async (event) => {
    const raw = String(input?.value || '').trim().toLowerCase();
    if (raw !== 'adventure' && raw !== '/adventure') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (acting) return;
    acting = true;
    showError('');
    if (input) input.value = '';
    try {
      await runAdventure();
    } catch (caught) {
      showError(caught.message);
    } finally {
      acting = false;
      input?.focus();
    }
  }, { capture: true });

  window.addEventListener('beforeunload', () => {
    streamOrderObserver?.disconnect();
    commandCardObserver?.disconnect();
  }, { once: true });
}