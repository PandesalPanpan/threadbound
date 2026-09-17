import { activeQuest, currentAreaName, goldValue, healthValue } from '../../shell/presentation.js';

export function LiveContextRail({ dashboard, areas, quests, connected, onCommand }) {
  const character = dashboard?.character;
  const health = healthValue(character);
  const quest = activeQuest(quests);
  const party = dashboard?.party;
  const world = dashboard?.world || {};
  return (
    <aside className="game-shell-context-rail" aria-label="Live Context">
      <header className="context-rail__head"><span className="shell-kicker">LIVE CONTEXT</span><span className={`context-live-pill${connected ? ' is-live' : ''}`}><i />{connected ? 'LIVE' : 'SYNC'}</span></header>
      <button className="context-profile" type="button" onClick={() => onCommand('status')}>
        <span className="context-profile__avatar">{String(character?.displayName || 'W').slice(0, 1)}</span>
        <span><strong>{character?.displayName || 'Weaver'}</strong><small>Level {character?.level || 1} · {goldValue(character)} Gold</small></span><b>›</b>
      </button>
      <div className="context-metrics"><div><span>HP</span><strong>{health.current}/{health.max}</strong></div><div><span>ATTACK</span><strong>{character?.attack ?? character?.attackPower ?? '—'}</strong></div><div><span>DEFENSE</span><strong>{character?.defense ?? '—'}</strong></div></div>
      <section className="context-section"><div className="context-section__title"><span className="shell-kicker">CURRENT AREA</span><button type="button" onClick={() => onCommand('area')}>Open</button></div><strong>{currentAreaName(areas, dashboard)}</strong><p>{areas?.towns?.length || 0} Town{areas?.towns?.length === 1 ? '' : 's'} · {areas?.areas?.length || 1} Area{areas?.areas?.length === 1 ? '' : 's'} unlocked</p></section>
      <section className="context-section"><div className="context-section__title"><span className="shell-kicker">ACTIVE QUEST</span><button type="button" onClick={() => onCommand('quest')}>Open</button></div>{quest ? <><strong>{quest.title}</strong><p>{quest.state === 'claimable' ? 'Ready to claim' : 'In progress'} · {quest.objectives?.length || 0} objective{quest.objectives?.length === 1 ? '' : 's'}</p></> : <p className="context-muted">No active Quest yet.</p>}</section>
      <section className="context-section"><div className="context-section__title"><span className="shell-kicker">GUILD SNAPSHOT</span><button type="button" onClick={() => onCommand('party')}>Open</button></div><strong>{party ? `${party.members?.length || 1} Weaver${party.members?.length === 1 ? '' : 's'} in party` : 'Solo thread'}</strong><p>{world?.currentArc?.title || world?.arcTitle || 'The shared world is waiting.'}</p></section>
      <div className="context-footer"><a href="/codex">Codex ↗</a><a href="/game?view=battle">Battle view ↗</a></div>
    </aside>
  );
}
