import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, commandKey, connectRealtime, getAreas, getDashboard, getGambling, getQuests, getShop, getStream, getVisualAssets, postInventoryView, postShopView, postStatusView, postStreamMessage } from './api/client.js';
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

function terminalDungeonReplayId(entries = []) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const replay = entry?.metadata?.battleReplay;
    if (replay?.kind !== 'simple-dungeon-battle' || !['victory', 'defeat'].includes(replay.status)) continue;
    return replay.battleId || replay.runId || entry.id || null;
  }
  return null;
}

export function GameShellApp() {
  const [dashboard, setDashboard] = useState(null);
  const [assets, setAssets] = useState([]);
  const [entries, setEntries] = useState([]);
  const [areas, setAreas] = useState(null);
  const [quests, setQuests] = useState(null);
  const [shop, setShop] = useState(null);
  const [panel, setPanel] = useState(null);
  const [completedTerminalReplayIds, setCompletedTerminalReplayIds] = useState(() => new Set());
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const connectedRef = useRef(false);

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { connectedRef.current = connected; }, [connected]);

  const mergeEntry = useCallback((entry) => {
    if (!entry) return;
    setEntries((current) => {
      const byId = new Map(current.map((candidate) => [candidate.id || `${candidate.createdAt}-${candidate.body}`, candidate]));
      byId.set(entry.id || `${entry.createdAt}-${entry.body}`, entry);
      return sortEntries([...byId.values()]).slice(-50);
    });
  }, []);

  const markDungeonReplayComplete = useCallback((replayId) => {
    if (!replayId) return;
    setCompletedTerminalReplayIds((current) => current.has(replayId) ? current : new Set([...current, replayId]));
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

  const refreshWorld = useCallback(async () => {
    const [areaPayload, questPayload] = await Promise.all([getAreas(), getQuests()]);
    setAreas(areaPayload?.area || null);
    setQuests(questPayload || null);
  }, []);

  const recordCommand = useCallback(async (command) => {
    const text = String(command || '').trim();
    if (!text) return null;
    try {
      const parsed = normalizeCommand(text);
      const payload = parsed.name === 'inventory'
        ? await postInventoryView()
        : parsed.name === 'status'
          ? await postStatusView()
          : parsed.name === 'shop'
            ? await postShopView()
            : await postStreamMessage(text);
      applyPayload(payload);
      mergeEntry(payload?.entry);
      return payload?.entry || null;
    } catch (caught) {
      setError(caught.message);
      return null;
    }
  }, [applyPayload, mergeEntry]);

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
    closeSocket = connectRealtime((message) => {
      if (closed) return;
      if (message.type === 'stream_entry') mergeEntry(message.entry);
      if (message.type === 'state_changed' && !busyRef.current) {
        refresh({ includeStream: true }).catch(() => {});
        if (['AreaUnlocked', 'AreaTraveled', 'QuestAccepted', 'QuestProgressed', 'QuestCompleted', 'QuestClaimed', 'DungeonCompleted', 'NpcInteracted'].includes(message.eventType)) refreshWorld().catch(() => {});
      }
    }, (nextConnected) => {
      if (closed) return;
      setConnected(nextConnected);
      if (nextConnected && !busyRef.current) refresh({ includeStream: true }).catch(() => {});
    });
    const fallback = window.setInterval(() => {
      if (!busyRef.current) refresh({ includeStream: !connectedRef.current }).catch(() => {});
    }, 5000);
    return () => { closed = true; closeSocket(); window.clearInterval(fallback); };
  }, [mergeEntry, refresh, refreshWorld]);

  const request = useCallback(async (command, path, options = {}) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const payload = await api(path, options);
      applyPayload(payload);
      await refresh({ includeStream: true });
      if (/^\/api\/(?:hunt|adventure|runs\/|dungeons\/|areas\/|quests\/|towns\/)/.test(path)) {
        await refreshWorld();
      }
      if (path.startsWith('/api/shop/purchases/')) {
        const shopSnapshot = await postShopView();
        applyPayload(shopSnapshot);
        mergeEntry(shopSnapshot?.entry);
      }
      return payload;
    } catch (caught) {
      setError(caught.message);
      await refresh({ includeStream: true }).catch(() => {});
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [applyPayload, mergeEntry, refresh, refreshWorld]);

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
      case 'status':
      case 'inventory':
        await recordCommand(parsed.raw);
        setPanel(null);
        break;
      case 'help':
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
          // An active Blackjack hand already exists as the public BlackjackPlayed
          // surface in the Adventure Stream. Keep the help command ephemeral so
          // it cannot create a second actor-only table underneath that snapshot.
          if (payload && parsed.name !== 'blackjack') setPanel({ kind: 'gambling', data: { game: payload.game || game, blackjack: payload.blackjack, entry: payload.entry } });
          else if (parsed.name === 'blackjack') setPanel(null);
          break;
        }
        if (parsed.name === 'hit' || parsed.name === 'stand') {
          let round = panel?.kind === 'gambling' ? panel.data?.blackjack?.round : null;
          if (!round || round.status !== 'active') {
            try { round = (await getGambling()).blackjack?.round || null; } catch (caught) { setError(caught.message); break; }
          }
          if (!round) {
            await recordCommand(parsed.raw);
            setPanel({ kind: 'gambling', data: { game: 'blackjack', blackjack: { round: null, carriedGold: dashboard?.character?.gold ?? 0 } } });
            setError('No active Blackjack hand. Type blackjack <wager> to deal.');
            break;
          }
          await request(parsed.raw, `/api/gambling/blackjack/${encodeURIComponent(round.id)}/${parsed.name}`, { method: 'POST', headers: { 'Idempotency-Key': commandKey(`shell-blackjack-${parsed.name}`) } });
          setPanel(null);
          break;
        }
        if (parsed.name === 'blackjack') {
          await request(parsed.raw, '/api/gambling/blackjack', { method: 'POST', headers: { 'Idempotency-Key': commandKey('shell-blackjack-deal') }, body: JSON.stringify({ wager: Number(parsed.args[0]) }) });
          setPanel(null);
          break;
        }
        if (parsed.name === 'coinflip') {
          const choiceToken = String(parsed.args[1] || '').toLowerCase();
          const choice = choiceToken === 'h' ? 'heads' : choiceToken === 't' ? 'tails' : parsed.args[1];
          await request(parsed.raw, '/api/gambling/coinflip', { method: 'POST', headers: { 'Idempotency-Key': commandKey('shell-coinflip') }, body: JSON.stringify({ wager: Number(parsed.args[0]), choice }) });
          setPanel(null);
          break;
        }
        await request(parsed.raw, '/api/gambling/slots', { method: 'POST', headers: { 'Idempotency-Key': commandKey('shell-slots') }, body: JSON.stringify({ wager: Number(parsed.args[0]) }) });
        setPanel(null);
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
        await request(parsed.raw, '/api/stream/shop-view', { method: 'POST' });
        setPanel(null);
        break;
      case 'bank':
        await openResource('bank', parsed.raw, getShop, setShop);
        break;
      case 'area':
        await openResource('area', parsed.raw, getAreas, (payload) => setAreas(payload?.area || payload));
        break;
      case 'talk':
      case 'speak': {
        const targetName = parsed.args.join(' ').replace(/^(to|with)\s+/i, '').trim();
        if (!targetName) {
          setPanel({ kind: 'area' });
          setError('Type talk <NPC name> to speak with someone in this Town.');
          break;
        }
        let townData = areas;
        if (!townData?.towns) {
          try {
            const payload = await getAreas();
            townData = payload?.area || payload;
            setAreas(townData);
          } catch (caught) {
            setError(caught.message);
            break;
          }
        }
        const normalizeName = (value) => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
        const requested = normalizeName(targetName);
        const candidates = (townData?.towns || []).flatMap((town) => (town.npcs || []).map((npc) => ({ town, npc })));
        const match = candidates.find(({ npc }) => normalizeName(npc.name) === requested || normalizeName(npc.id) === requested)
          || candidates.find(({ npc }) => normalizeName(npc.name).startsWith(requested));
        if (!match) {
          setPanel({ kind: 'area' });
          setError(`No Town resident named “${targetName}” is available here. Open Area to see who you can talk to.`);
          break;
        }
        await request(parsed.raw, `/api/towns/${encodeURIComponent(match.town.id)}/npcs/${encodeURIComponent(match.npc.id)}/interact`, { method: 'POST' });
        setPanel(null);
        break;
      }
      case 'quest':
        await openResource('quest', parsed.raw, getQuests, setQuests);
        break;
      case 'hunt': {
        const payload = await request(parsed.raw, '/api/hunt', { method: 'POST' });
        break;
      }
      case 'adventure': {
        const payload = await request(parsed.raw, '/api/adventure', { method: 'POST' });
        break;
      }
      case 'heal': {
        const activeRun = dashboard?.activeRun;
        const path = activeRun?.simpleCombat && activeRun.phase === 'between_encounter'
          ? `/api/runs/${encodeURIComponent(activeRun.id)}/potion`
          : '/api/recovery/potion';
        await request(parsed.raw, path, {
          method: 'POST',
          headers: { 'Idempotency-Key': commandKey('shell-potion') },
          ...(parsed.args[0] ? { body: JSON.stringify({ potion: parsed.args[0] }) } : {}),
        });
        break;
      }
      case 'continue':
      case 'retreat':
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
        const options = { method: 'POST', headers: { 'Idempotency-Key': commandKey(`shell-${parsed.name}`) } };
        const payload = await request(parsed.raw, `/api/runs/${encodeURIComponent(run.id)}/${parsed.name}`, options);
        break;
      }
      default:
        await recordCommand(parsed.raw);
        setPanel({ kind: 'help' });
        setError(`Unknown command “${parsed.name}”. Try help.`);
        break;
    }
  }, [areas, dashboard, openResource, panel, recordCommand, request]);

  const loadEarlier = useCallback(async () => {
    const before = entries[0]?.id;
    if (!before || busyRef.current) return;
    try {
      const payload = await getStream({ limit: 30, before });
      setEntries((current) => sortEntries([...(payload.entries || []), ...current]));
    } catch (caught) { setError(caught.message); }
  }, [entries]);

  const contextualActions = useMemo(() => {
    if (dashboard?.activeRun) return [{ command: 'status', label: 'Status', hint: 'Read the shared receipt' }];
    if (dashboard?.simpleLoop?.huntAvailable) return [{ command: 'hunt', label: 'Hunt', hint: 'Quick battle' }, { command: 'dungeon', label: 'Dungeon', hint: 'Persistent run' }];
    return [{ command: 'inventory', label: 'Inventory', hint: 'Open Equipment' }, { command: 'quest', label: 'Quest', hint: 'See objectives' }];
  }, [dashboard]);

  if (!dashboard) {
    return <main className="game-shell-loading"><span className="loading-orbit" /><span>Loading the Adventure Stream…</span>{error ? <p data-testid="stream-error">{error}</p> : null}</main>;
  }

  const terminalReplayId = terminalDungeonReplayId(entries);
  const terminalReplayPending = Boolean(terminalReplayId && !completedTerminalReplayIds.has(terminalReplayId));
  const ephemeralCard = renderGameplayPanel({ panel, dashboard, assets, areas, quests, shop, onRequest: request, onCommand: handleCommand, onClose: () => setPanel(null), dungeonChooserDisabled: terminalReplayPending, busy });
  return (
    <div className="game-shell">
      <GameTopBar dashboard={dashboard} areas={areas} connected={connected} onOpen={handleCommand} />
      <div className="game-shell-layout">
        <QuickRail dashboard={dashboard} onCommand={handleCommand} />
        <main className="game-shell-center">
          <AdventureStream entries={entries} ephemeralCard={ephemeralCard} onLoadMore={loadEarlier} hasMore={false} connected={connected} viewerId={dashboard?.character?.id} assets={assets} areas={areas} onRequest={request} onCommand={handleCommand} onDungeonReplayComplete={markDungeonReplayComplete} busy={busy} dashboard={dashboard} />
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
