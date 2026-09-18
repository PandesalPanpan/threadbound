import { useCallback, useEffect, useRef } from 'react';
import { entryBody, entryKey, entryKind, formatEntryTime } from '../../shell/presentation.js';

export function AdventureStream({ entries = [], activeCard = null, onLoadMore = null, hasMore = false, connected = false }) {
  const logRef = useRef(null);
  const nearBottomRef = useRef(true);
  const onScroll = useCallback((event) => {
    const element = event.currentTarget;
    nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
  }, []);

  useEffect(() => {
    const element = logRef.current;
    if (!element || !nearBottomRef.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [entries.length, activeCard]);

  return (
    <section className="game-shell-stream" aria-labelledby="adventure-stream-title">
      <header className="game-shell-stream__header">
        <div>
          <span className="shell-kicker">ADVENTURE STREAM</span>
          <h1 id="adventure-stream-title">The shared thread</h1>
        </div>
        <span className={`stream-live-pill${connected ? ' is-live' : ''}`} data-testid="stream-connection"><i /> {connected ? 'LIVE' : 'SYNC'}</span>
      </header>
      <div ref={logRef} className="game-shell-stream__log" data-testid="adventure-stream-log" role="log" aria-live="polite" onScroll={onScroll}>
        {hasMore && onLoadMore ? <button className="stream-load-more" type="button" onClick={onLoadMore}>Load earlier receipts</button> : null}
        {entries.length ? entries.map((entry) => {
          const kind = entryKind(entry);
          return (
            <article className={`stream-entry stream-${kind}-entry`} key={entryKey(entry)} data-entry-id={entry.id || undefined} data-testid={`stream-${kind}-entry`}>
              <span className={`stream-entry__avatar stream-entry__avatar--${kind}`} aria-hidden="true">{String(entry.actorName || (kind === 'chat' ? 'W' : '✦')).slice(0, 1)}</span>
              <div className="stream-entry__content">
                <div className="stream-entry__meta"><strong>{entry.actorName || 'THREADBOUND'}</strong><time dateTime={entry.createdAt || undefined}>{formatEntryTime(entry.createdAt)}</time></div>
                <p>{entryBody(entry)}</p>
              </div>
            </article>
          );
        }) : (
          <div className="stream-empty"><span aria-hidden="true">✦</span><p>Your first result will land here.</p></div>
        )}
        {activeCard ? <div className="stream-active-card">{activeCard}</div> : null}
      </div>
    </section>
  );
}
