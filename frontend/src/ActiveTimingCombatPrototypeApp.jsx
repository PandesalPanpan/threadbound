import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { resolveThreadboundCharacterVisual } from '../../public/character-asset-policy.js';
import { ACTIVE_TIMING_CONFIG as CONFIG } from './battle/activeTimingConfig.js';
import { ACTIVE_TIMING_PHASE as PHASE, activeTimingReducer, combatSummary, createInitialCombatState } from './battle/activeTimingCombat.js';
import { createActiveTimingChoreography } from './battle/activeTimingChoreography.js';
import './ActiveTimingCombatPrototypeApp.css';

gsap.registerPlugin(useGSAP);

const PLAYER_ART = resolveThreadboundCharacterVisual({ visualAssetId: 'character.road-sellsword.v1' }, 'character');
const ENEMY_ART = resolveThreadboundCharacterVisual({ visualAssetId: 'mob.brown-boar.v1' }, 'mob');

function hpPercent(unit) {
  return Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
}

function durationLabel(durationMs) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function inputGradeFor(state) {
  if (state.phase === PHASE.PLAYER_TIMING && state.action === 'ATTACK') return 'attack';
  if (state.phase === PHASE.PLAYER_TIMING && state.action === 'SKILL') return 'skill';
  if (state.phase === PHASE.ENEMY_TIMING) return 'defense';
  return null;
}

function currentTiming(state) {
  if (state.phase === PHASE.PLAYER_TIMING && state.action === 'ATTACK') {
    return { startedAt: state.timingStartedAt, targetMs: CONFIG.attack.targetMs, durationMs: CONFIG.attack.durationMs, windows: CONFIG.attack.windows, type: 'attack' };
  }
  if (state.phase === PHASE.PLAYER_TIMING && state.action === 'SKILL') {
    return { startedAt: state.timingStartedAt, targetMs: CONFIG.skill.targetHoldMs, durationMs: CONFIG.skill.durationMs, windows: CONFIG.skill.windows, type: 'skill' };
  }
  if (state.phase === PHASE.ENEMY_TIMING) {
    const hit = state.currentPattern?.hits?.[state.defenseIndex];
    return { startedAt: state.timingStartedAt, targetMs: hit?.targetMs || 0, durationMs: state.currentPattern?.timingDurationMs || 1, windows: { perfectMs: CONFIG.defense.perfectMs + (state.guardReady ? CONFIG.defense.guardWindowBonusMs : 0), goodMs: CONFIG.defense.guardMs + (state.guardReady ? CONFIG.defense.guardWindowBonusMs : 0) }, type: 'defense' };
  }
  return null;
}

function promptFor(state) {
  switch (state.phase) {
    case PHASE.READY: return 'One Weaver. One enemy. Your timing changes every exchange.';
    case PHASE.PLAYER_CHOICE: return 'Your move. Choose an action for this turn.';
    case PHASE.PLAYER_TIMING:
      if (state.action === 'SKILL') return state.timingStartedAt == null
        ? 'Touch and hold anywhere in the arena.'
        : 'Release when the gold thread reaches the bright zone.';
      return 'Tap anywhere in the arena when the thread enters the bright zone.';
    case PHASE.PLAYER_IMPACT: return `${state.feedback?.label || 'HIT'} · ${state.feedback?.damage || 0} damage`;
    case PHASE.ENEMY_TELEGRAPH: return state.currentPattern?.telegraph || 'The enemy is preparing to strike.';
    case PHASE.ENEMY_TIMING: return state.defenseIndex > 0
      ? 'Second hit. Tap the arena again to guard.'
      : 'Tap anywhere in the arena as the enemy strikes.';
    case PHASE.ENEMY_IMPACT: return `${state.feedback?.label || 'HIT'} · −${state.feedback?.damage || 0} HP`;
    case PHASE.NEXT_TURN: return 'The thread settles. Get ready for your next move.';
    case PHASE.RESULT: return state.outcome === 'VICTORY' ? 'The Ribbon Boar is down.' : 'Your Weaver has fallen.';
    default: return '';
  }
}

