export function ChatFeed({ entries = [], receipt = null }) {
  const recent = entries.slice(-5);
  return (
    <section className="chat-panel" aria-labelledby="battle-feed-title">
      <div className="panel-heading"><div><span className="panel-kicker">ADVENTURE STREAM</span><h2 id="battle-feed-title">The shared thread</h2></div><span className="live-chip"><i />LIVE</span></div>
      <div className="chat-feed" data-testid="battle-feed">
        {recent.length ? recent.map((entry) => <article className={`chat-entry chat-entry--${entry.actorType || 'system'}`} key={entry.id || `${entry.createdAt}-${entry.body}`}><span className="chat-entry__avatar" aria-hidden="true">{String(entry.actorName || 'T').slice(0, 1)}</span><div><div className="chat-entry__meta"><strong>{entry.actorName || 'THREADBOUND'}</strong><time>{entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now'}</time></div><p>{entry.body || entry.message || entry.text || 'A new thread event was recorded.'}</p></div></article>) : <p className="chat-empty">Your first battle receipt will land here.</p>}
        {receipt ? <article className="chat-receipt" data-testid="battle-receipt"><span className="chat-receipt__mark">✦</span><div><span className="panel-kicker">LATEST RESULT</span><strong>{receipt.title}</strong><p>{receipt.copy}</p></div></article> : null}
      </div>
      <div className="chat-composer"><span>Message party or type /command…</span><button type="button" aria-label="Return to Adventure Stream" onClick={() => { window.location.href = '/game-react'; }}>›</button></div>
    </section>
  );
}
