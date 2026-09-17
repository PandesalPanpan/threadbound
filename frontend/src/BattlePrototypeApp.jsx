import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, commandKey, connectRealtime, getDashboard, getStream, getVisualAssets } from './api/client.js';
import { battleViewModel, phaseFromRun, projectCombatOutcome, selectSkill } from './battle/presentation.js';
import { BattleArena } from './components/BattleArena.jsx';
import { ChatFeed } from './components/ChatFeed.jsx';
import { ContextRail } from './components/ContextRail.jsx';

const ANIMATION_MS = Object.freeze(globalThis.__THREADBOUND_FAST_TEST__
  ? { attack: 120, skill: 150 }
  : { attack: 1050, skill: 1300 });

function receiptFor({ action, outcome }) {
  const damage = Number(outcome?.damage || 0);
  const label = action === 'skill' ? 'Skill cast' : 'Attack landed';
  return {
    title: label,
    copy: damage > 0 ? `−${damage} HP · Threadbound committed the result.` : 'The action resolved without damage.',
  };
}

export function BattlePrototypeApp() {
  const [dashboard, setDashboard] = useState(null);
  const [assets, setAssets] = useState([]);
  const [entries, setEntries] = useState([]);
  const [outcome, setOutcome] = useState(null);
  const [previousRun, setPreviousRun] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [phase, setPhase] = useState('preBattle');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const refresh = useCallback(async ({ includeStream = false } = {}) => {
    const [nextDashboard, nextStream] = await Promise.all([getDashboard(), includeStream ? getStream() : Promise.resolve(null)]);
    setDashboard(nextDashboard);
    if (nextStream?.entries) setEntries(nextStream.entries);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDashboard(), getVisualAssets(), getStream()]).then(([nextDashboard, assetPayload, streamPayload]) => {
      if (cancelled) return;
      setDashboard(nextDashboard);
      setAssets(assetPayload.assets || []);
      setEntries(streamPayload.entries || []);
      setPhase(phaseFromRun(nextDashboard.activeRun));
    }).catch((caught) => { if (!cancelled) setError(caught.message); });
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    let closed = false;
    let closeSocket = () => {};
    connectRealtime((message) => {
      if (closed) return;
      setConnected(true);
      if (message.type === 'stream_entry' && message.entry) setEntries((current) => [...current.filter((entry) => entry.id !== message.entry.id), message.entry].slice(-8));
      if (message.type === 'state_changed' && !busy) refresh({ includeStream: true }).catch(() => {});
    }).then((close) => { closeSocket = close; setConnected(true); }).catch(() => setConnected(false));
    const fallback = window.setInterval(() => { if (!busy) refresh().catch(() => {}); }, 4000);
    return () => { closed = true; closeSocket(); window.clearInterval(fallback); };
  }, [busy, refresh]);

  const run = outcome?.state || dashboard?.activeRun || null;
  const battle = useMemo(() => battleViewModel({ dashboard, assets, outcome, previousRun, phase, action: lastAction }), [assets, dashboard, lastAction, outcome, phase, previousRun]);
  const availableSkill = selectSkill(dashboard?.combatSkills || [], run);

  const completeAction = useCallback(async (actionName, skillId = null) => {
    if (!run?.id || busy || phase !== 'live') return;
    setError('');
    setBusy(true);
    const before = structuredClone(run);
    setPreviousRun(before);
    try {
      const path = actionName === 'skill' ? `/api/runs/${encodeURIComponent(run.id)}/skills/${encodeURIComponent(skillId)}` : `/api/runs/${encodeURIComponent(run.id)}/attack`;
      const nextOutcome = await api(path, { method: 'POST', headers: { 'Idempotency-Key': commandKey(`prototype-${actionName}`) } });
      const projected = projectCombatOutcome(nextOutcome, { action: actionName, previousRun: before });
      setOutcome(nextOutcome);
      setLastAction(projected);
      setPhase(actionName === 'skill' ? 'skillCast' : 'impact');
      timerRef.current = window.setTimeout(async () => {
        if (['complete', 'failed'].includes(nextOutcome?.state?.phase)) {
          setDashboard((current) => current ? { ...current, activeRun: null } : current);
          setPhase('result');
          setBusy(false);
          return;
        }
        setOutcome(null);
        setPreviousRun(null);
        setLastAction(null);
        setPhase(phaseFromRun(nextOutcome.state));
        setBusy(false);
        await refresh({ includeStream: true }).catch(() => {});
      }, ANIMATION_MS[actionName] || ANIMATION_MS.attack);
    } catch (caught) {
      setBusy(false);
      setError(caught.message);
      await refresh().catch(() => {});
    }
  }, [busy, phase, refresh, run]);

  const startBattle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await api('/api/dungeons/frayed-hollow/start', { method: 'POST' });
      setDashboard((current) => ({ ...current, activeRun: payload.run }));
      setPhase('live');
      setEntries((current) => [...current, { id: `local-start-${Date.now()}`, actorName: 'THREADBOUND', actorType: 'system', body: `Entered ${payload.run?.dungeonDefinition?.name || 'Frayed Hollow'}.`, createdAt: new Date().toISOString() }].slice(-8));
    } catch (caught) { setError(caught.message); } finally { setBusy(false); }
  }, [busy]);

  const chooseDecision = useCallback(async (choiceId) => {
    if (!run?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await api(`/api/runs/${encodeURIComponent(run.id)}/upgrade`, { method: 'POST', headers: { 'Idempotency-Key': commandKey('prototype-decision') }, body: JSON.stringify({ upgradeId: choiceId }) });
      setDashboard((current) => ({ ...current, activeRun: payload.run }));
      setPhase(phaseFromRun(payload.run));
    } catch (caught) { setError(caught.message); } finally { setBusy(false); }
  }, [busy, run]);

  const goToStream = () => { window.location.href = '/game'; };
  const receipt = lastAction && outcome ? receiptFor({ action: lastAction.action, outcome }) : null;

  if (!dashboard) return <main className="battle-loading"><span className="loading-orbit" />Loading the live battle model…</main>;

  return (
    <div className="battle-app">
      <header className="battle-topbar">
        <a className="battle-brand" href="/game"><span className="brand-mark">✦</span><span>THREADBOUND</span></a>
        <div className="battle-topbar__context"><span className="panel-kicker">BATTLE PROTOTYPE</span><span>Existing run state · live adapter</span></div>
        <nav className="battle-nav" aria-label="Threadbound"><a href="/game">Play</a><a href="/codex">Codex</a><a className="is-current" href="/game-react" aria-current="page">Battle</a></nav>
      </header>
      <main className="battle-layout">
        <aside className="battle-left"><ChatFeed entries={entries} receipt={receipt} /><div className="battle-left__footer"><span>React + Vite boundary</span><a href="/game">Legacy-compatible shell ↗</a></div></aside>
        <section className="battle-main" aria-label="Battle prototype">
          <div className="battle-intro"><div><span className="panel-kicker">FIGMA KEYFRAME FLOW</span><h1>One committed action, one readable moment.</h1><p>The arena animates state already resolved by Threadbound. The browser never decides damage, reward, cooldown, or victory.</p></div><button className="back-button" type="button" onClick={goToStream}>← Adventure Stream</button></div>
          {error ? <div className="battle-error" role="alert" data-testid="battle-error">{error}</div> : null}
          <BattleArena battle={battle} skills={dashboard.combatSkills} runUpgrades={dashboard.runUpgrades} phase={phase} busy={busy} onStart={startBattle} onAttack={() => completeAction('attack')} onSkill={(skillId) => completeAction('skill', skillId)} onDecision={chooseDecision} onBack={goToStream} />
        </section>
        <ContextRail dashboard={dashboard} connected={connected} />
      </main>
    </div>
  );
}