function controlsStatusFor(state) {
  if (state.phase === PHASE.PLAYER_TIMING && state.action === 'ATTACK') return { label: 'ATTACK TIMING', detail: 'Tap anywhere in the arena.' };
  if (state.phase === PHASE.PLAYER_TIMING && state.action === 'SKILL') return { label: 'SKILL · HOLD → RELEASE', detail: state.timingStartedAt == null ? 'Hold anywhere in the arena.' : 'Release inside the gold zone.' };
  if (state.phase === PHASE.PLAYER_IMPACT) return { label: 'ATTACK RESULT', detail: 'Your timing changed the damage.' };
  if (state.phase === PHASE.ENEMY_TELEGRAPH) return { label: 'READ THE TELL', detail: 'Get your thumb ready.' };
  if (state.phase === PHASE.ENEMY_TIMING) return { label: 'YOUR DEFENSE', detail: 'Tap the arena as the enemy strikes.' };
  if (state.phase === PHASE.ENEMY_IMPACT) return { label: 'DEFENSE RESULT', detail: 'Your timing changed the HP loss.' };
  return { label: 'NEXT TURN', detail: 'The next move is close.' };
}

function Meter({ timing, guardReady, arenaRef }) {
  const meterRef = useRef(null);
  const cursorRef = useRef(null);

  useGSAP(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    if (timing.startedAt == null) {
      gsap.set(cursor, { scaleX: 0 });
      if (arenaRef.current) arenaRef.current.dataset.progress = '0.0';
      return;
    }

    const duration = Math.max(1, timing.durationMs);
    const elapsed = Math.max(0, performance.now() - timing.startedAt);
    const initialProgress = Math.min(1, elapsed / duration);
    gsap.set(cursor, { scaleX: initialProgress });
    if (arenaRef.current) arenaRef.current.dataset.progress = (initialProgress * 100).toFixed(1);
    if (initialProgress >= 1) return;

    gsap.to(cursor, {
      scaleX: 1,
      duration: (duration - elapsed) / 1000,
      ease: 'none',
      overwrite: 'auto',
      onUpdate() {
        if (arenaRef.current) {
          const progress = initialProgress + this.progress() * (1 - initialProgress);
          arenaRef.current.dataset.progress = (progress * 100).toFixed(1);
        }
      },
    });
  }, { scope: meterRef, dependencies: [timing.startedAt, timing.durationMs], revertOnUpdate: true });

  if (!timing) return null;
  const target = timing.durationMs > 0 ? (timing.targetMs / timing.durationMs) * 100 : 0;
  const windows = timing.windows;
  const outside = timing.type === 'defense' ? windows.goodMs : windows.normalMs;
  const width = timing.durationMs > 0 ? (outside * 2 / timing.durationMs) * 100 : 0;
  const perfectWidth = timing.durationMs > 0 ? (windows.perfectMs * 2 / timing.durationMs) * 100 : 0;
  return (
    <div ref={meterRef} className={`active-timing-meter active-timing-meter--${timing.type}`} aria-hidden="true" data-testid="active-timing-meter">
      <div className="active-timing-meter__labels"><span>{timing.type === 'defense' ? 'TAP TO GUARD' : timing.type === 'skill' ? 'HOLD → RELEASE' : 'TAP TO STRIKE'}</span><span>{guardReady && timing.type === 'defense' ? 'GUARD BOOST' : 'TIMING ZONE'}</span></div>
      <div className="active-timing-meter__track">
        <span className="active-timing-meter__good" style={{ left: `${target - width / 2}%`, width: `${width}%` }} />
        <span className="active-timing-meter__perfect" style={{ left: `${target - perfectWidth / 2}%`, width: `${perfectWidth}%` }} />
        <span className="active-timing-meter__target" style={{ left: `${target}%` }} />
        {timing.startedAt != null ? <span ref={cursorRef} className="active-timing-meter__cursor" /> : null}
      </div>
    </div>
  );
}

