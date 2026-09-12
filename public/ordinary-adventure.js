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
  let acting = false;

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
}
