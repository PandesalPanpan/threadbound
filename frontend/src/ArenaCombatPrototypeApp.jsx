import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { characterSpriteFrame } from '../../public/sprite-catalog.js';
import { ARENA_ROSTER, ARENA_SIZE, ARENA_TICK_SECONDS, createArenaUnits, simulateArena } from './battle/arenaCombatPrototype.js';
import './ArenaCombatPrototypeApp.css';

gsap.registerPlugin(useGSAP);
const ART = Object.fromEntries(ARENA_ROSTER.map((unit) => [unit.id, characterSpriteFrame(unit)]));
const allies = ARENA_ROSTER.filter((unit) => unit.team === 'allies');
const percent = (hp, max) => Math.max(0, hp / max * 100);
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function ArenaEffects({ frame, events, reducedMotion }) {
  return <svg className="arena-effects" viewBox="0 0 800 800" aria-hidden="true">
    {events.filter((event) => !['down', 'move'].includes(event.type)).map((event, index) => {
      const age = frame.tick * ARENA_TICK_SECONDS * 1000 - event.timeMs;
      const progress = Math.min(1, age / 150);
      const tx = event.targetX * 100 + 50; const ty = event.targetY * 100 + 40;
      const sx = event.sourceX * 100 + 50; const sy = event.sourceY * 100 + 40;
      const tone = event.type === 'heal' ? '#59d18c' : event.type === 'shield' ? '#61adff' : event.skill ? '#f5b047' : '#ffeff0';
      return <g key={`${event.timeMs}-${index}`} opacity={1 - age / 350}>
        {event.type === 'heal' || event.type === 'shield' ? <circle cx={tx} cy={ty + 10} r="36" fill="none" stroke={tone} strokeWidth="4" /> : null}
        {event.type === 'hit' && event.ranged && !reducedMotion ? <><line x1={sx} y1={sy} x2={tx} y2={ty} stroke={tone} strokeWidth="2" opacity=".3" /><circle className="arena-projectile" cx={sx + (tx - sx) * progress} cy={sy + (ty - sy) * progress} r={event.skill ? 8 : 5} fill={tone} /></> : null}
        {event.type === 'hit' && !event.ranged ? <path d={`M ${tx - 23} ${ty + 19} Q ${tx + 30} ${ty + 20} ${tx + 19} ${ty - 24}`} fill="none" stroke={tone} strokeWidth={event.skill ? 8 : 5} strokeLinecap="round" /> : null}
        <text className="arena-float" x={tx} y={Math.max(26, ty - 44 - (reducedMotion ? 0 : age / 15))} fill={tone} textAnchor="middle">{event.type === 'heal' ? '+' : event.type === 'shield' ? '◆ +' : '−'}{event.amount}{event.skill ? '!' : ''}</text>
      </g>;
    })}
  </svg>;
}