function HealthReadout({ label, unit, side }) {
  return (
    <div className={`active-timing-health active-timing-health--${side}`} data-testid={`active-timing-${side}-health`}>
      <div className="active-timing-health__line"><span>{label}</span><strong>{unit.hp}/{unit.maxHp} HP</strong></div>
      <div className="active-timing-health__track" role="meter" aria-label={`${label} Health`} aria-valuenow={unit.hp} aria-valuemin="0" aria-valuemax={unit.maxHp}>
        <span style={{ transform: `scaleX(${hpPercent(unit) / 100})` }} />
      </div>
    </div>
  );
}

function TimingDebug({ state, timing }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (timing?.startedAt == null) {
      setElapsedMs(0);
      return undefined;
    }
    const update = () => setElapsedMs(Math.max(0, performance.now() - timing.startedAt));
    update();
    const interval = window.setInterval(update, 80);
    return () => window.clearInterval(interval);
  }, [timing?.startedAt]);

  const offset = timing?.startedAt == null ? null : Math.round(elapsedMs - timing.targetMs);
  return (
    <aside className="active-timing-debug" data-testid="active-timing-debug">
      <div className="active-timing-debug__title"><strong>LOCAL TUNING</strong><span>not sent anywhere</span></div>
      <dl>
        <div><dt>State</dt><dd>{state.phase}</dd></div>
        <div><dt>Attack pattern</dt><dd>{state.currentPattern?.name || '—'}</dd></div>
        <div><dt>Target</dt><dd>{timing ? `${timing.targetMs} ms` : '—'}</dd></div>
        <div><dt>Elapsed</dt><dd>{timing?.startedAt == null ? '—' : `${Math.round(elapsedMs)} ms`}</dd></div>
        <div><dt>Offset</dt><dd>{offset == null ? '—' : `${offset > 0 ? '+' : ''}${offset} ms`}</dd></div>
        <div><dt>Perfect / good</dt><dd>{timing ? `${timing.windows.perfectMs} / ${timing.windows.goodMs} ms` : '—'}</dd></div>
        <div><dt>Last grade</dt><dd>{state.feedback?.label || '—'}</dd></div>
      </dl>
    </aside>
  );
}

function ResultSummary({ state, rating, onRate, onAgain }) {
  const summary = combatSummary(state);
  const cards = [
    ['TIME', durationLabel(summary.durationMs)],
    ['TURNS', String(summary.turns)],
    ['ATTACKS', `${summary.attacksAttempted} · ${summary.skillsAttempted} skills`],
    ['TIMING', `${summary.perfect} perfect · ${summary.good} good`],
    ['DEFENSE', `${summary.perfectGuards} perfect · ${summary.guards} guards · ${summary.missedDefenses} missed`],
    ['DAMAGE', `${summary.damageDealt} dealt · ${summary.damageReceived} received`],
    ['AVG OFFSET', `${summary.averageAbsTimingOffsetMs} ms`],
    ['ITEMS / GUARD', `${summary.itemsUsed} / ${summary.guardActions}`],
  ];
  return (
    <section className="active-timing-result" data-testid="active-timing-result" aria-labelledby="active-timing-result-title">
      <div className={`active-timing-result__banner ${state.outcome === 'VICTORY' ? 'is-win' : 'is-loss'}`}>
        <span>{state.outcome === 'VICTORY' ? 'VICTORY' : 'DEFEAT'}</span>
        <strong id="active-timing-result-title">{state.outcome === 'VICTORY' ? 'The thread holds.' : 'The boar wins this round.'}</strong>
      </div>
      <div className="active-timing-result__stats" aria-label="Fight statistics">
        {cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <fieldset className="active-timing-rating">
        <legend>Was that fun?</legend>
        <div>{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" aria-label={`${score} out of 5`} aria-pressed={rating === score} className={rating === score ? 'is-selected' : ''} onClick={() => onRate(score)}>{score}</button>)}</div>
        <small>{rating ? `Thanks — ${rating}/5 saved for this session.` : 'Your answer stays in this browser session.'}</small>
      </fieldset>
      <button className="active-timing-fight-again" type="button" data-testid="active-timing-fight-again" onClick={onAgain}>FIGHT AGAIN <span aria-hidden="true">↻</span></button>
    </section>
  );
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (event) => setReducedMotion(event.matches);
    preference.addEventListener?.('change', update);
    return () => preference.removeEventListener?.('change', update);
  }, []);
  return reducedMotion;
}

