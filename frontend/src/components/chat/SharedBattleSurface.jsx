import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { replayFrameAt, replayMoments, sharedReplayKind } from '../../battle/sharedReplay.js';
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
  const moments = useMemo(() => replayMoments(replay), [replay]);

  useEffect(() => {
    if (reducedMotion || !moments.length) return undefined;
    const timer = window.setInterval(() => setTick((current) => current + 1), 50);
    return () => window.clearInterval(timer);
  }, [moments.length, createdAt, reducedMotion]);

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

function entityId(entity, fallback) {
  return String(entity?.combatantId || entity?.id || entity?.playerId || entity?.enemyId || fallback);
}

function battleAsset(entity, assets, kinds) {
  return resolveShellAsset(entity || {}, assets, kinds);
}

function Asset({ entity, assets, kinds, alt, className = '' }) {
  const asset = battleAsset(entity, assets, kinds);
  if (asset) return <img className={`shared-battle-asset ${className}`.trim()} src={asset.src} alt={alt} data-visual-asset-id={asset.id} />;
  return <span className={`shared-battle-asset shared-battle-asset--fallback ${className}`.trim()} aria-hidden="true">✦</span>;
}

function normalizeCombatants(replay, metadata = {}) {
  const simplePlayers = Array.isArray(replay?.players) ? replay.players : [];
  const battleCombatants = Array.isArray(replay?.battle?.combatants) ? replay.battle.combatants : [];
  const projectedPlayers = simplePlayers.length ? simplePlayers : battleCombatants.filter((candidate) => candidate.team === 'players');
  const players = projectedPlayers.length
    ? projectedPlayers
    : [{ id: metadata.playerId || 'player', displayName: metadata.playerName || 'Weaver', visualAssetId: metadata.playerVisualAssetId || null }];
  const battleEnemies = battleCombatants.filter((candidate) => candidate.team === 'enemies');
  const replayEnemies = Array.isArray(replay?.enemies) && replay.enemies.length
    ? replay.enemies
    : (replay?.enemy ? [replay.enemy] : battleEnemies);
  const enemies = replayEnemies.length
    ? replayEnemies
    : [{
        id: metadata.enemyId || 'enemy',
        combatantId: metadata.enemyCombatantId || metadata.enemyId || 'enemy',
        name: metadata.enemyName || 'Enemy',
        visualAssetId: metadata.enemyVisualAssetId || null,
        maxHp: 1,
      }];
  return { players, enemies };
}

function initialHp(entity, replay, firstMoment) {
  if (entity.startingHp != null) return numberOr(entity.startingHp);
  if (firstMoment?.actorId === entity.id && firstMoment.actorHpBefore != null) return numberOr(firstMoment.actorHpBefore);
  if (firstMoment?.targetId === entity.id && firstMoment.targetHpBefore != null) return numberOr(firstMoment.targetHpBefore);
  const participant = firstMoment?.participants?.find((candidate) => candidate.id === entity.id);
  return numberOr(participant?.hp ?? entity.hp ?? entity.maxHp, 0);
}

function hpAfterForMoment(moment, id) {
  if (String(moment.targetId) === String(id) && moment.targetHpAfter != null) return numberOr(moment.targetHpAfter);
  if (String(moment.actorId) === String(id) && moment.actorHpAfter != null) return numberOr(moment.actorHpAfter);
  return null;
}

function currentHp(entity, replay, moments, frame) {
  const id = entityId(entity, 'combatant');
  if (frame.complete && entity.endingHp != null) return numberOr(entity.endingHp);
  let hp = initialHp(entity, replay, moments[0]);
  const lastMoment = frame.complete ? moments.length - 1 : frame.momentIndex - (frame.phase === 'windup' || frame.phase === 'trajectory' ? 1 : 0);
  for (let index = 0; index <= lastMoment; index += 1) {
    const next = hpAfterForMoment(moments[index], id);
    if (next != null && (moments[index].damage > 0 || moments[index].retaliation)) hp = next;
  }
  return hp;
}

function formatDamage(damage) {
  return damage > 0 ? `−${damage} HP` : 'MISS';
}

