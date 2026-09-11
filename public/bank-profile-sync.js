const stream = document.querySelector('#stream');

if (stream) {
  let scheduled = false;

  async function sync() {
    scheduled = false;
    const card = stream.querySelector('[data-testid="stream-command-card"][data-profile-rich-card="true"]');
    const target = card?.querySelector('[data-testid="profile-banked-gold"]');
    if (!target || card.hidden) return;
    try {
      const response = await fetch('/api/shop', { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok) return;
      const next = String(payload.bank?.bankedGold ?? 0);
      if (target.textContent !== next) target.textContent = next;
    } catch {
      // Profile remains usable from its dashboard projection if the supplemental Bank
      // projection is temporarily unavailable.
    }
  }

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(sync, 0);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(stream, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-profile-rich-card'] });
  schedule();
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
}
