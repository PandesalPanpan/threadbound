import { HealthBar } from './HealthBar.jsx';

function ManaBar({ unit }) {
  const max = Math.max(1, Number(unit.maxMana) || 100);
  const mana = Math.max(0, Math.min(max, Number(unit.mana) || 0));
  return (
    <div className="battle-mana" data-testid={`battle-mana-${unit.id}`} data-mana={`${mana}/${max}`}>
      <div className="battle-mana__track" aria-hidden="true"><span style={{ width: `${Math.round((mana / max) * 100)}%` }} /></div>
      <div className="battle-mana__label"><span>MANA</span><strong>{mana}/{max}</strong></div>
    </div>
  );
}

export function BattleUnit({ unit, side, active = false, targeted = false, phase = 'live' }) {
  if (!unit) return null;
  const defeated = Number(unit.hp) <= 0;
  const skill = unit.skills?.[0] || null;
  return (
    <article className={`battle-unit battle-unit--${side}${active ? ' is-active' : ''}${targeted ? ' is-targeted' : ''}${defeated ? ' is-defeated' : ''}`} data-testid={`battle-unit-${unit.id}`} data-unit-id={unit.id} data-side={side}>
      <div className="battle-unit__identity"><span className="battle-unit__role">{unit.role || (side === 'players' ? 'WEAVER' : 'ENEMY')}</span><h3>{unit.label || unit.displayName || unit.name}</h3>{active ? <span className="battle-unit__turn">ACTING</span> : null}</div>
      <div className="battle-unit__art-wrap">
        <div className="battle-unit__halo" aria-hidden="true" />
        {unit.asset ? <img className="battle-unit__art" src={unit.asset.src} alt={`${unit.label || unit.name} artwork`} data-visual-asset-id={unit.asset.id} /> : <div className="battle-unit__art-missing" role="img" aria-label={`${unit.label || unit.name} artwork unavailable`} />}
        <span className="battle-unit__spark battle-unit__spark--one" aria-hidden="true" /><span className="battle-unit__spark battle-unit__spark--two" aria-hidden="true" />
        {defeated ? <span className="battle-unit__defeated">DEFEATED</span> : null}
      </div>
      <HealthBar value={unit.hp} max={unit.maxHp} tone={side === 'players' ? 'hp' : 'enemy'} label="HP" testId={`battle-hp-${unit.id}`} />
      <ManaBar unit={unit} />
      {skill ? <span className="battle-unit__skill" title={skill.description}>{skill.name || skill.label}</span> : null}
      {phase === 'result' && defeated ? <span className="sr-only">{unit.label || unit.name} defeated</span> : null}
    </article>
  );
}