export function ActiveTimingCombatPrototypeApp() {
  const [state, dispatch] = useReducer(activeTimingReducer, undefined, createInitialCombatState);
  const [debugOpen, setDebugOpen] = useState(false);
  const [rating, setRating] = useState(null);
  const prefersReducedMotion = useReducedMotionPreference();
  const rootRef = useRef(null);
  const arenaRef = useRef(null);
  const previousStateRef = useRef(state);
  const transitionRef = useRef(() => {});
  const heldPointerRef = useRef(null);
  const heldKeyboardRef = useRef(false);

  const timing = useMemo(() => currentTiming(state), [state]);
  const prompt = promptFor(state);

  useGSAP((_, contextSafe) => {
    const choreography = createActiveTimingChoreography({ root: rootRef.current, gsap, reducedMotion: prefersReducedMotion });
    transitionRef.current = contextSafe((previous, next, nextTiming) => choreography.transition(previous, next, nextTiming, CONFIG.feedback.hitStopMs));
    choreography.playIdle();
    return () => {
      transitionRef.current = () => {};
      choreography.destroy();
    };
  }, { scope: rootRef, dependencies: [prefersReducedMotion], revertOnUpdate: true });

  useLayoutEffect(() => {
    const previous = previousStateRef.current;
    if (previous !== state) {
      transitionRef.current(previous, state, timing);
      previousStateRef.current = state;
    }
  }, [state, timing]);

  useEffect(() => {
    let delay;
    let type;
    switch (state.phase) {
      case PHASE.PLAYER_TIMING:
        if (state.action === 'ATTACK') { delay = CONFIG.attack.durationMs; type = 'PLAYER_TIMING_TIMEOUT'; }
        break;
      case PHASE.PLAYER_IMPACT: delay = CONFIG.feedback.playerImpactMs; type = 'PLAYER_IMPACT_DONE'; break;
      case PHASE.ENEMY_TELEGRAPH: delay = state.currentPattern?.telegraphMs || 0; type = 'ENEMY_TELEGRAPH_DONE'; break;
      case PHASE.ENEMY_TIMING: delay = state.currentPattern?.timingDurationMs || 0; type = 'DEFENSE_TIMEOUT'; break;
      case PHASE.ENEMY_IMPACT:
        delay = state.currentPattern?.hits?.length > 1 ? CONFIG.feedback.doubleHitPauseMs : CONFIG.feedback.enemyImpactMs;
        type = 'ENEMY_IMPACT_DONE';
        break;
      case PHASE.NEXT_TURN: delay = CONFIG.feedback.nextTurnMs; type = 'NEXT_TURN_DONE'; break;
      default: break;
    }
    if (!type || !Number.isFinite(delay)) return undefined;
    const timer = window.setTimeout(() => dispatch({ type, now: performance.now() }), delay);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.action, state.currentPattern, state.defenseIndex]);

  useEffect(() => {
    if (![PHASE.PLAYER_TIMING, PHASE.ENEMY_TIMING].includes(state.phase)) return;
    arenaRef.current?.focus({ preventScroll: true });
  }, [state.phase, state.action, state.defenseIndex]);

  const vibrate = useCallback(() => {
    try { window.navigator?.vibrate?.(18); } catch { /* Optional device feedback. */ }
  }, []);

  const chooseAction = useCallback((action) => {
    dispatch({ type: 'CHOOSE_ACTION', action, now: performance.now() });
  }, []);

  const startSkillHold = useCallback((now) => {
    if (state.phase !== PHASE.PLAYER_TIMING || state.action !== 'SKILL' || state.timingStartedAt != null) return;
    dispatch({ type: 'SKILL_HOLD_START', now });
  }, [state.phase, state.action, state.timingStartedAt]);

  const handlePointerDown = useCallback((event) => {
    if (!event.isPrimary) return;
    const now = performance.now();
    if (state.phase === PHASE.PLAYER_TIMING && state.action === 'ATTACK') {
      event.preventDefault();
      dispatch({ type: 'ATTACK_TAP', now });
      vibrate();
    } else if (state.phase === PHASE.PLAYER_TIMING && state.action === 'SKILL') {
      event.preventDefault();
      heldPointerRef.current = event.pointerId;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events do not capture. */ }
      startSkillHold(now);
    } else if (state.phase === PHASE.ENEMY_TIMING) {
      event.preventDefault();
      dispatch({ type: 'DEFENSE_TAP', now });
      vibrate();
    }
  }, [state.phase, state.action, startSkillHold, vibrate]);

  const handlePointerUp = useCallback((event) => {
    if (heldPointerRef.current == null || heldPointerRef.current !== event.pointerId) return;
    heldPointerRef.current = null;
    dispatch({ type: 'SKILL_HOLD_RELEASE', now: performance.now() });
    vibrate();
  }, [vibrate]);

  const handlePointerCancel = useCallback((event) => {
    if (heldPointerRef.current == null || heldPointerRef.current !== event.pointerId) return;
    heldPointerRef.current = null;
    dispatch({ type: 'SKILL_HOLD_RELEASE', now: performance.now() });
  }, []);

  useEffect(() => {
    const isTimingKey = (event) => event.code === 'Space' || event.code === 'Enter';
    const onKeyDown = (event) => {
      if (!isTimingKey(event) || event.repeat) return;
      if (state.phase === PHASE.PLAYER_TIMING && state.action === 'SKILL') {
        event.preventDefault();
        heldKeyboardRef.current = true;
        startSkillHold(performance.now());
      } else if (state.phase === PHASE.PLAYER_TIMING && state.action === 'ATTACK') {
        event.preventDefault();
        dispatch({ type: 'ATTACK_TAP', now: performance.now() });
        vibrate();
      } else if (state.phase === PHASE.ENEMY_TIMING) {
        event.preventDefault();
        dispatch({ type: 'DEFENSE_TAP', now: performance.now() });
        vibrate();
      }
    };
    const onKeyUp = (event) => {
      if (!isTimingKey(event) || !heldKeyboardRef.current) return;
      event.preventDefault();
      heldKeyboardRef.current = false;
      dispatch({ type: 'SKILL_HOLD_RELEASE', now: performance.now() });
      vibrate();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [state.phase, state.action, startSkillHold, vibrate]);

  const onAgain = useCallback(() => {
    setRating(null);
    dispatch({ type: 'START_FIGHT', now: performance.now() });
  }, []);

  const inputType = inputGradeFor(state);
  const controlsStatus = controlsStatusFor(state);
  const target = timing?.targetMs || 0;
  const dataTiming = timing?.startedAt == null ? '' : String(timing.startedAt);
  const stageClass = [
    'active-timing-arena',
    `is-${state.phase.toLowerCase().replaceAll('_', '-')}`,
    state.action === 'ATTACK' ? 'is-player-attacking' : '',
    state.action === 'SKILL' && state.timingStartedAt != null ? 'is-skill-held' : '',
    state.guardReady ? 'is-guard-ready' : '',
    state.feedback?.kind === 'player' ? 'has-player-impact' : '',
    state.feedback?.kind === 'enemy' ? 'has-enemy-impact' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className="active-timing-page" data-prototype="active-timing" data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}>
      <header className="active-timing-topbar">
        <a className="active-timing-brand" href="/game" aria-label="Return to Threadbound Adventure Stream"><span>✦</span> THREADBOUND</a>
        <div className="active-timing-topbar__tag"><span>GAMEPLAY EXPERIMENT</span><strong>ACTIVE TIMING · 1V1</strong></div>
        <button className={`active-timing-debug-toggle ${debugOpen ? 'is-open' : ''}`} type="button" aria-expanded={debugOpen} onClick={() => setDebugOpen((open) => !open)} data-testid="active-timing-debug-toggle">TUNING</button>
      </header>

      <main className="active-timing-main">
        <div className="active-timing-heading">
          <div><span className="active-timing-kicker">THREADBOUND · COMBAT LAB</span><h1>Face the Ribbon Boar</h1></div>
          <span className="active-timing-local"><i /> LOCAL ONLY</span>
        </div>
        <div className="active-timing-turnline" data-testid="active-timing-turnline"><span>{state.phase === PHASE.RESULT ? state.outcome : state.phase.replaceAll('_', ' ')}</span><strong>{state.turn ? `TURN ${state.turn}` : 'READY'}</strong></div>

        <section
          ref={arenaRef}
          className={stageClass}
          role="group"
          tabIndex={0}
          aria-label="Combat arena. Tap anywhere here to strike or defend. Hold and release here to use Skill."
          data-testid="active-timing-arena"
          data-phase={state.phase}
          data-pattern={state.currentPattern?.id || ''}
          data-action={state.action || ''}
          data-start-at-ms={dataTiming}
          data-target-ms={timing ? target : ''}
          data-duration-ms={timing?.durationMs || ''}
          data-progress="0.0"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div className="active-timing-arena__stars" aria-hidden="true" />
          <div className="active-timing-arena__header"><span>{state.currentPattern ? `ENEMY TELL · ${state.currentPattern.name.toUpperCase()}` : 'A QUIET PATCH OF THREAD'}</span><span>{state.phase === PHASE.PLAYER_CHOICE ? 'YOUR MOVE' : state.phase === PHASE.ENEMY_TIMING ? 'DEFEND NOW' : ''}</span></div>
          <HealthReadout label="RIBBON BOAR" unit={state.enemy} side="enemy" />
          <HealthReadout label="YOUR WEAVER" unit={state.player} side="player" />
          <div className="active-timing-scene" aria-hidden="true">
            <div className="active-timing-threadline"><span /><i /><b /></div>
            <div className="active-timing-stage-slot active-timing-stage-slot--player">
              <div className="active-timing-unit__shadow active-timing-unit__shadow--player" />
              <div className="active-timing-unit active-timing-unit--player">
                <div className="active-timing-unit__halo" />
                <span className="active-timing-unit__flash" />
                {PLAYER_ART ? <img src={PLAYER_ART.src} alt="" data-visual-asset-id={PLAYER_ART.id} fetchPriority="high" /> : <span className="active-timing-unit__fallback">✦</span>}
              </div>
            </div>
            <div className="active-timing-stage-slot active-timing-stage-slot--enemy">
              <div className="active-timing-unit__shadow active-timing-unit__shadow--enemy" />
              <div className="active-timing-unit active-timing-unit--enemy">
                <div className="active-timing-unit__halo" />
                <span className="active-timing-unit__flash" />
                {ENEMY_ART ? <img src={ENEMY_ART.src} alt="" data-visual-asset-id={ENEMY_ART.id} fetchPriority="high" /> : <span className="active-timing-unit__fallback">◈</span>}
              </div>
            </div>
            <div className="active-timing-fx" data-testid="active-timing-fx" />
          </div>
          {timing ? <Meter timing={timing} guardReady={state.guardReady} arenaRef={arenaRef} /> : null}
          {state.feedback?.kind === 'player' || state.feedback?.kind === 'enemy' || state.feedback?.kind === 'item' || state.feedback?.kind === 'guard'
            ? <div className={`active-timing-hit active-timing-hit--${state.feedback.kind} ${state.feedback.grade === 'PERFECT_GUARD' || state.feedback.grade === 'PERFECT' ? 'is-perfect' : ''} ${state.feedback.grade === 'GOOD' ? 'is-strong' : ''}`} data-testid="active-timing-hit" aria-live="assertive"><strong>{state.feedback.label}</strong><span>{state.feedback.kind === 'item' ? `+${state.feedback.healing} HP` : state.feedback.kind === 'guard' ? 'NEXT HIT REDUCED' : `−${state.feedback.damage} HP`}</span></div>
            : null}
          {state.phase === PHASE.ENEMY_TELEGRAPH ? <div className={`active-timing-telegraph active-timing-telegraph--${state.currentPattern?.id || ''}`} data-testid="active-timing-telegraph"><span>INCOMING</span><strong>{state.currentPattern?.name}</strong><small>{state.currentPattern?.telegraph}</small></div> : null}
          <div className="active-timing-prompt" data-testid="active-timing-prompt" aria-live="polite">
            <strong>{prompt}</strong>
            {inputType ? <span>{inputType === 'skill' ? 'HOLD, THEN RELEASE' : 'THE WHOLE ARENA IS YOUR INPUT'}</span> : null}
          </div>
        </section>

        {state.phase === PHASE.READY ? (
          <section className="active-timing-controls active-timing-controls--ready" aria-label="Start fight">
            <p>Attack on the beat, release a charged Skill, and tap to guard. This fight changes no Threadbound character, inventory, or progression.</p>
            <button className="active-timing-start" type="button" data-testid="active-timing-start" onClick={() => dispatch({ type: 'START_FIGHT', now: performance.now() })}>START FIGHT <span aria-hidden="true">→</span></button>
          </section>
        ) : state.phase === PHASE.RESULT ? (
          <ResultSummary state={state} rating={rating} onRate={setRating} onAgain={onAgain} />
        ) : state.phase === PHASE.PLAYER_CHOICE ? (
          <section className="active-timing-controls" aria-label="Choose your action">
            <div className="active-timing-controls__label"><span>YOUR MOVE</span><small>One action per turn</small></div>
            <div className="active-timing-actions">
              <button type="button" data-testid="active-timing-action-attack" onClick={() => chooseAction('ATTACK')}><span className="active-timing-action__icon">✦</span><span><strong>ATTACK</strong><small>Tap timing</small></span></button>
              <button type="button" data-testid="active-timing-action-skill" onClick={() => chooseAction('SKILL')}><span className="active-timing-action__icon active-timing-action__icon--skill">⌁</span><span><strong>SKILL</strong><small>Hold → release</small></span></button>
              <button type="button" data-testid="active-timing-action-item" onClick={() => chooseAction('ITEM')} disabled={state.player.potions <= 0 || state.player.hp >= state.player.maxHp}><span className="active-timing-action__icon active-timing-action__icon--item">✚</span><span><strong>ITEM <em>×{state.player.potions}</em></strong><small>Health Potion</small></span></button>
              <button type="button" data-testid="active-timing-action-guard" onClick={() => chooseAction('GUARD')}><span className="active-timing-action__icon active-timing-action__icon--guard">⬡</span><span><strong>GUARD</strong><small>Protect next hit</small></span></button>
            </div>
          </section>
        ) : (
          <section className="active-timing-controls active-timing-controls--waiting" aria-label="Combat status">
            <div className="active-timing-waiting-mark" aria-hidden="true"><span /></div>
            <div><span className="active-timing-controls__label">{controlsStatus.label}</span><strong>{controlsStatus.detail}</strong></div>
            {state.guardReady ? <span className="active-timing-guard-chip">GUARD READY</span> : null}
          </section>
        )}

        <p className="active-timing-footnote">Prototype combat is local to this page. Refresh to reset. No rewards or character data are read or changed.</p>
      </main>
      {debugOpen ? <TimingDebug state={state} timing={timing} /> : null}
    </div>
  );
}
