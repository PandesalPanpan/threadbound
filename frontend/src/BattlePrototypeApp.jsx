import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, commandKey, connectRealtime, getDashboard, getStream, getVisualAssets } from './api/client.js';
import { BattleArena } from './components/BattleArena.jsx';
import { ChatFeed } from './components/ChatFeed.jsx';
import { ContextRail } from './components/ContextRail.jsx';

const PLAYBACK_MS = Object.freeze(globalThis.__THREADBOUND_FAST_TEST__
  ? { impact: 90, skill: 120, settle: 55 }
  : { impact: 360, skill: 470, settle: 180 });
const replaySource = new URLSearchParams(window.location.search).get('source');

function storedBattleReplay() {
  if (!replaySource) return null;
  try {
    return JSON.parse(window.sessionStorage.getItem('threadbound:battle-replay') || 'null');
  } catch {
    return null;
  }
}

function startedSnapshot(payload) {
  return payload?.battle?.events?.find((event) => event.type === 'BattleStarted')?.combatants
    || payload?.battle?.combatants
    || [];
}

function completedSnapshot(payload) {
  return payload?.battle?.events?.findLast?.((event) => event.type === 'BattleCompleted')?.combatants
    || payload?.battle?.combatants
    || startedSnapshot(payload);
}

function initialFrame(payload) {
  return { combatants: structuredClone(startedSnapshot(payload)), currentTurn: 0, active: null, lastTurn: null };
}

function resultFrame(payload) {
  return { combatants: structuredClone(completedSnapshot(payload)), currentTurn: payload?.battle?.turns?.length || 0, active: null, lastTurn: payload?.battle?.turns?.at?.(-1) || null };
}

function timelineFor(payload) {
  const turns = Array.isArray(payload?.battle?.turns) ? payload.battle.turns : [];
  const events = Array.isArray(payload?.battle?.events) ? payload.battle.events : [];
  const snapshots = new Map(events.filter((event) => event.type === 'TurnResolved' && Array.isArray(event.combatants)).map((event) => [Number(event.turnNumber), event.combatants]));
  return turns.map((turn) => {
    const number = Number(turn.turnNumber);
    const actionEvent = events.find((event) => Number(event.turnNumber) === number && (event.type === 'SkillCastStarted' || event.type === 'BasicAttackStarted'));
    const skillEvent = events.find((event) => Number(event.turnNumber) === number && event.type === 'SkillCastStarted');
    return {
      turn,
      snapshot: snapshots.get(number) || null,
      active: {
        type: skillEvent ? 'SkillCastStarted' : 'BasicAttackStarted',
        actionType: turn.metadata?.actionType || actionEvent?.type || 'basic-attack',
        actorId: turn.actorId,
        targetId: turn.targetId,
        skillId: turn.metadata?.skillId || skillEvent?.skillId || null,
        skillName: skillEvent?.skillName || null,
        damage: Number(turn.targetDamage || 0),
        healing: Number(turn.selfHealing || 0),
        critical: Boolean(turn.metadata?.critical),
        turnNumber: number,
      },
    };
  });
}

function storageKey(payload) {
  return payload?.battleId ? `threadbound:battle-simulation:${payload.battleId}` : null;
}

