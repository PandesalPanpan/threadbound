import { useEffect, useMemo, useRef, useState } from 'react';
import { replayBeats, replayFrameAt, sharedReplayKind } from '../../battle/sharedReplay.js';
import { resolveShellAsset } from '../../shell/presentation.js';

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function usePlayback(replay, createdAt) {
  const reducedMotion = useReducedMotion();
  const [, setTick] = useState(0);
  const beats = useMemo(() => replayBeats(replay), [replay]);

  useEffect(() => {
    if (reducedMotion || !beats.length) return undefined;
    const timer = window.setInterval(() => setTick((current) => current + 1), 80);
    return () => window.clearInterval(timer);
  }, [beats.length, createdAt, reducedMotion]);

  return replayFrameAt(replay, createdAt, Date.now(), { reducedMotion });
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentage(value, max) {
  const safeMax = Math.max(1, numberOr(max, 1));
  return Math.max(0, Math.min(100, (numberOr(value) / safeMax) * 100));
}

function battleAsset(entity, assets, kinds) {
  return resolveShellAsset(entity || {}, assets, kinds);
}

function Asset({ entity, assets, kinds, alt, className = '' }) {
  const asset = battleAsset(entity, assets, kinds);
  if (asset) return <img className={`shared-battle-asset ${className}`.trim()} src={asset.src} alt={alt} data-visual-asset-id={asset.id} />;
  return <span className={`shared-battle-asset shared-battle-asset--fallback ${className}`.trim()} aria-hidden="true">✦</span>;
}

function initialPlayerHp(replay, player, beat) {
  if (player.startingHp != null) return numberOr(player.startingHp);
  if (beat?.actorId === player.id && beat.actorHpBefore != null) return numberOr(beat.actorHpBefore);
  if (beat?.participants) return numberOr(beat.participants.find((candidate) => candidate.id === player.id)?.hp);
  return numberOr(player.hp ?? player.maxHp);
}

function finalPlayerHp(replay, player) {
  if (player.endingHp != null) return numberOr(player.endingHp);
  const projected = replay?.battle?.combatants?.find((candidate) => candidate.id === player.id);
  return numberOr(projected?.hp ?? player.hp ?? player.maxHp);
}

function initialEnemyHp(replay, beat) {
  return numberOr(replay?.enemy?.startingHp ?? beat?.targetHpBefore ?? replay?.battle?.combatants?.find((candidate) => candidate.team === 'enemies')?.hp);
}

function finalEnemyHp(replay, beat) {
  return numberOr(replay?.enemy?.endingHp ?? beat?.targetHpAfter ?? replay?.battle?.combatants?.find((candidate) => candidate.team === 'enemies')?.hp);
}

function currentPlayerHp(replay, player, beat, complete) {
  if (complete) return finalPlayerHp(replay, player);
  if (beat?.participants) return numberOr(beat.participants.find((candidate) => candidate.id === player.id)?.hp, initialPlayerHp(replay, player, beat));
  if (beat?.actorId === player.id && beat.actorHpAfter != null) return numberOr(beat.actorHpAfter);
  return initialPlayerHp(replay, player, beat);
}

function currentEnemyHp(replay, beat, complete) {
  return complete ? finalEnemyHp(replay, beat) : numberOr(beat?.targetHpAfter, initialEnemyHp(replay, beat));
}

function normalizeCombatants(replay, metadata = {}) {
  const simplePlayers = Array.isArray(replay?.players) ? replay.players : [];
  const battleCombatants = replay?.battle?.combatants || [];
  const projectedPlayers = simplePlayers.length
    ? simplePlayers
    : battleCombatants.filter((candidate) => candidate.team === 'players');
  const players = projectedPlayers.length ? projectedPlayers : [{ id: metadata.playerId || 'player', displayName: metadata.playerName || 'Weaver', visualAssetId: metadata.playerVisualAssetId || null }];
  const battleEnemy = battleCombatants.find((candidate) => candidate.team === 'enemies') || null;
  const enemy = replay?.enemy || {
    id: battleEnemy?.id || metadata.enemyId || 'enemy',
    name: battleEnemy?.name || metadata.enemyName || 'Enemy',
    visualAssetId: metadata.enemyVisualAssetId || battleEnemy?.visualAssetId || null,
    maxHp: battleEnemy?.maxHp || replay?.receipt?.hp?.find((candidate) => candidate.id === battleEnemy?.id)?.maxHp || 1,
  };
  return { players, enemy };
}

export function SharedBattleSurface({ replay, createdAt, metadata = {}, assets = [], className = '', finalTitle = '', finalDetail = '', onComplete = null }) {
  const kind = sharedReplayKind(replay);
  const beats = useMemo(() => replayBeats(replay), [replay]);
  const frame = usePlayback(replay, createdAt);
  const completionNotifiedRef = useRef(false);
  useEffect(() => {
    completionNotifiedRef.current = false;
  }, [replay?.battleId, replay?.runId, createdAt]);
  useEffect(() => {
    if (frame.complete && !completionNotifiedRef.current) {
      completionNotifiedRef.current = true;
      onComplete?.();
    }
  }, [frame.complete, onComplete]);
  if (!replay || !kind) return null;

  const beat = beats[Math.max(0, frame.visibleIndex)] || null;
  const { players, enemy } = normalizeCombatants(replay, metadata);
  const liveEnemyHp = currentEnemyHp(replay, beat, frame.complete);
  const status = replay.status || (replay.receipt?.outcome === 'victory' ? 'victory' : 'defeat');
  const statusLabel = status === 'victory' ? 'VICTORY' : status === 'defeat' ? 'DEFEAT' : status === 'room_clear' ? 'ROOM CLEAR' : 'LIVE BATTLE';
  const enemyName = enemy.name || 'Enemy';
  const leadPlayer = players[0];
  const replayTitle = finalTitle || (status === 'victory' ? `Defeated ${enemyName}` : status === 'defeat' ? `Fell to ${enemyName}` : `Cleared ${enemyName}`);
  const replayDetail = finalDetail || (status === 'victory' ? 'The clear is secured.' : status === 'defeat' ? 'Recover before the next battle.' : 'Choose the next room action.');
  const currentSummary = beat?.summary || (frame.complete ? replayTitle : 'The battle is resolving…');

  return (
    <section className={`shared-battle-surface shared-battle-surface--${kind} ${frame.complete ? 'is-complete' : 'is-playing'} ${className}`.trim()} data-testid="shared-battle-surface" data-replay-state={frame.complete ? 'complete' : 'playing'} data-replay-index={frame.visibleIndex} data-replay-progress={frame.progress.toFixed(3)} data-replay-battle-id={replay.battleId || replay.runId || undefined}>
      <div className="shared-battle-header">
        <div><span className="shell-kicker">{frame.complete ? statusLabel : 'LIVE FROM THE SHARED THREAD'}</span><strong>{kind === 'dungeon' ? `Room ${numberOr(replay.roomIndex) + 1}` : 'Automatic battle'}</strong></div>
        <span className="shared-battle-sync">{frame.complete ? 'SYNCED' : 'PLAYING'}</span>
      </div>
      <div className="shared-battle-arena">
        <div className="shared-battle-combatants">
          <div className="shared-battle-party">
            {players.map((player) => {
              const hp = currentPlayerHp(replay, player, beat, frame.complete);
              const maxHp = numberOr(player.maxHp ?? player.maxHealth, 1);
              const label = player.displayName || player.label || player.name || 'Weaver';
              return <div className="shared-battle-unit shared-battle-unit--player" key={player.id || label} data-testid="shared-battle-player"><Asset entity={{ ...player, visualAssetId: player.visualAssetId || (player.id === metadata.playerId ? metadata.playerVisualAssetId : null) }} assets={assets} kinds={['character']} alt={label} /><div className="shared-battle-unit__copy"><strong>{label}</strong><div className="shared-battle-hp"><span style={{ width: `${percentage(hp, maxHp)}%` }} /><b>{hp}/{maxHp} HP</b></div></div></div>;
            })}
          </div>
          <span className="shared-battle-versus" aria-hidden="true">VS</span>
          <div className="shared-battle-unit shared-battle-unit--enemy" data-testid="shared-battle-enemy"><Asset entity={enemy} assets={assets} kinds={enemy.isBoss ? ['boss', 'mob'] : ['mob', 'boss']} alt={enemyName} /><div className="shared-battle-unit__copy"><strong>{enemyName}</strong><div className="shared-battle-hp shared-battle-hp--enemy"><span style={{ width: `${percentage(liveEnemyHp, numberOr(enemy.maxHp, beat?.targetMaxHp || 1))}%` }} /><b>{liveEnemyHp}/{numberOr(enemy.maxHp, beat?.targetMaxHp || 1)} HP</b></div></div></div>
        </div>
        <div className="shared-battle-progress" aria-label="Battle replay progress"><span style={{ width: `${Math.round(frame.progress * 100)}%` }} /></div>
      </div>
      <div className="shared-battle-feed" aria-live="polite"><span className="shell-kicker">{frame.complete ? 'FINAL RECEIPT' : `BEAT ${Math.max(1, frame.visibleIndex + 1)} / ${beats.length}`}</span><p>{currentSummary}</p>{beat?.critical ? <strong className="shared-battle-critical">CRITICAL</strong> : null}</div>
      {frame.complete ? <div className={`shared-battle-result shared-battle-result--${status}`}><span>{statusLabel}</span><strong>{replayTitle}</strong><b>{replayDetail}</b></div> : null}
    </section>
  );
}
