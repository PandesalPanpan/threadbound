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
    for (const source of suggestions.querySelectorAll('.ux-meta-source[data-testid]')) {
      const testId = source.getAttribute('data-testid');
      if (testId && !source.dataset.uxOriginalTestid) source.dataset.uxOriginalTestid = testId;
      source.removeAttribute('data-testid');
    }
  }

  const suggestions = await waitFor('stream-suggestions');
  if (suggestions) {
    await import('./ux-coherence.js');
    await import('./buildcraft-presentation.js');

    // Meta command buttons keep their original event handlers as hidden Presentation Model
    // sources while visible mirrors live in Navigation. Never expose duplicate test IDs.
    stripHiddenSourceTestIds(suggestions);
    const sourceObserver = new MutationObserver(() => stripHiddenSourceTestIds(suggestions));
    sourceObserver.observe(suggestions, { childList:true, subtree:true, attributes:true, attributeFilter:['data-testid','class'] });

    // Keep the established semantic contract: yellow (#ffe45c) means projected damage.
    // The dark backing/border supplies the improved contrast without changing meaning.
    // Navigation remains a separate visual surface while preserving 44px touch targets.
    const style = document.createElement('style');
    style.textContent = `
      #stream .stream-health-preview-copy { color:#ffe45c !important; }
      #stream .stream-meta-actions-row button { min-height:44px !important; }
    `;
    document.head.append(style);

    window.addEventListener('beforeunload', () => sourceObserver.disconnect(), { once:true });
  }
}
