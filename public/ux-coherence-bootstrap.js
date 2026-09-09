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

  const suggestions = await waitFor('stream-suggestions');
  if (suggestions) await import('./ux-coherence.js');
}
