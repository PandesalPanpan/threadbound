import { HealthBar } from './HealthBar.jsx';

export function BattleUnit({ unit, side, beforeHp, phase }) {
  if (!unit) return null;
  return (
    <article className={`battle-unit battle-unit--${side}`} data-testid={`battle-${side}`} data-unit-id={unit.id}>
      <div className="battle-unit__identity">
        <span className="battle-unit__role">{side === 'attacker' ? 'WEAVER' : unit.isBoss ? 'BOSS' : 'ENCOUNTER'}</span>
        <h3>{unit.name}</h3>
      </div>
      <div className="battle-unit__art-wrap">
        <div className="battle-unit__halo" aria-hidden="true" />
        {unit.asset ? <img className="battle-unit__art" src={unit.asset.src} alt="" data-visual-asset-id={unit.asset.id} /> : <div className="battle-unit__art-fallback" aria-hidden="true" />}
        <span className="battle-unit__spark battle-unit__spark--one" aria-hidden="true" />
        <span className="battle-unit__spark battle-unit__spark--two" aria-hidden="true" />
      </div>
      <HealthBar value={unit.hp} max={unit.maxHp} before={beforeHp} tone={side === 'attacker' ? 'hp' : 'enemy'} label="HP" testId={`battle-${side}-hp`} />
      {side === 'attacker' && (
        <HealthBar value={unit.focus} max={unit.maxFocus} tone="focus" label="Focus" testId="battle-attacker-focus" />
      )}
      {phase === 'result' && side === 'target' && unit.hp <= 0 ? <span className="battle-unit__defeated">DEFEATED</span> : null}
    </article>
  );
}
