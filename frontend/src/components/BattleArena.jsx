import { presentBattleTeams } from '../battle/visuals.js';
import { BattleUnit } from './BattleUnit.jsx';

function ActionButton({ children, onClick, disabled, testId, variant = '' }) {
  return <button className={`battle-action ${variant ? `battle-action--${variant}` : ''}`} type="button" onClick={onClick} disabled={disabled} data-testid={testId}>{children}</button>;
}

function unitMap(units) {
  return new Map(units.map((unit) => [unit.id, unit]));
}

function actionCopy(active, map) {
  if (!active) return 'The thread is ready.';
  const actor = map.get(active.actorId)?.label || 'A combatant';
  const target = map.get(active.targetId)?.label || 'the opposing line';
  if (active.type === 'SkillCastStarted' || active.actionType === 'skill') return `${actor} casts ${active.skillName || active.skillId || 'a skill'} on ${target}.`;
  return `${actor} attacks ${target}.`;
}

function BattleDetails({ payload }) {
  const details = payload?.details || {};
  const turns = details.turns || [];
  if (!turns.length) return null;
  return (
    <details className="battle-details" data-testid="battle-details">
      <summary><span>Battle Details</span><strong>{turns.length} turns</strong></summary>
      <div className="battle-details__body"><p>Authoritative turn summaries are available here when you want the full simulation.</p><ol data-testid="battle-details-turns">{turns.map((turn) => <li className="battle-details-turn" key={turn.turnNumber}><span>TURN {turn.turnNumber}</span><strong>{turn.summary}</strong></li>)}</ol></div>
    </details>
  );
}

