const stream = document.querySelector('#stream');

if (stream) {
  function waitFor(testId, timeoutMs = 5000) {
    const selector = `[data-testid="${testId}"]`;
    const existing = stream.querySelector(selector);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const element = stream.querySelector(selector);
        if (!element) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve(element);
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(stream.querySelector(selector));
      }, timeoutMs);
      observer.observe(stream, { childList:true, subtree:true });
    });
  }

  function stripHiddenSourceTestIds(suggestions) {
    for (const source of suggestions.querySelectorAll('.ux-meta-source[data-testid], button[data-meta-command][data-testid]')) {
      const testId = source.getAttribute('data-testid');
      if (testId && !source.dataset.uxOriginalTestid) source.dataset.uxOriginalTestid = testId;
      source.removeAttribute('data-testid');
    }
  }

  const suggestions = await waitFor('stream-suggestions');
  if (suggestions) {
    await import('./ux-coherence.js');
    await import('./buildcraft-presentation.js');
    await import('./thread-first-ui.js');
    await import('./interaction-budget.js');

    // Hidden command sources retain their event handlers while the visible, viewer-specific
    // controls live inside the private chat card. Never expose duplicate test IDs.
    stripHiddenSourceTestIds(suggestions);
    const sourceObserver = new MutationObserver(() => stripHiddenSourceTestIds(suggestions));
    sourceObserver.observe(suggestions, { childList:true, subtree:true, attributes:true, attributeFilter:['data-testid','class'] });

    // Yellow remains the semantic forecast color; the dark backing carries the contrast.
    const style = document.createElement('style');
    style.textContent = `
      #stream .stream-health-preview-copy { color:#ffe45c !important; }
      #stream .stream-meta-actions-row button { min-height:44px !important; }
    `;
    document.head.append(style);

    window.addEventListener('beforeunload', () => sourceObserver.disconnect(), { once:true });
  }
}
