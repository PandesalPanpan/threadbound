(() => {
  const nativeFetch = window.fetch.bind(window);

  function isRunMutation(input, init) {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'POST') return false;
    const rawUrl = input instanceof Request ? input.url : String(input || '');
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && /^\/api\/runs\/[^/]+\//.test(url.pathname);
  }

  window.fetch = async (input, init = {}) => {
    if (!isRunMutation(input, init)) return nativeFetch(input, init);

    const inheritedHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(inheritedHeaders || {});
    for (const [name, value] of new Headers(init.headers || {})) headers.set(name, value);
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', `run-${crypto.randomUUID()}`);
    const protectedInit = { ...init, headers };

    try {
      return await nativeFetch(input, protectedInit);
    } catch (error) {
      if (protectedInit.signal?.aborted) throw error;
      // A lost connection after the server commits is ambiguous. Retry once with the exact
      // same key so the server replays the stored result instead of executing the command twice.
      return nativeFetch(input, protectedInit);
    }
  };
})();