export function BattleArena({ payload, assets = [], frame, phase, active = null, busy, onStart, onReplay, onBack }) {
  const combatants = frame?.combatants || [];
  const teams = presentBattleTeams(combatants, assets);
  const allUnits = [...teams.players, ...teams.enemies];
  const byId = unitMap(allUnits);
  const activeActor = active?.actorId || null;
  const activeTarget = active?.targetId || null;
  const activeDamage = Number(active?.damage || 0);
  const result = payload?.receipt;
  const resultDetail = result?.text?.startsWith(result?.headline)
    ? result.text.slice(result.headline.length).replace(/^\s*·\s*/, '')
    : result?.text;
  const phaseLabel = phase === 'preBattle' ? 'Pre-Battle' : phase === 'skillCast' ? 'Skill Cast' : phase === 'impact' ? 'Attack Impact' : phase === 'result' ? 'Result' : 'Live Battle';
  const roster = presentBattleTeams(payload?.battle?.events?.find((event) => event.type === 'BattleStarted')?.combatants || payload?.battle?.combatants || [], assets);
  const loadout = Object.values(payload?.loadout || {}).filter(Boolean);
  const playerCount = teams.players.length;
  const enemyCount = teams.enemies.length;
  const rosterPlayerCount = roster.players.length;
  const rosterEnemyCount = roster.enemies.length;

  return (
    <section className="battle-card automatic-battle-card" data-testid="battle-card" data-battle-phase={phase} data-authoritative="true">
      <header className="battle-card__header"><div><span className="battle-card__eyebrow">FIGMA-STYLED · AUTHORITATIVE SERVER REPLAY</span><h1>Threadbound battle</h1></div><div className="battle-card__status" data-testid="battle-phase-label"><span className="status-dot" />{phaseLabel}</div></header>
      {phase === 'preBattle' ? (
        <div className="battle-empty battle-prebattle" data-testid="battle-pre-battle">
          <span className="battle-card__eyebrow">01 · PRE-BATTLE</span><div className="battle-empty__sigil" aria-hidden="true"><span>✦</span></div><h2>Watch the threads fight</h2><p>{rosterPlayerCount} Weaver{rosterPlayerCount === 1 ? '' : 's'} face {rosterEnemyCount} threat{rosterEnemyCount === 1 ? '' : 's'}. The roster, HP, actions, and result below come from this exact committed battle.</p>
          <div className="battle-roster-preview" aria-label="Battle roster"><div><span className="battle-roster-label">WEAVERS</span>{roster.players.map((unit) => <div className="battle-roster-unit" key={unit.id}>{unit.asset ? <img src={unit.asset.src} alt="" data-visual-asset-id={unit.asset.id} /> : <span className="battle-roster-unit__missing">✦</span>}<span>{unit.label}</span></div>)}</div><span className="battle-roster-vs">VS</span><div><span className="battle-roster-label">THREATS</span>{roster.enemies.map((unit) => <div className="battle-roster-unit" key={unit.id}>{unit.asset ? <img src={unit.asset.src} alt="" data-visual-asset-id={unit.asset.id} /> : <span className="battle-roster-unit__missing">✦</span>}<span>{unit.label}</span></div>)}</div></div>
          {loadout.length ? <div className="battle-replay-loadout"><span className="battle-roster-label">EQUIPMENT USED</span><div>{loadout.map((item) => <span key={item.id || item.name}><strong>{item.name}</strong><small>{item.slot || 'equipment'}{item.attackBonus ? ` · +${item.attackBonus} ATK` : ''}</small></span>)}</div></div> : null}
          <ActionButton onClick={onStart} disabled={busy} testId="battle-start" variant="primary">Start replay</ActionButton><button className="quiet-link" type="button" onClick={onBack}>Return to the Adventure Stream</button>
        </div>
      ) : (
        <>
          <div className={`battle-stage battle-stage--${phase}`} data-testid="battle-stage" aria-label={`${phaseLabel} battle arena`}>
            <div className="stage-grid" aria-hidden="true" /><div className="stage-glow stage-glow--attacker" aria-hidden="true" /><div className="stage-glow stage-glow--target" aria-hidden="true" />
            <section className="battle-team battle-team--enemies" data-testid="battle-enemies" data-battle-team="enemies" aria-label="Enemy team"><span className="battle-team__label">ENEMY THREAD · {teams.enemies.some((unit) => Number(unit.hp) <= 0) ? 'UNDER PRESSURE' : `${enemyCount} HOSTILE${enemyCount === 1 ? '' : 'S'}`}</span><div className="battle-team__units" style={{ gridTemplateColumns: `repeat(${Math.max(1, enemyCount)}, minmax(0, 1fr))`, maxWidth: enemyCount === 1 ? 190 : undefined, marginInline: enemyCount === 1 ? 'auto' : undefined }}>{teams.enemies.map((unit) => <BattleUnit key={unit.id} unit={unit} side="target" active={activeActor === unit.id} targeted={activeTarget === unit.id} phase={phase} />)}</div></section>
            <div className="battle-threadline" aria-hidden="true"><span /><i /><b /></div>
            <section className="battle-team battle-team--players" data-testid="battle-players" data-battle-team="players" aria-label="Player team"><span className="battle-team__label">YOUR THREAD · {teams.players.some((unit) => Number(unit.hp) <= 0) ? 'HOLDING' : `${playerCount} WEAVER${playerCount === 1 ? '' : 'S'}`}</span><div className="battle-team__units" style={{ gridTemplateColumns: `repeat(${Math.max(1, playerCount)}, minmax(0, 1fr))`, maxWidth: playerCount === 1 ? 190 : undefined, marginInline: playerCount === 1 ? 'auto' : undefined }}>{teams.players.map((unit) => <BattleUnit key={unit.id} unit={unit} side="attacker" active={activeActor === unit.id} targeted={activeTarget === unit.id} phase={phase} />)}</div></section>
            {activeDamage > 0 && phase !== 'live' ? <div className={`damage-float ${active.critical ? 'damage-float--critical' : ''}`} data-testid="battle-floating-damage">−{activeDamage} HP</div> : null}
            {phase === 'skillCast' ? <div className="skill-banner" data-testid="battle-skill-banner"><span>SKILL CAST</span><strong>{active?.skillName || active?.skillId || 'Combat skill'}</strong></div> : null}
            {phase !== 'result' ? <div className="battle-action-readout" data-testid="battle-action-readout"><span>TURN {frame?.currentTurn || active?.turnNumber || 0}</span><strong>{actionCopy(active, byId)}</strong></div> : null}
            {phase === 'result' ? <div className="result-stamp" data-testid="battle-result-stamp"><span>{result?.outcomeLabel || 'RESULT'}</span></div> : null}
          </div>
          <div className="battle-readout"><div><span>TURN</span><strong>{frame?.currentTurn || payload?.battle?.turns?.length || 0}/{payload?.battle?.turns?.length || 0}</strong></div><div><span>ROSTER</span><strong>{playerCount} × {enemyCount}</strong></div><div><span>STATUS</span><strong>{phaseLabel}</strong></div></div>
          {phase === 'result' ? <section className="battle-result-receipt" data-testid="battle-result-receipt"><span className="battle-card__eyebrow">RESULT RECEIPT</span><strong>{result?.headline}</strong><p>{resultDetail}</p><div><ActionButton onClick={onReplay} disabled={busy} testId="battle-replay" variant="primary">Replay simulation</ActionButton><ActionButton onClick={onBack} disabled={busy} testId="battle-result-back">Open Adventure Stream</ActionButton></div></section> : null}
          <BattleDetails payload={payload} />
          {phase !== 'result' ? <p className="battle-hint" data-testid="battle-hint">{busy ? 'Replaying the committed event stream…' : 'HP and Mana are server snapshots. The browser only presents the result.'}</p> : null}
        </>
      )}
    </section>
  );
}
