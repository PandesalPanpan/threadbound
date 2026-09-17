export function ContextRail({ dashboard, connected }) {
  const character = dashboard?.character;
  const run = dashboard?.activeRun;
  return (
    <aside className="context-rail" aria-label="Live context">
      <div className="context-rail__head"><span className="panel-kicker">LIVE CONTEXT</span><span className={connected ? 'connection-pill is-live' : 'connection-pill'}><i />{connected ? 'WebSocket live' : 'Reconnecting'}</span></div>
      <div className="context-player"><div className="context-player__avatar">{String(character?.displayName || 'W').slice(0, 1)}</div><div><strong>{character?.displayName || 'Weaver'}</strong><span>{character?.level ? `Level ${character.level}` : 'Loading profile'}</span></div></div>
      <div className="context-stats"><div><span>Gold</span><strong>{character?.gold ?? '—'}</strong></div><div><span>Attack</span><strong>{character?.attack ?? character?.attackPower ?? '—'}</strong></div><div><span>HP</span><strong>{character?.currentHealth ?? '—'} / {character?.maxHealth ?? '—'}</strong></div></div>
      <div className="context-divider" />
      <span className="panel-kicker">RUN MIRROR</span>
      {run ? <div className="context-run"><strong>{run.enemy?.name || 'Run in progress'}</strong><span>{run.phase} · version {run.version}</span><span>{run.participants?.length || 1} Weaver{run.participants?.length === 1 ? '' : 's'}</span></div> : <p className="context-empty">No active run. Start a battle when the thread is ready.</p>}
      <a className="context-link" href="/game-react">View full Adventure Stream <span>↗</span></a>
    </aside>
  );
}
