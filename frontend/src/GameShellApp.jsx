import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, commandKey, connectRealtime, getAreas, getDashboard, getGambling, getQuests, getShop, getStream, getVisualAssets, postStreamMessage } from './api/client.js';
import { AdventureStream } from './components/chat/AdventureStream.jsx';
import { CommandComposer } from './components/chat/CommandComposer.jsx';
import { renderGameplayPanel } from './components/panels/GameplayPanels.jsx';
import { GameTopBar } from './components/shell/GameTopBar.jsx';
import { LiveContextRail } from './components/shell/LiveContextRail.jsx';
import { QuickRail } from './components/shell/QuickRail.jsx';
import { commandLabel, normalizeCommand } from './shell/presentation.js';

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).valueOf();
    const rightTime = new Date(right?.createdAt || 0).valueOf();
    return leftTime - rightTime;
  });
}

export function GameShellApp() {
  const [dashboard, setDashboard] = useState(null);
  const [assets, setAssets] = useState([]);
  const [entries, setEntries] = useState([]);
  const [areas, setAreas] = useState(null);
  const [quests, setQuests] = useState(null);
  const [shop, setShop] = useState(null);
  const [panel, setPanel] = useState({ kind: 'status' });
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  useEffect(() => { busyRef.current = busy; }, [busy]);

  const mergeEntry = useCallback((entry) => {
    if (!entry) return;
    setEntries((current) => {
      const byId = new Map(current.map((candidate) => [candidate.id || `${candidate.createdAt}-${candidate.body}`, candidate]));
      byId.set(entry.id || `${entry.createdAt}-${entry.body}`, entry);
      return sortEntries([...byId.values()]).slice(-50);
    });
  }, []);

  const applyPayload = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return;
    const nextDashboard = payload.dashboard || (payload.character && payload.inventory ? payload : null);
    if (nextDashboard) setDashboard(nextDashboard);
    if (payload.shop) setShop(payload.shop);
    if (payload.quests) setQuests(payload.quests);
    if (payload.area) setAreas(payload.area);
    if (Object.prototype.hasOwnProperty.call(payload, 'party')) setDashboard((current) => current ? { ...current, party: payload.party } : current);
    if (payload.run?.id) setDashboard((current) => current ? { ...current, activeRun: payload.run } : current);
    if (payload.state?.id && payload.state?.participants) setDashboard((current) => current ? { ...current, activeRun: payload.state } : current);
  }, []);

  const refresh = useCallback(async ({ includeStream = true } = {}) => {
    const [nextDashboard, nextStream] = await Promise.all([
      getDashboard(),
      includeStream ? getStream({ limit: 30 }) : Promise.resolve(null),
    ]);
    setDashboard(nextDashboard);
    if (nextStream?.entries) setEntries(sortEntries(nextStream.entries));
    return { dashboard: nextDashboard, stream: nextStream };
  }, []);

  const recordCommand = useCallback(async (command) => {
    const text = String(command || '').trim();
    if (!text) return null;
    try {
      const payload = await postStreamMessage(text);
      mergeEntry(payload?.entry);
      return payload?.entry || null;
    } catch (caught) {
      setError(caught.message);
      return null;
    }
  }, [mergeEntry]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDashboard(), getVisualAssets(), getStream({ limit: 30 }), getAreas(), getQuests(), getShop()])
      .then(([nextDashboard, assetPayload, streamPayload, areaPayload, questPayload, shopPayload]) => {
        if (cancelled) return;
        setDashboard(nextDashboard);
        setAssets(assetPayload?.assets || []);
        setEntries(sortEntries(streamPayload?.entries || []));
        setAreas(areaPayload?.area || null);
        setQuests(questPayload || null);
        setShop(shopPayload || null);
      })
      .catch((caught) => { if (!cancelled) setError(caught.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let closed = false;
    let closeSocket = () => {};
    connectRealtime((message) => {
      if (closed) return;
      setConnected(true);
      if (message.type === 'stream_entry') mergeEntry(message.entry);
      if (message.type === 'state_changed' && !busyRef.current) refresh({ includeStream: true }).catch(() => {});
    }).then((close) => { if (!closed) { closeSocket = close; setConnected(true); } }).catch(() => { if (!closed) setConnected(false); });
    const fallback = window.setInterval(() => { if (!busyRef.current) refresh({ includeStream: false }).catch(() => {}); }, 5000);
    return () => { closed = true; closeSocket(); window.clearInterval(fallback); };
  }, [mergeEntry, refresh]);

  const request = useCallback(async (command, path, options = {}) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await recordCommand(command);
      const payload = await api(path, options);
      applyPayload(payload);
      await refresh({ includeStream: true });
      return payload;
    } catch (caught) {
      setError(caught.message);
      await refresh({ includeStream: true }).catch(() => {});
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applyPayload, recordCommand, refresh]);

  const openResource = useCallback(async (kind, command, loader, setter) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await recordCommand(command);
      const payload = await loader();
      setter(payload?.area || payload?.shop || payload);
      setPanel({ kind });
    } catch (caught) {
      setError(caught.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [recordCommand]);

  const handleCommand = useCallback(async (input) => {
    const parsed = normalizeCommand(input);
    if (!parsed.name || busyRef.current) return;
    setError('');
    switch (parsed.name) {
      case 'help':
      case 'status':
      case 'inventory':
      case 'party':
      case 'dungeon':
      case 'world':
      case 'honey':
      case 'codex':
        await recordCommand(parsed.raw);
        setPanel({ kind: parsed.name });
        break;
      case 'gambling':
      case 'casino':
      case 'blackjack':
      case 'hit':
      case 'stand':
      case 'coinflip':
      case 'slots': {
        const game = ['blackjack', 'coinflip', 'slots'].includes(parsed.name) ? parsed.name : 'games';
        if ((parsed.name === 'blackjack' && parsed.args.length === 0) || (parsed.name === 'coinflip' && parsed.args.length < 2) || (parsed.name === 'slots' && parsed.args.length === 0) || parsed.name === 'gambling' || parsed.name === 'casino') {
          const payload = await request(parsed.raw, '/api/gambling/help', { method: 'POST', body: JSON.stringify({ game }) });
          if (payload) setPanel({ kind: 'gambling', data: { game: payload.game || game, blackjack: payload.blackjack, entry: payload.entry } });
          break;
        }
        if (parsed.name === 'hit' || parsed.name === 'stand') {
          let round = panel.kind === 'gambling' ? panel.data?.blackjack?.round : null;
          if (!round || round.status !== 'active') {
            try { round = (await getGambling()).blackjack?.round || null; } catch (caught) { setError(caught.message); break; }
          }
          if (!round) {
            await recordCommand(parsed.raw);
            setPanel({ kind: 'gambling', data: { game: 'blackjack', blackjack: { round: null, carriedGold: dashboard?.character?.gold ?? 0 } } });
            setError('No active Blackjack hand. Type blackjack <wager> to deal.');
            break;
          }
          const payload = await request(parsed.raw, `/api/gambling/blackjack/${encodeURIComponent(round.id)}/${parsed.name}`, { method: 'POST', headers: { 'Idempotency-Key': commandKey(`shell-blackjack-${parsed.name}`) } });
          if (payload) setPanel({ kind: 'gambling', data: { game: 'blackjack', blackjack: payload.blackjack, entry: payload.entry } });
          break;
        }
        if (parsed.name === 'blackjack') {
          const payload = await request(parsed.raw, '/api/gambling/blackjack', { method: 'POST', headers: { 'Idempotency-Key': commandKey('shell-blackjack-deal') }, body: JSON.stringify({ wager: Number(parsed.args[0]) }) });
          if (payload) setPanel({ kind: 'gambling', data: { game: 'blackjack', blackjack: payload.blackjack, entry: payload.entry } });
          break;
        }
        if (parsed.name === 'coinflip') {
          const payload = await request(parsed.raw, '/api/gambling/coinflip', { method: 'POST', headers: { 'Idempotency-Key': commandKey('shell-coinflip') }, body: JSON.stringify({ wager: Number(parsed.args[0]), choice: parsed.args[1] }) });
          if (payload) setPanel({ kind: 'gambling', data: { game: 'coinflip', coinflip: payload.coinflip, entry: payload.entry } });
          break;
        }
        const payload = await request(parsed.raw, '/api/gambling/slots', { method: 'POST', headers: { 'Idempotency-Key': commandKey('shell-slots') }, body: JSON.stringify({ wager: Number(parsed.args[0]) }) });
        if (payload) setPanel({ kind: 'gambling', data: { game: 'slots', slots: payload.slots, entry: payload.entry } });
        break;
      }
      case 'leaderboard':
        await openResource('leaderboard', parsed.raw, getAreas, setAreas);
        break;
      case 'profile': {
        const payload = await request(parsed.raw, '/api/areas');
        if (payload) {
          setAreas(payload.area || payload);
          setPanel({ kind: 'leaderboard', data: { profileQuery: parsed.args.join(' ') } });
        }
        break;
      }
      case 'shop':
        await openResource('shop', parsed.raw, getShop, setShop);
        break;
      case 'bank':
        await openResource('bank', parsed.raw, getShop, setShop);
        break;
      case 'area':
        await openResource('area', parsed.raw, getAreas, (payload) => setAreas(payload?.area || payload));
        break;
      case 'quest':
        await openResource('quest', parsed.raw, getQuests, setQuests);
        break;
      case 'hunt': {
        const payload = await request(parsed.raw, '/api/hunt', { method: 'POST' });
        if (payload) setPanel({ kind: 'hunt', data: payload.hunt });
        break;
      }
      case 'adventure': {
        const payload = await request(parsed.raw, '/api/adventure', { method: 'POST' });
        if (payload) setPanel({ kind: 'adventure', data: payload.adventure });
        break;
      }
      case 'heal': {
        await request(parsed.raw, '/api/recovery/potion', { method: 'POST' });
        setPanel({ kind: 'inventory' });
        break;
      }
      case 'attack':
      case 'guard':
      case 'interrupt':
      case 'mend':
      case 'revive': {
        const run = dashboard?.activeRun;
        if (!run?.id) {
          await recordCommand(parsed.raw);
          setPanel({ kind: 'dungeon' });
          setError('Open a Dungeon and start a run before taking that action.');
          break;
        }
        const options = { method: 'POST' };
        if (parsed.name === 'attack') options.headers = { 'Idempotency-Key': `${Date.now()}-shell-attack` };
        const payload = await request(parsed.raw, `/api/runs/${encodeURIComponent(run.id)}/${parsed.name}`, options);
        if (payload) setPanel({ kind: 'dungeon' });
        break;
      }
      default:
        await recordCommand(parsed.raw);
        setPanel({ kind: 'help' });
        setError(`Unknown command “${parsed.name}”. Try help.`);
        break;
    }
  }, [dashboard, openResource, panel, recordCommand, request]);

  const loadEarlier = useCallback(async () => {
    const before = entries[0]?.id;
    if (!before || busyRef.current) return;
    try {
      const payload = await getStream({ limit: 30, before });
      setEntries((current) => sortEntries([...(payload.entries || []), ...current]));
    } catch (caught) { setError(caught.message); }
  }, [entries]);

  const contextualActions = useMemo(() => {
    if (dashboard?.activeRun) return [{ command: 'attack', label: 'Attack', hint: 'Resolve the run' }, { command: 'status', label: 'Status', hint: 'Read your HP' }];
    if (dashboard?.simpleLoop?.huntAvailable) return [{ command: 'hunt', label: 'Hunt', hint: 'Quick battle' }, { command: 'dungeon', label: 'Dungeon', hint: 'Persistent run' }];
    return [{ command: 'inventory', label: 'Inventory', hint: 'Open Equipment' }, { command: 'quest', label: 'Quest', hint: 'See objectives' }];
  }, [dashboard]);

  if (!dashboard) {
    return <main className="game-shell-loading"><span className="loading-orbit" /><span>Loading the Adventure Stream…</span>{error ? <p data-testid="stream-error">{error}</p> : null}</main>;
  }

  const activeCard = renderGameplayPanel({ panel, dashboard, assets, areas, quests, shop, onRequest: request, onCommand: handleCommand, busy });
  return (
    <div className="game-shell">
      <GameTopBar dashboard={dashboard} areas={areas} connected={connected} onOpen={handleCommand} />
      <div className="game-shell-layout">
        <QuickRail dashboard={dashboard} onCommand={handleCommand} />
        <main className="game-shell-center">
          <AdventureStream entries={entries} activeCard={activeCard} onLoadMore={loadEarlier} hasMore={false} connected={connected} />
          <CommandComposer onSubmit={handleCommand} busy={busy} contextualActions={contextualActions} />
          {busy ? <span className="game-shell-busy" role="status" data-testid="stream-busy">Syncing authoritative state…</span> : null}
        </main>
        <LiveContextRail dashboard={dashboard} areas={areas} quests={quests} connected={connected} onCommand={handleCommand} />
      </div>
      {error ? <div className="game-shell-error" role="alert" data-testid="stream-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div> : null}
    </div>
  );
}

export { commandLabel };