export function ArenaCombatPrototypeApp() {
  const root = useRef(null);
  const timelineRef = useRef(null);
  const [placement, setPlacement] = useState({});
  const [tuning, setTuning] = useState({});
  const [selected, setSelected] = useState('guard');
  const [phase, setPhase] = useState('placement');
  const [speed, setSpeed] = useState(1);
  const [replay, setReplay] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [message, setMessage] = useState('Select a teammate, then tap a tile in your deployment zone.');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const setupUnits = useMemo(() => createArenaUnits(placement, tuning), [placement, tuning]);
  const frame = replay?.frames[cursor] || { tick: 0, units: setupUnits, events: [] };
  const visibleEffects = replay ? replay.frames.slice(Math.max(0, cursor - 6), cursor + 1).flatMap((item) => item.events) : [];
  const focused = frame.units.find((unit) => unit.id === selected);
  const elapsed = frame.tick * ARENA_TICK_SECONDS;
  const paused = phase !== 'running';
  const recentEvents = replay ? replay.frames.slice(0, cursor + 1).flatMap((item) => item.events.filter((event) => event.skill || event.type === 'down').map((event) => ({ ...event, tick: item.tick }))).slice(-4).reverse() : [];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useGSAP(() => {
    const first = replay?.frames[0]?.units || setupUnits;
    for (const unit of first) {
      const element = root.current.querySelector(`[data-unit="${unit.id}"]`);
      gsap.set(element, { xPercent: unit.x * 100, yPercent: unit.y * 100 });
      gsap.set(element.querySelector('.arena-unit-art'), { x: 0, y: 0, rotation: 0, opacity: 1, scale: 1 });
    }
    if (!replay) return;
    let lastIndex = -1;
    const timeline = gsap.timeline({ paused: true, onUpdate: () => {
      const index = Math.min(replay.frames.length - 1, Math.floor((timeline.time() + 0.0001) / ARENA_TICK_SECONDS));
      if (index !== lastIndex) { lastIndex = index; setCursor(index); }
    }, onComplete: () => { setCursor(replay.frames.length - 1); setPhase('finished'); } });
    timelineRef.current = timeline;
    for (let index = 1; index < replay.frames.length; index += 1) {
      const current = replay.frames[index];
      const before = replay.frames[index - 1];
      const at = (index - 1) * ARENA_TICK_SECONDS;
      for (const unit of current.units) {
        const old = before.units.find((other) => other.id === unit.id);
        const element = root.current.querySelector(`[data-unit="${unit.id}"]`);
        const art = element.querySelector('.arena-unit-art');
        if (unit.renderX !== old.renderX || unit.renderY !== old.renderY) {
          if (reducedMotion) {
            if (unit.x !== old.x || unit.y !== old.y) timeline.set(element, { xPercent: unit.x * 100, yPercent: unit.y * 100 }, at + ARENA_TICK_SECONDS);
          }
          else {
            timeline.to(element, { xPercent: unit.renderX * 100, yPercent: unit.renderY * 100, duration: ARENA_TICK_SECONDS, ease: 'none' }, at);
          }
        }
        if (old.hp > 0 && unit.hp === 0) timeline.to(art, { opacity: 0.22, rotation: reducedMotion ? 0 : 70, duration: 0.2 }, at + ARENA_TICK_SECONDS);
      }
      if (!reducedMotion) for (const event of current.events.filter((event) => event.type === 'move')) {
        const art = root.current.querySelector(`[data-unit="${event.actor}"] .arena-unit-art`);
        timeline.to(art, { y: -3, duration: Math.min(0.18, event.durationMs / 2000), repeat: 1, yoyo: true, ease: 'sine.out' }, event.timeMs / 1000);
      }
      if (!reducedMotion) for (const event of current.events.filter((event) => event.type === 'hit' || event.type === 'heal')) {
        const art = root.current.querySelector(`[data-unit="${event.actor}"] .arena-unit-art`);
        const actor = current.units.find((unit) => unit.id === event.actor);
        const recipient = current.units.find((unit) => unit.id === event.target);
        const melee = event.type === 'hit' && !event.ranged;
        timeline.to(art, { x: melee ? Math.sign(recipient.x - actor.x) * 8 : 0, y: melee ? Math.sign(recipient.y - actor.y) * 6 : 0, scale: event.skill ? 1.15 : 1.07, rotation: melee ? -10 : 0, duration: 0.1, yoyo: true, repeat: 1 }, at + ARENA_TICK_SECONDS);
        if (event.type === 'hit') {
          const target = root.current.querySelector(`[data-unit="${event.target}"] .arena-impact`);
          timeline.fromTo(target, { opacity: 0.9 }, { opacity: 0, duration: 0.2, immediateRender: false }, at + ARENA_TICK_SECONDS);
        }
      }
    }
    // Explicit clock tween keeps idle time and the final event in the replay.
    timeline.to({ time: 0 }, { time: replay.duration + 0.3, duration: replay.duration + 0.3, ease: 'none' }, 0);
    timeline.timeScale(speed).time(cursor * ARENA_TICK_SECONDS).play();
    return () => { timelineRef.current = null; };
  }, { scope: root, dependencies: [replay, placement, tuning, reducedMotion], revertOnUpdate: true });

  useEffect(() => { timelineRef.current?.paused(paused); }, [paused, replay, reducedMotion]);
  useEffect(() => { timelineRef.current?.timeScale(speed); }, [speed, replay, reducedMotion]);

  function place(x, y) {
    if (phase !== 'placement') return;
    const occupant = setupUnits.find((unit) => unit.x === x && unit.y === y);
    if (occupant?.id === selected) return;
    const moving = setupUnits.find((unit) => unit.id === selected);
    setPlacement((current) => ({ ...current, [selected]: { x, y }, ...(occupant ? { [occupant.id]: { x: moving.x, y: moving.y } } : {}) }));
    setMessage(`${moving.name} placed in row ${y + 1}, column ${x + 1}${occupant ? `. Swapped with ${occupant.name}` : ''}.`);
  }
  function start() { setCursor(0); setReplay(simulateArena(placement, { tuning })); setPhase('running'); }
  function reset() { setReplay(null); setCursor(0); setPhase('placement'); setMessage('Select a teammate, then tap a tile in your deployment zone.'); }
  const resultLabel = replay?.outcome === 'victory' ? 'Your team wins' : replay?.outcome === 'defeat' ? 'Rival team wins' : 'Time limit · draw';

  return <div ref={root} className="arena-page">
    <header className="arena-topbar"><a href="/" className="arena-brand"><span>T</span> Threadbound</a><nav aria-label="Combat prototypes"><a href="/active-timing">Timing lab</a><span aria-current="page">Arena lab</span></nav><span className="arena-local">Local prototype</span></header>
    <main className="arena-layout">
      <div className="arena-heading"><div><p>Combat experiment 02</p><h1>Place. Watch. Adapt.</h1></div><span className="arena-mode">3 vs 3 · Automatic combat</span></div>
      <section className="arena-battle" aria-label="Arena combat">
        <div className="arena-score"><span><i className="arena-dot ally" /> Your team <b>{frame.units.filter((unit) => unit.team === 'allies' && unit.hp > 0).length}/3</b></span><strong data-testid="arena-clock">{clock(elapsed)}</strong><span><b>{frame.units.filter((unit) => unit.team === 'enemies' && unit.hp > 0).length}/3</b> Rivals <i className="arena-dot enemy" /></span></div>
        <div className={`arena-board ${phase === 'placement' ? 'is-placement' : ''}`} data-testid="arena-board" data-phase={phase} data-tick={frame.tick}>
          <div className="arena-grid" aria-label="Deployment tiles">{Array.from({ length: ARENA_SIZE * ARENA_SIZE }, (_, index) => {
            const x = index % ARENA_SIZE; const y = Math.floor(index / ARENA_SIZE);
            return <button key={index} type="button" className={`arena-tile ${y >= 5 ? 'arena-tile--deploy' : ''}`} disabled={phase !== 'placement' || y < 5} aria-label={`Place ${ARENA_ROSTER.find((unit) => unit.id === selected)?.name} row ${y + 1} column ${x + 1}`} onClick={() => place(x, y)} />;
          })}</div>
          <div className="arena-center-mark" aria-hidden="true">T</div>
          {frame.units.map((unit) => <div key={unit.id} role="img" aria-label={`${unit.name}, ${unit.team === 'allies' ? 'your team' : 'rivals'}, ${unit.hp}/${unit.maxHp} HP, ${unit.mana}/100 Mana${unit.hp === 0 ? ', defeated' : ''}`} data-unit={unit.id} data-hp={unit.hp} data-x={unit.x} data-y={unit.y} className={`arena-unit arena-unit--${unit.team} ${unit.hp === 0 ? 'is-down' : ''} ${unit.id === selected ? 'is-selected' : ''}`} style={{ zIndex: unit.y + 5 }}>
            <div className="arena-unit-shadow" /><div className="arena-unit-ring" />
            <div className="arena-unit-art"><img src={ART[unit.id]?.src} alt="" draggable="false" style={{ transform: `scaleX(${unit.facing})` }} /><span className="arena-impact" /></div>
            <div className="arena-unit-bars" aria-hidden="true"><span className="arena-unit-hp"><i style={{ transform: `scaleX(${unit.hp / unit.maxHp})` }} /></span><span className="arena-unit-mana"><i style={{ transform: `scaleX(${unit.mana / 100})` }} /></span>{unit.shield > 0 ? <b>◆ {unit.shield}</b> : null}</div>
            <span className="arena-unit-role">{unit.role === 'Frontline' ? '◆' : unit.role === 'Ranged' ? '➶' : '+'}</span>
          </div>)}
          <ArenaEffects frame={frame} events={visibleEffects} reducedMotion={reducedMotion} />
          {phase === 'placement' ? <span className="arena-deploy-label">Your deployment zone</span> : null}
          {phase === 'finished' ? <div className="arena-result" role="status"><span>Battle complete</span><h2>{resultLabel}</h2><p>{clock(replay.duration)} · {frame.units.filter((unit) => unit.team === 'allies' && unit.hp > 0).length} allies standing</p></div> : null}
        </div>
        <div className="arena-playback">
          {phase === 'placement' ? <button className="arena-primary" onClick={start}>Start battle <span>▶</span></button> : <button className="arena-primary" onClick={phase === 'finished' ? start : () => setPhase(paused ? 'running' : 'paused')}>{phase === 'finished' ? 'Replay battle' : paused ? 'Resume' : 'Pause'} <span>{phase === 'running' ? 'Ⅱ' : '▶'}</span></button>}
          <div className="arena-speed" aria-label="Playback speed">{[1, 2, 4].map((value) => <button key={value} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
          <button className="arena-reset" onClick={reset} disabled={phase === 'placement'}>Reposition</button>
        </div>
        <p className="arena-instruction" role="status">{phase === 'placement' ? message : phase === 'finished' ? 'Replay the same formation, or reposition to try a different approach.' : paused ? 'Paused. Resume when you’re ready.' : 'Your team is fighting automatically. Watch their targets and positioning.'}</p>
      </section>
      <aside className="arena-team-panel" aria-label="Team and behavior">
        <div className="arena-panel-title"><h2>Your team</h2><span>{phase === 'placement' ? 'Tap to select' : 'Live status'}</span></div>
        <div className="arena-roster">{allies.map((definition) => {
          const unit = frame.units.find((entry) => entry.id === definition.id);
          return <button key={unit.id} className={`arena-roster-unit ${selected === unit.id ? 'is-selected' : ''}`} aria-pressed={selected === unit.id} onClick={() => setSelected(unit.id)}>
            <img src={ART[unit.id]?.src} alt="" /><span><strong>{unit.name}</strong><small>{unit.role}</small><span className="arena-roster-hp"><i style={{ width: `${percent(unit.hp, unit.maxHp)}%` }} /></span></span><b>{unit.hp}<small>/{unit.maxHp}</small></b>
          </button>;
        })}</div>
        <section className="arena-behavior"><div><span className="arena-role-badge">{focused.role}</span><h3>{focused.name}</h3></div><p>{focused.behavior}</p><dl><div><dt>Skill</dt><dd>{focused.skill}</dd></div><div><dt>Current action</dt><dd data-testid="arena-intent">{focused.intent}</dd></div><div><dt>Target</dt><dd>{frame.units.find((unit) => unit.id === focused.targetId)?.name || '—'}</dd></div><div><dt>Mana</dt><dd>{focused.mana}/100</dd></div></dl></section>
        <section className="arena-unit-speeds" aria-label="Unit speeds"><h3>Unit speeds</h3><p>Adjust before battle. Each teammate moves and attacks at their own pace.</p>
          <label>Attack speed <strong>{focused.attackSpeed.toFixed(2)} /s</strong><input type="range" min="0.4" max="3" step="0.05" aria-label="Attack speed" value={focused.attackSpeed} disabled={phase !== 'placement'} onChange={(event) => setTuning((current) => ({ ...current, [selected]: { ...current[selected], attackSpeed: Number(event.target.value) } }))} /></label>
          <label>Movement speed <strong>{focused.moveSpeed.toFixed(2)} tiles/s</strong><input type="range" min="1" max="4" step="0.05" aria-label="Movement speed" value={focused.moveSpeed} disabled={phase !== 'placement'} onChange={(event) => setTuning((current) => ({ ...current, [selected]: { ...current[selected], moveSpeed: Number(event.target.value) } }))} /></label>
          <button disabled={phase !== 'placement'} onClick={() => setTuning((current) => { const next = { ...current }; delete next[selected]; return next; })}>Reset unit speeds</button>
        </section>
        <section className="arena-moments"><h3>Battle moments</h3>{recentEvents.length ? <ol>{recentEvents.map((event, index) => <li key={`${event.tick}-${index}`}><time>{clock(event.tick * ARENA_TICK_SECONDS)}</time><span><strong>{ARENA_ROSTER.find((unit) => unit.id === event.actor).name}</strong>{event.type === 'down' ? ` defeats ${ARENA_ROSTER.find((unit) => unit.id === event.target).name}` : ` · ${event.label}`}</span></li>)}</ol> : <p>Signature skills and defeats will appear here.</p>}</section>
      </aside>
      <footer className="arena-footer">Formation changes the fight. Frontline closes in, ranged keeps distance, support follows injured allies.<span>Sandbox · No rewards or saved progress</span></footer>
    </main>
  </div>;
}