export function BattlePrototypeApp() {
  const [dashboard, setDashboard] = useState(null);
  const [assets, setAssets] = useState([]);
  const [entries, setEntries] = useState([]);
  const [payload, setPayload] = useState(null);
  const [display, setDisplay] = useState({ phase: 'preBattle', frame: initialFrame(null) });
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    const storedReplay = storedBattleReplay();
    const [nextDashboard, assetPayload, streamPayload, battlePayload] = await Promise.all([
      getDashboard(),
      getVisualAssets(),
      getStream({ limit: 30 }),
      storedReplay ? Promise.resolve(storedReplay) : api('/api/battle-simulation'),
    ]);
    if (cancelledRef.current) return;
    setDashboard(nextDashboard);
    setAssets(assetPayload?.assets || []);
    setEntries(streamPayload?.entries || []);
    setPayload(battlePayload);
    const key = replaySource ? null : storageKey(battlePayload);
    const resumed = key && window.sessionStorage.getItem(key);
    setDisplay({ phase: resumed ? 'result' : 'preBattle', frame: resumed ? resultFrame(battlePayload) : initialFrame(battlePayload) });
    if (replaySource && !storedReplay) setError('That battle replay is no longer available. Showing the Battle Simulation demo instead.');
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    load().catch((caught) => { if (!cancelledRef.current) setError(caught.message); });
    return () => { cancelledRef.current = true; };
  }, [load]);

  useEffect(() => {
    let closed = false;
    let closeSocket = () => {};
    connectRealtime((message) => {
      if (closed) return;
      setConnected(true);
      if (message.type === 'stream_entry' && message.entry) {
        setEntries((current) => [...current.filter((entry) => entry.id !== message.entry.id), message.entry].slice(-30));
      }
      if (message.type === 'state_changed' && !playing) {
        getDashboard().then((nextDashboard) => { if (!closed) setDashboard(nextDashboard); }).catch(() => {});
      }
    }).then((close) => { if (!closed) { closeSocket = close; setConnected(true); } }).catch(() => { if (!closed) setConnected(false); });
    return () => { closed = true; closeSocket(); };
  }, [playing]);

  const timeline = useMemo(() => timelineFor(payload), [payload]);

  useEffect(() => {
    if (!playing || step < 0 || !timeline[step]) return undefined;
    const current = timeline[step];
    const skill = current.active.actionType === 'skill' || current.active.type === 'SkillCastStarted';
    setDisplay((state) => ({ ...state, phase: skill ? 'skillCast' : 'impact', active: current.active }));
    const timer = window.setTimeout(() => {
      const isLast = step >= timeline.length - 1;
      setDisplay((state) => ({
        phase: isLast ? 'result' : 'live',
        frame: {
          combatants: structuredClone(current.snapshot || state.frame.combatants),
          currentTurn: current.turn.turnNumber,
          active: null,
          lastTurn: current.turn,
        },
      }));
      setStep((index) => index + 1);
      if (isLast) setPlaying(false);
    }, (skill ? PLAYBACK_MS.skill : PLAYBACK_MS.impact) + PLAYBACK_MS.settle);
    return () => window.clearTimeout(timer);
  }, [playing, step, timeline]);

  const start = useCallback(async () => {
    if (busy || !payload) return;
    setBusy(true);
    setError('');
    try {
      const nextPayload = replaySource
        ? payload
        : await api('/api/battle-simulation', { method: 'POST', headers: { 'Idempotency-Key': commandKey('battle-simulation') } });
      setPayload(nextPayload);
      const key = replaySource ? null : storageKey(nextPayload);
      if (key) window.sessionStorage.setItem(key, 'started');
      setDisplay({ phase: 'live', frame: initialFrame(nextPayload) });
      setStep(0);
      setPlaying(true);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }, [busy, payload]);

  const replay = useCallback(() => {
    if (!payload || busy) return;
    const key = storageKey(payload);
    if (key) window.sessionStorage.removeItem(key);
    setDisplay({ phase: 'preBattle', frame: initialFrame(payload) });
    setStep(-1);
  }, [busy, payload]);

  const goToStream = () => { window.location.href = '/game'; };
  if (!dashboard || !payload) return <main className="battle-loading"><span className="loading-orbit" />Loading the battle thread…</main>;

  return (
    <div className="battle-app">
      <header className="battle-topbar">
        <a className="battle-brand" href="/game" aria-label="Threadbound Adventure Stream"><span className="brand-mark">✦</span><span>THREADBOUND</span></a>
        <div className="battle-topbar__context"><span className="panel-kicker">{replaySource ? 'HUNT REPLAY' : 'BATTLE SIMULATION'}</span><span>{replaySource ? 'Exact committed Hunt events · shared replay' : 'Server-resolved event stream · Figma keyframe study'}</span></div>
        <nav className="battle-nav" aria-label="Threadbound"><a href="/game">Play</a><a href="/codex">Codex</a>{dashboard.capabilities?.arcWorkshop ? <a href="/arc-workshop">Arc Workshop</a> : null}</nav>
      </header>
      <main className="battle-layout">
        <aside className="battle-left"><ChatFeed entries={entries} /><div className="battle-left__footer"><span>Authoritative replay · {payload.battle.turns.length} turns</span><a href="/game">Back to Adventure Stream ↗</a></div></aside>
        <section className="battle-main" aria-label="Automatic battle simulation">
          <div className="battle-intro"><div><span className="panel-kicker">{replaySource ? 'AUTHORITATIVE HUNT REPLAY' : 'WATCH THE THREADS FIGHT'}</span><h1>{replaySource ? 'This is what actually happened.' : 'Every strike lands once.'}</h1><p>{replaySource ? 'The player, enemy, equipment snapshot, damage, HP changes, and turn order come from the Hunt that was already committed by the server.' : 'Threadbound resolves the full battle on the server. This surface replays its committed events, Mana changes, HP snapshots, and result receipt.'}</p></div><button className="back-button" type="button" onClick={goToStream}>← Adventure Stream</button></div>
          {error ? <div className="battle-error" role="alert" data-testid="battle-error">{error}</div> : null}
          <BattleArena payload={payload} assets={assets} frame={display.frame} phase={display.phase} active={display.active || null} busy={busy || playing} onStart={start} onReplay={replay} onBack={goToStream} />
        </section>
        <ContextRail dashboard={dashboard} connected={connected} />
      </main>
    </div>
  );
}