export function SharedBattleSurface({ replay, createdAt, metadata = {}, assets = [], className = '', finalTitle = '', finalDetail = '', onComplete = null }) {
  const kind = sharedReplayKind(replay);
  const moments = useMemo(() => replayMoments(replay), [replay]);
  const frame = usePlayback(replay, createdAt);
  const arenaRef = useRef(null);
  const artRefs = useRef(new Map());
  const [trajectory, setTrajectory] = useState(null);
  const completionNotifiedRef = useRef(false);
  const { players, enemies } = normalizeCombatants(replay, metadata);

  const setArtRef = useCallback((id, node) => {
    const key = String(id);
    if (node) artRefs.current.set(key, node);
    else artRefs.current.delete(key);
  }, []);

  const measureTrajectory = useCallback(() => {
    if (frame.complete || !arenaRef.current || !frame.currentActorId || !frame.currentTargetId) {
      setTrajectory(null);
      return;
    }
    const source = artRefs.current.get(String(frame.currentActorId));
    const target = artRefs.current.get(String(frame.currentTargetId));
    if (!source || !target) {
      setTrajectory(null);
      return;
    }
    const arenaBox = arenaRef.current.getBoundingClientRect();
    const sourceBox = source.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const x1 = sourceBox.left + sourceBox.width / 2 - arenaBox.left;
    const y1 = sourceBox.top + sourceBox.height / 2 - arenaBox.top;
    const x2 = targetBox.left + targetBox.width / 2 - arenaBox.left;
    const y2 = targetBox.top + targetBox.height / 2 - arenaBox.top;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy) || 1;
    const lungeDistance = Math.min(20, Math.max(12, distance * 0.12));
    const recoilDistance = Math.min(8, Math.max(4, lungeDistance * 0.35));
    setTrajectory({
      actorId: String(frame.currentActorId),
      targetId: String(frame.currentTargetId),
      width: arenaBox.width,
      height: arenaBox.height,
      x1,
      y1,
      x2,
      y2,
      lungeX: (dx / distance) * lungeDistance,
      lungeY: (dy / distance) * lungeDistance,
      recoilX: (dx / distance) * -recoilDistance,
      recoilY: (dy / distance) * -recoilDistance,
      recoilReturnX: (dx / distance) * recoilDistance * 0.4,
      recoilReturnY: (dy / distance) * recoilDistance * 0.4,
      damageY: targetBox.top + targetBox.height * 0.24 - arenaBox.top,
    });
  }, [frame.complete, frame.currentActorId, frame.currentTargetId, frame.phase, frame.momentIndex, players.length, enemies.length]);

  useLayoutEffect(() => {
    measureTrajectory();
    if (!arenaRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measureTrajectory);
    observer.observe(arenaRef.current);
    return () => observer.disconnect();
  }, [measureTrajectory]);

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

  const moment = moments[Math.max(0, frame.momentIndex)] || null;
  const status = replay.status || (replay.receipt?.outcome === 'victory' ? 'victory' : 'defeat');
  const statusLabel = status === 'victory' ? 'VICTORY' : status === 'defeat' ? 'DEFEAT' : status === 'room_clear' ? 'ROOM CLEAR' : 'LIVE BATTLE';
  const enemyName = enemies.map((enemy) => enemy.name || 'Enemy').join(' + ');
  const replayTitle = finalTitle || (status === 'victory' ? `Defeated ${enemyName}` : status === 'defeat' ? `Fell to ${enemyName}` : `Cleared ${enemyName}`);
  const replayDetail = finalDetail || (status === 'victory' ? 'The clear is secured.' : status === 'defeat' ? 'Recover before the next battle.' : 'Choose the next room action.');
  const currentSummary = moment?.summary || (frame.complete ? replayTitle : 'The battle is resolving…');
  const allUnits = [...players, ...enemies];
  const impactVisible = frame.phase === 'impact';
  const trajectoryVisible = !frame.complete && (frame.phase === 'trajectory' || impactVisible);
  const damagePosition = impactVisible && trajectory ? { left: trajectory.x2, top: trajectory.damageY } : undefined;

  const renderUnit = (unit, role, labelOverride = null) => {
    const id = entityId(unit, role);
    const isEnemy = role === 'enemy';
    const label = labelOverride || unit.displayName || unit.label || unit.name || (isEnemy ? 'Enemy' : 'Weaver');
    const maxHp = numberOr(unit.maxHp ?? unit.maxHealth, numberOr(moment?.targetMaxHp, 1));
    const hp = currentHp(unit, replay, moments, frame);
    const active = !frame.complete && String(moment?.actorId) === id;
    const targeted = !frame.complete && String(moment?.targetId) === id;
    const defeated = isEnemy && hp <= 0;
    const unitClass = [`shared-battle-unit`, isEnemy ? 'shared-battle-unit--enemy' : 'shared-battle-unit--player', defeated ? 'is-defeated' : ''].filter(Boolean).join(' ');
    const stageClass = ['shared-battle-character-stage', active ? 'is-active' : '', targeted ? 'is-targeted' : ''].filter(Boolean).join(' ');
    const motionStyle = {
      '--attack-x': `${active && trajectory?.actorId === id ? trajectory.lungeX : 0}px`,
      '--attack-y': `${active && trajectory?.actorId === id ? trajectory.lungeY : 0}px`,
      '--recoil-x': `${targeted && trajectory?.targetId === id ? trajectory.recoilX : 0}px`,
      '--recoil-y': `${targeted && trajectory?.targetId === id ? trajectory.recoilY : 0}px`,
      '--recoil-return-x': `${targeted && trajectory?.targetId === id ? trajectory.recoilReturnX : 0}px`,
      '--recoil-return-y': `${targeted && trajectory?.targetId === id ? trajectory.recoilReturnY : 0}px`,
    };
    return <div className={unitClass} key={id} data-combatant-id={id} data-defeated={defeated ? 'true' : 'false'} data-acting={active ? 'true' : 'false'} data-targeted={targeted ? 'true' : 'false'} data-testid={isEnemy ? 'shared-battle-enemy' : 'shared-battle-player'}>
      <div className={stageClass} ref={(node) => setArtRef(id, node)} data-combatant-id={id} data-testid={`shared-battle-character-${id}`}>
        <div className="shared-battle-character-motion" style={motionStyle} data-combatant-id={id} data-acting={active ? 'true' : 'false'} data-targeted={targeted ? 'true' : 'false'} data-testid={`shared-battle-character-motion-${id}`}>
          <Asset entity={unit} assets={assets} kinds={isEnemy ? (unit.isBoss ? ['boss', 'mob'] : ['mob', 'boss']) : ['character']} alt={label} />
        </div>
      </div>
      <div className="shared-battle-unit__copy" data-combatant-id={id} data-testid={`shared-battle-unit-copy-${id}`}><strong>{label}</strong><div className={`shared-battle-hp ${isEnemy ? 'shared-battle-hp--enemy' : ''}`}><span style={{ width: `${percentage(hp, maxHp)}%` }} /><b>{hp}/{maxHp} HP</b></div></div>
    </div>;
  };

  return (
    <section className={`shared-battle-surface shared-battle-surface--${kind} ${frame.complete ? 'is-complete' : 'is-playing'} ${className}`.trim()} data-testid="shared-battle-surface" data-replay-state={frame.complete ? 'complete' : 'playing'} data-replay-phase={frame.phase} data-replay-index={frame.visibleIndex} data-replay-moment-index={frame.momentIndex} data-replay-progress={frame.progress.toFixed(3)} data-current-actor-id={frame.currentActorId || undefined} data-current-target-id={frame.currentTargetId || undefined} data-replay-battle-id={replay.battleId || replay.runId || undefined}>
      <div className="shared-battle-header">
        <div><span className="shell-kicker">{frame.complete ? statusLabel : 'LIVE FROM THE SHARED THREAD'}</span><strong>{kind === 'dungeon' ? `Room ${numberOr(replay.roomIndex) + 1}` : 'Automatic battle'}</strong></div>
        <span className="shared-battle-sync">{frame.complete ? 'SYNCED' : `PLAYING · ${frame.phase.toUpperCase()}`}</span>
      </div>
      <div className="shared-battle-arena" ref={arenaRef}>
        <svg className="shared-battle-trajectory" data-testid="shared-battle-trajectory" viewBox={`0 0 ${trajectory?.width || 1} ${trajectory?.height || 1}`} aria-hidden="true" focusable="false">
          {trajectory && trajectoryVisible ? <>
            <line className="trajectory__beam" pathLength="1" x1={trajectory.x1} y1={trajectory.y1} x2={trajectory.x2} y2={trajectory.y2} />
            <line className="trajectory__core" pathLength="1" x1={trajectory.x1} y1={trajectory.y1} x2={trajectory.x2} y2={trajectory.y2} />
            {impactVisible ? <><circle className="trajectory__burst" cx={trajectory.x2} cy={trajectory.y2} r="12" /><circle className="trajectory__ring" cx={trajectory.x2} cy={trajectory.y2} r="18" /></> : null}
          </> : null}
        </svg>
        <div className="shared-battle-combatants">
          <div className="shared-battle-party">{players.map((player) => renderUnit({ ...player, visualAssetId: player.visualAssetId || (player.id === metadata.playerId ? metadata.playerVisualAssetId : null) }, 'player'))}</div>
          <span className="shared-battle-versus" aria-hidden="true">VS</span>
          <div className="shared-battle-enemies">{enemies.map((enemy) => renderUnit(enemy, 'enemy', enemy.name || 'Enemy'))}</div>
        </div>
        {impactVisible && moment?.damage > 0 ? <span className={`damage-float ${moment.critical ? 'damage-float--critical' : ''}`} style={damagePosition} data-testid="shared-battle-floating-damage">{formatDamage(moment.damage)}</span> : null}
        <div className="shared-battle-progress" aria-label="Battle replay progress"><span style={{ width: `${Math.round(frame.progress * 100)}%` }} /></div>
      </div>
      <div className="shared-battle-feed" aria-live="polite"><span className="shell-kicker">{frame.complete ? 'FINAL RECEIPT' : `MOMENT ${Math.max(1, frame.momentIndex + 1)} / ${moments.length}`}</span><p>{currentSummary}</p>{moment?.critical && !frame.complete ? <strong className="shared-battle-critical">CRITICAL</strong> : null}</div>
      {frame.complete ? <div className={`shared-battle-result shared-battle-result--${status}`}><span>{statusLabel}</span><strong>{replayTitle}</strong><b>{replayDetail}</b></div> : null}
      <span className="sr-only">{allUnits.map((unit) => `${unit.displayName || unit.name || 'Combatant'} ${currentHp(unit, replay, moments, frame)} HP`).join('. ')}</span>
    </section>
  );
}
