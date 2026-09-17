import { currentAreaName, goldValue, healthValue } from '../../shell/presentation.js';

export function GameTopBar({ dashboard, areas, connected, onOpen }) {
  const character = dashboard?.character;
  const health = healthValue(character);
  return (
    <header className="game-shell-topbar">
      <a className="game-shell-brand" href="/game" aria-label="Threadbound Adventure Stream"><span className="game-shell-brand__mark">✦</span><span>THREADBOUND</span></a>
      <div className="game-shell-location"><span className="shell-kicker">CURRENT THREAD</span><strong>{currentAreaName(areas, dashboard)}</strong><span>{dashboard?.activeRun ? 'A run is active' : 'Ready for an Adventure'}</span></div>
      <div className="game-shell-topbar__status">
        <button className="game-shell-currency" type="button" onClick={() => onOpen('bank')} aria-label="Open Bank"><span>◈</span>{goldValue(character)} <small>Gold</small></button>
        <button className="game-shell-health" type="button" onClick={() => onOpen('status')} aria-label="Open Profile"><span className="health-dot" />{health.current}/{health.max}</button>
        <span className={`game-shell-connection${connected ? ' is-live' : ''}`} aria-label={connected ? 'Realtime connected' : 'Realtime reconnecting'}><i />{connected ? 'LIVE' : 'SYNC'}</span>
      </div>
    </header>
  );
}
