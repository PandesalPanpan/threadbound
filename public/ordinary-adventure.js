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

  function revealActiveCommand() {
    if (!commandCard || commandCard.hidden) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      commandCard.scrollIntoView({ block: 'end', inline: 'nearest' });
    }));
  }

  function keepActiveCommandAtTail() {
    if (!log || !commandCard || commandCard.hidden || ordering) return;
    if (commandCard.parentElement === log && commandCard === log.lastElementChild) {
      revealActiveCommand();
      return;
    }
    ordering = true;
    log.append(commandCard);
    log.scrollTop = log.scrollHeight;
    revealActiveCommand();
    queueMicrotask(() => { ordering = false; });
  }

  // Rich command modules all reuse one card node. Stream receipts/messages are
  // appended independently, so preserve chronological chat flow by keeping the
  // active Threadbound response after the newest durable entry instead of letting
  // it become an off-screen pseudo-private panel.
  const streamOrderObserver = log ? new MutationObserver(() => {
    queueMicrotask(keepActiveCommandAtTail);
  }) : null;
  streamOrderObserver?.observe(log, { childList: true });

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

  window.addEventListener('beforeunload', () => streamOrderObserver?.disconnect(), { once: true });
}