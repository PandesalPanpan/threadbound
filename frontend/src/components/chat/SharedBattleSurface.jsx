import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { replayFrameAt, replayMoments, sharedReplayKind } from '../../battle/sharedReplay.js';
import { resolveShellAsset } from '../../shell/presentation.js';

gsap.registerPlugin(useGSAP);

const DUEL_EQUIPMENT_SLOTS = Object.freeze([
  ['weapon', 'Weapon'],
  ['helmet', 'Helmet'],
  ['armor', 'Armor'],
  ['boots', 'Boots'],
  ['accessory', 'Accessory'],
]);
const ARENA_REPLAY_SPEED_KEY = 'threadbound:arena-replay-speed';

function storedReplaySpeed() {
  try {
    const value = Number(window.localStorage.getItem(ARENA_REPLAY_SPEED_KEY));
    return [1, 2, 4].includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

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
  const detailCombatants = Array.isArray(replay?.details?.combatants) ? replay.details.combatants : [];
  const projectedPlayers = simplePlayers.length
    ? simplePlayers
    : battleCombatants.length
      ? battleCombatants.filter((candidate) => candidate.team === 'players')
      : detailCombatants.filter((candidate) => candidate.team === 'players');
  const battleEnemies = battleCombatants.filter((candidate) => candidate.team === 'enemies');
  const replayEnemies = Array.isArray(replay?.enemies) && replay.enemies.length
    ? replay.enemies
    : replay?.enemy
      ? [replay.enemy]
      : battleEnemies.length
        ? battleEnemies
        : detailCombatants.filter((candidate) => candidate.team === 'enemies');
  const project = (unit) => ({
    ...unit,
    displayName: unit.displayName || unit.label || unit.name || null,
    startingHp: unit.startingHp ?? unit.hp?.initial ?? null,
    endingHp: unit.endingHp ?? unit.hp?.final ?? null,
    maxHp: unit.maxHp ?? unit.maxHealth ?? unit.hp?.max ?? null,
    startingMana: unit.startingMana ?? unit.mana?.initial ?? null,
    endingMana: unit.endingMana ?? unit.mana?.final ?? null,
    maxMana: unit.maxMana ?? unit.mana?.max ?? null,
    signatureSkill: unit.signatureSkill || unit.skills?.[0] || null,
  });
  const players = projectedPlayers.map(project).map((player) => ({
    ...player,
    visualAssetId: player.visualAssetId || (player.id === metadata.playerId ? metadata.playerVisualAssetId : null) || null,
  }));
  return { players, enemies: replayEnemies.map(project) };
}

function initialHp(entity, replay, firstMoment) {
  if (entity.startingHp != null) return numberOr(entity.startingHp);
  if (entity.hp?.initial != null) return numberOr(entity.hp.initial);
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
  if (frame.complete && (entity.endingHp != null || entity.hp?.final != null)) return numberOr(entity.endingHp ?? entity.hp.final);
  let hp = initialHp(entity, replay, moments[0]);
  const lastMoment = frame.complete ? moments.length - 1 : frame.momentIndex - (frame.phase === 'windup' || frame.phase === 'trajectory' ? 1 : 0);
  for (let index = 0; index <= lastMoment; index += 1) {
    const next = hpAfterForMoment(moments[index], id);
    if (next != null && (moments[index].damage > 0 || moments[index].retaliation || next !== hp)) hp = next;
  }
  return hp;
}

function initialMana(entity, moments) {
  if (entity.startingMana != null) return numberOr(entity.startingMana);
  if (entity.mana?.initial != null) return numberOr(entity.mana.initial);
  const firstActorMoment = moments.find((moment) => String(moment.actorId) === entityId(entity, 'combatant') && moment.actorManaBefore != null);
  return numberOr(firstActorMoment?.actorManaBefore ?? entity.mana ?? 0);
}

function currentMana(entity, moments, frame) {
  if (frame.complete && (entity.endingMana != null || entity.mana?.final != null)) return numberOr(entity.endingMana ?? entity.mana.final);
  const id = entityId(entity, 'combatant');
  let mana = initialMana(entity, moments);
  const lastMoment = frame.complete ? moments.length - 1 : frame.momentIndex - (frame.phase === 'windup' || frame.phase === 'trajectory' ? 1 : 0);
  for (let index = 0; index <= lastMoment; index += 1) {
    const moment = moments[index];
    if (String(moment.actorId) === id && moment.actorManaAfter != null) mana = numberOr(moment.actorManaAfter, mana);
    for (const event of moment.manaEvents || []) {
      if (String(event.combatantId || event.targetId || '') === id && event.manaAfter != null) {
        mana = numberOr(event.manaAfter, mana);
      }
    }
  }
  return mana;
}

function statusesAt(entity, moments, frame) {
  const id = entityId(entity, 'combatant');
  if (frame.complete) return Array.isArray(entity.effects) ? entity.effects : [];
  const effects = new Map();
  const lastMoment = frame.momentIndex - (frame.phase === 'windup' || frame.phase === 'trajectory' ? 1 : 0);
  for (let index = 0; index <= lastMoment; index += 1) {
    const moment = moments[index];
    for (const event of moment?.events || []) {
      const effect = String(event.effect || event.type || '').trim();
      if (!effect) continue;
      if (event.kind === 'effect-applied' && String(event.targetId || '') === id) {
        effects.set(effect, { id: effect, name: effect });
      } else if (event.kind === 'effect-expired' && String(moment.actorId || '') === id) {
        effects.delete(effect);
      }
    }
  }
  return [...effects.values()];
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function effectEventLabel(event) {
  const effect = titleCase(event.effect || event.type || 'Status');
  if (event.kind === 'effect-applied') return `${event.targetLabel || 'Target'} · ${effect} applied`;
  if (event.kind === 'effect-blocked') return `${event.targetLabel || 'Target'} · ${effect} resisted`;
  if (event.kind === 'effect-expired') return `${effect} expired`;
  if (event.kind === 'effect-damage') return `${effect} · −${numberOr(event.damage)} HP`;
  return null;
}

function formatDamage(moment) {
  if (numberOr(moment?.healing) > 0) return `+${numberOr(moment.healing)} HP`;
  return numberOr(moment?.damage) > 0 ? `−${numberOr(moment.damage)} HP` : 'MISS';
}

function LegacySharedBattleSurface({ replay, createdAt, metadata = {}, assets = [], className = '', finalTitle = '', finalDetail = '', battleLabel = null, onComplete = null }) {
  const kind = sharedReplayKind(replay);
  const moments = useMemo(() => replayMoments(replay), [replay]);
  const frame = usePlayback(replay, createdAt);
  const arenaRef = useRef(null);
  const artRefs = useRef(new Map());
  const [trajectory, setTrajectory] = useState(null);
  const completionNotifiedRef = useRef(false);
  const { players, enemies } = normalizeCombatants(replay, metadata);
  const dungeonRewards = kind === 'dungeon' && Array.isArray(replay.rewards)
    ? replay.rewards.filter((reward) => reward?.item).map((reward, index) => ({ ...reward, index }))
    : [];

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
  const outcome = replay.status || replay.details?.outcome || replay.receipt?.outcome || 'defeat';
  const status = outcome === 'room_clear' ? 'room_clear' : outcome === 'draw' ? 'draw' : outcome === 'victory' ? 'victory' : 'defeat';
  const statusLabel = status === 'victory' ? 'VICTORY' : status === 'defeat' ? 'DEFEAT' : status === 'draw' ? 'DRAW' : status === 'room_clear' ? 'ROOM CLEAR' : 'LIVE BATTLE';
  const enemyName = enemies.map((enemy) => enemy.displayName || enemy.label || enemy.name || enemy.id).filter(Boolean).join(' + ');
  const replayTitle = finalTitle || (status === 'victory' ? `Defeated ${enemyName}` : status === 'defeat' ? `Fell to ${enemyName}` : status === 'draw' ? 'The battle ended in a draw' : `Cleared ${enemyName}`);
  const replayDetail = finalDetail || (status === 'victory' ? 'The clear is secured.' : status === 'defeat' ? 'Recover before the next battle.' : status === 'draw' ? 'Both sides remain standing.' : 'Choose the next room action.');
  const currentSummary = moment?.summary || (frame.complete ? replayTitle : 'The battle is resolving…');
  const allUnits = [...players, ...enemies];
  const impactVisible = frame.phase === 'impact';
  const trajectoryVisible = !frame.complete && (frame.phase === 'trajectory' || impactVisible);
  const damagePosition = impactVisible && trajectory ? { left: trajectory.x2, top: trajectory.damageY } : undefined;
  const actionActor = allUnits.find((unit) => entityId(unit, 'combatant') === String(moment?.actorId));
  const actionSkill = actionActor?.signatureSkill;
  const effectUpdates = (moment?.events || []).map(effectEventLabel).filter(Boolean);
  const manaUpdates = (moment?.manaEvents || []).map((event) => {
    const delta = Number(event.delta ?? (Number(event.manaAfter) - Number(event.manaBefore)));
    if (!Number.isFinite(delta) || delta === 0) return null;
    const recipient = allUnits.find((unit) => entityId(unit, 'combatant') === String(event.combatantId || event.targetId || ''));
    return `${recipient?.displayName || recipient?.label || recipient?.name || 'Combatant'} · ${delta > 0 ? '+' : ''}${delta} Mana`;
  }).filter(Boolean);

  const renderUnit = (unit, role, labelOverride = null) => {
    const id = entityId(unit, role);
    const isEnemy = role === 'enemy';
    const label = labelOverride || unit.displayName || unit.label || unit.name || unit.id || id;
    const rawMaxHp = unit.maxHp ?? unit.maxHealth ?? unit.hp?.max;
    const maxHp = rawMaxHp == null ? null : numberOr(rawMaxHp, 0);
    const hp = currentHp(unit, replay, moments, frame);
    const maxMana = numberOr(unit.maxMana ?? unit.mana?.max, 0);
    const mana = currentMana(unit, moments, frame);
    const hasMana = maxMana > 0;
    const skill = unit.signatureSkill;
    const duelGear = kind === 'duel'
      ? DUEL_EQUIPMENT_SLOTS.map(([slot, slotLabel]) => [slot, slotLabel, unit.equipment?.[slot]])
        .filter(([, , item]) => item && (item.name || item.visualAssetId))
      : [];
    const activeEffects = statusesAt(unit, moments, frame);
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
      <div className="shared-battle-unit__copy" data-combatant-id={id} data-testid={`shared-battle-unit-copy-${id}`}>
        <strong>{label}</strong>
        {maxHp > 0 ? <div className={`shared-battle-meter shared-battle-hp ${isEnemy ? 'shared-battle-hp--enemy' : ''}`} data-testid={`shared-battle-hp-${id}`}><span style={{ width: `${percentage(hp, maxHp)}%` }} /><b>{hp}/{maxHp} HP</b></div> : null}
        {hasMana ? <div className="shared-battle-meter shared-battle-mana" data-testid={`shared-battle-mana-${id}`} data-mana={mana} aria-label={`${label} Mana ${mana}/${maxMana}`}><span style={{ width: `${percentage(mana, maxMana)}%` }} /><b>{mana}/{maxMana} Mana</b></div> : null}
        {skill?.name ? <small className="shared-battle-signature" title={skill.description || undefined}>Skill · {skill.name}</small> : null}
        {activeEffects.length ? <div className="shared-battle-effects" data-testid={`shared-battle-effects-${id}`} aria-label={`${label} active statuses`}>{activeEffects.map((effect, index) => <span key={`${effect.id || effect.type || effect.name || 'effect'}-${index}`}>{titleCase(effect.name || effect.type || effect.id)}</span>)}</div> : null}
        {duelGear.length ? <div className="shared-battle-loadout" data-testid={`duel-loadout-${id}`} aria-label={`${label} equipped items`}>
          {duelGear.map(([slot, slotLabel, item]) => {
            const asset = resolveShellAsset(item, assets, ['item', 'icon']);
            return <span className="shared-battle-loadout__item" key={slot} aria-label={`${slotLabel}: ${item.name || slotLabel}`} title={`${slotLabel}: ${item.name || slotLabel}`} data-testid={`duel-loadout-${id}-${slot}`}>
              {asset ? <img src={asset.src} alt="" data-visual-asset-id={asset.id} /> : <i aria-hidden="true">✦</i>}
              <small>{item.name || slotLabel}</small>
            </span>;
          })}
        </div> : null}
      </div>
    </div>;
  };

  return (
    <section className={`shared-battle-surface shared-battle-surface--${kind} ${frame.complete ? 'is-complete' : 'is-playing'} ${className}`.trim()} data-testid="shared-battle-surface" data-replay-state={frame.complete ? 'complete' : 'playing'} data-replay-phase={frame.phase} data-replay-index={frame.visibleIndex} data-replay-moment-index={frame.momentIndex} data-replay-progress={frame.progress.toFixed(3)} data-current-actor-id={frame.currentActorId || undefined} data-current-target-id={frame.currentTargetId || undefined} data-replay-battle-id={replay.battleId || replay.runId || undefined}>
      <div className="shared-battle-header">
        <div><span className="shell-kicker">{frame.complete ? statusLabel : 'LIVE FROM THE SHARED THREAD'}</span><strong>{battleLabel || (kind === 'dungeon' ? `Room ${numberOr(replay.roomIndex) + 1}` : kind === 'duel' ? 'Duel' : 'Automatic battle')}</strong></div>
        <span className="shared-battle-sync">{frame.complete ? 'SYNCED' : `PLAYING · ${frame.phase.toUpperCase()}`}</span>
      </div>
      <div className="shared-battle-arena" ref={arenaRef}>
        <svg className="shared-battle-trajectory" data-testid="shared-battle-trajectory" viewBox={`0 0 ${trajectory?.width || 1} ${trajectory?.height || 1}`} aria-hidden="true" focusable="false">
          {trajectory && trajectoryVisible ? <>
            <line className="shared-trajectory__beam" pathLength="1" x1={trajectory.x1} y1={trajectory.y1} x2={trajectory.x2} y2={trajectory.y2} />
            <line className="shared-trajectory__core" pathLength="1" x1={trajectory.x1} y1={trajectory.y1} x2={trajectory.x2} y2={trajectory.y2} />
            {impactVisible ? <><circle className="shared-trajectory__burst" cx={trajectory.x2} cy={trajectory.y2} r="12" /><circle className="shared-trajectory__ring" cx={trajectory.x2} cy={trajectory.y2} r="18" /></> : null}
          </> : null}
        </svg>
        <div className="shared-battle-combatants">
          <div className="shared-battle-party">{players.map((player) => renderUnit({ ...player, visualAssetId: player.visualAssetId || (player.id === metadata.playerId ? metadata.playerVisualAssetId : null) }, 'player'))}</div>
          <span className="shared-battle-versus" aria-hidden="true">VS</span>
          <div className="shared-battle-enemies">{enemies.map((enemy) => renderUnit(enemy, 'enemy', enemy.displayName || enemy.label || enemy.name || 'Enemy'))}</div>
        </div>
        {impactVisible && (moment?.damage > 0 || moment?.healing > 0) ? <span className={`damage-float ${moment.healing > 0 ? 'damage-float--healing' : ''} ${moment.critical ? 'damage-float--critical' : ''}`} style={damagePosition} data-testid="shared-battle-floating-damage">{formatDamage(moment)}</span> : null}
        <div className="shared-battle-progress" aria-label="Battle replay progress"><span style={{ width: `${Math.round(frame.progress * 100)}%` }} /></div>
      </div>
      <div className="shared-battle-feed" aria-live="polite"><span className="shell-kicker">{frame.complete ? 'FINAL RECEIPT' : `MOMENT ${Math.max(1, frame.momentIndex + 1)} / ${moments.length}`}</span>{moment?.actionType === 'skill' || moment?.skillId ? <span className="shared-battle-action-label">{actionSkill?.name || titleCase(moment.skillId || 'Skill')}</span> : null}<p>{currentSummary}</p>{effectUpdates.length || manaUpdates.length ? <div className="shared-battle-status-updates" data-testid="shared-battle-status-updates">{[...effectUpdates, ...manaUpdates].map((update, index) => <span key={`${update}-${index}`}>{update}</span>)}</div> : null}{moment?.critical && !frame.complete ? <strong className="shared-battle-critical">CRITICAL</strong> : null}</div>
      {frame.complete ? <div className={`shared-battle-result shared-battle-result--${status}`} data-testid="shared-battle-result"><span>{statusLabel}</span><strong>{replayTitle}</strong><b>{replayDetail}</b></div> : null}
      {frame.complete && dungeonRewards.length ? <div className="shared-battle-rewards" data-testid="dungeon-replay-rewards" aria-label="Dungeon rewards">{dungeonRewards.map(({ playerId, item, index }) => { const asset = resolveShellAsset(item, assets, ['item', 'icon']); const recipient = players.find((player) => String(player.id) === String(playerId)); return <div className="stream-loot-line" key={`${playerId || index}-${item.id || item.name}`} data-item-id={item.id || undefined}>{recipient?.displayName ? <span>{recipient.displayName}</span> : <span>REWARD</span>}{asset ? <img src={asset.src} alt="" data-visual-asset-id={asset.id} /> : null}<strong>{item.name || 'Equipment'}</strong><small>{item.rarity || 'equipment'}{item.slot ? ` · ${item.slot}` : ''}</small></div>; })}</div> : null}
      <span className="sr-only">{allUnits.map((unit) => `${unit.displayName || unit.name || 'Combatant'} ${currentHp(unit, replay, moments, frame)} HP`).join('. ')}</span>
    </section>
  );
}

function arenaUnitAt(unit, replay, timeMs, complete, reducedMotion = false) {
  if (complete) return replay.finalCombatants?.find((candidate) => candidate.id === unit.id) || unit;
  const next = { ...unit };
  for (const event of replay.events || []) {
    if (Number(event.atMs || 0) > timeMs) break;
    if (event.kind === 'move' && event.unitId === unit.id) {
      const elapsed = timeMs - Number(event.atMs || 0);
      const duration = Math.max(1, Number(event.durationMs || 1));
      const ratio = Math.max(0, Math.min(1, elapsed / duration));
      const movementProgress = reducedMotion ? Number(ratio >= 1) : ratio;
      next.x = Number(event.fromX) + (Number(event.toX) - Number(event.fromX)) * movementProgress;
      next.y = Number(event.fromY) + (Number(event.toY) - Number(event.fromY)) * movementProgress;
    }
    const update = event.updates?.find((candidate) => candidate.id === unit.id);
    if (update) Object.assign(next, update);
  }
  return next;
}

function arenaActionSummary(event, units) {
  if (!event) return 'The battle is resolving…';
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const actor = byId.get(event.actorId)?.displayName || 'A combatant';
  const target = byId.get(event.targetId)?.displayName || 'the opposing line';
  if (event.kind === 'move') return `${byId.get(event.unitId)?.displayName || 'A combatant'} moved into position.`;
  const damage = (event.damageEvents || []).reduce((sum, entry) => sum + Number(entry.damage || 0), 0);
  const healing = (event.healingEvents || []).reduce((sum, entry) => sum + Number(entry.healing || 0), 0);
  if (healing && !damage) {
    const healed = (event.healingEvents || []).map((entry) => byId.get(entry.targetId)?.displayName || 'an ally');
    return `${actor} healed ${[...new Set(healed)].join(' and ')} · +${healing} HP.`;
  }
  if (event.actionType === 'skill') return `${actor} used ${titleCase(event.skillName || event.skillId || 'a skill')}${damage ? ` · −${damage} HP` : ''}${healing ? ` · +${healing} HP` : ''}.`;
  return damage ? `${actor} hit ${target} · −${damage} HP.` : `${actor} acted.`;
}

function ArenaReplaySurface({ replay, legacyReplay, createdAt, metadata = {}, assets = [], className = '', finalTitle = '', finalDetail = '', battleLabel = null, onComplete = null }) {
  const scope = useRef(null);
  const timelineRef = useRef(null);
  const unitRefs = useRef(new Map());
  const completionNotifiedRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(storedReplaySpeed);
  const durationMs = Math.max(1, Number(replay.durationMs || 1));
  const detailedCombatants = legacyReplay?.details?.combatants || [];
  const detailsById = new Map(detailedCombatants.map((unit) => [String(unit.id), unit]));
  const roster = (replay.combatants || []).map((unit) => {
    const detail = detailsById.get(String(unit.id));
    return {
      ...unit,
      equipment: unit.equipment && Object.values(unit.equipment).some(Boolean)
        ? unit.equipment
        : detail?.equipment || unit.equipment || {},
    };
  });
  const replayId = replay.context?.battleId || legacyReplay?.battleId || legacyReplay?.runId || createdAt || 'arena-replay';
  const timelineDuration = durationMs / 1000;

  useGSAP(() => {
    if (!replay) {
      setPlaying(false);
      return undefined;
    }
    const cursor = { progress: 0 };
    const timeline = gsap.timeline({
      paused: true,
      onUpdate: () => setProgress(cursor.progress),
      onComplete: () => setPlaying(false),
    });
    timeline.to(cursor, { progress: 1, duration: timelineDuration, ease: 'none' });
    timelineRef.current = timeline;
    setProgress(0);
    setPlaying(true);
    timeline.play(0);
    return () => {
      timeline.kill();
      if (timelineRef.current === timeline) timelineRef.current = null;
    };
  }, { scope, dependencies: [replayId, timelineDuration], revertOnUpdate: true });

  useEffect(() => {
    timelineRef.current?.timeScale(speed);
  }, [speed]);

  useEffect(() => {
    try { window.localStorage.setItem(ARENA_REPLAY_SPEED_KEY, String(speed)); } catch {}
  }, [speed]);

  useEffect(() => {
    completionNotifiedRef.current = false;
  }, [replayId]);

  useEffect(() => {
    if (progress >= 1 && !completionNotifiedRef.current) {
      completionNotifiedRef.current = true;
      onComplete?.();
    }
  }, [progress, onComplete]);

  const complete = progress >= 1;
  const timeMs = complete ? durationMs : progress * durationMs;
  const units = roster.map((unit) => arenaUnitAt(unit, replay, timeMs, complete, reducedMotion));
  const finalById = new Map((replay.finalCombatants || []).map((unit) => [unit.id, unit]));
  const players = units.filter((unit) => unit.team === 'players');
  const enemies = units.filter((unit) => unit.team === 'enemies');
  const events = replay.events || [];
  const currentEvent = [...events].reverse().find((event) => Number(event.atMs || 0) <= timeMs) || null;
  const actionEvent = [...events].reverse().find((event) => event.kind === 'action' && Number(event.atMs || 0) <= timeMs) || null;
  const actionEffects = events.flatMap((event, index) => {
    if (event.kind !== 'action') return [];
    const ageMs = timeMs - Number(event.atMs || 0);
    return ageMs >= 0 && ageMs <= 720 ? [{ event, index, ageMs }] : [];
  });
  const manaUpdates = (currentEvent?.manaEvents || []).map((event) => {
    const delta = Number(event.delta ?? (Number(event.manaAfter) - Number(event.manaBefore)));
    if (!Number.isFinite(delta) || delta === 0) return null;
    const recipient = units.find((unit) => unit.id === String(event.combatantId || event.targetId || ''));
    return `${recipient?.displayName || recipient?.name || 'Combatant'} · ${delta > 0 ? '+' : ''}${delta} Mana`;
  }).filter(Boolean);
  const outcome = legacyReplay?.status || replay.outcome || 'draw';
  const status = outcome === 'room_clear' ? 'room_clear' : outcome === 'victory' ? 'victory' : outcome === 'defeat' ? 'defeat' : 'draw';
  const statusLabel = status === 'room_clear' ? 'ROOM CLEAR' : status.toUpperCase();
  const targetId = [...actionEffects].reverse().find(({ event }) => event.targetId)?.event.targetId || actionEvent?.targetId || null;

  useLayoutEffect(() => {
    for (const unit of units) {
      const node = unitRefs.current.get(unit.id);
      const start = roster.find((candidate) => candidate.id === unit.id);
      if (!node || !start) continue;
      gsap.set(node, {
        xPercent: (Number(unit.x || 0) - Number(start.x || 0)) * 100,
        yPercent: (Number(unit.y || 0) - Number(start.y || 0)) * 100,
      });
    }
  }, [progress, complete, roster]);

  const togglePlayback = () => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (timeline.paused()) {
      if (timeline.progress() >= 1) timeline.restart();
      else timeline.play();
      setPlaying(true);
    } else {
      timeline.pause();
      setPlaying(false);
    }
  };
  const restart = () => {
    timelineRef.current?.restart();
    setPlaying(true);
  };
  const skip = () => {
    timelineRef.current?.progress(1);
    setProgress(1);
    setPlaying(false);
  };
  const teamSummary = (team, label, enemy = false) => <div className={`arena-replay-team ${enemy ? 'arena-replay-team--enemy' : ''}`} key={label}>
    <strong>{label}</strong>
    <div>{team.map((unit) => {
      const current = unit;
      const asset = resolveShellAsset(unit, assets, enemy ? ['mob', 'boss'] : ['character']);
      const duelGear = replay.context?.activity === 'duel'
        ? DUEL_EQUIPMENT_SLOTS.map(([slot, slotLabel]) => [slot, slotLabel, unit.equipment?.[slot]])
          .filter(([, , item]) => item && (item.name || item.visualAssetId))
        : [];
      return <div className="arena-replay-roster-unit" key={unit.id} data-testid={`arena-replay-roster-${unit.id}`}>
        {asset ? <img src={asset.src} alt="" data-visual-asset-id={asset.id} /> : <span aria-hidden="true">✦</span>}
        <div><b>{unit.displayName || unit.name}</b><small>{unit.role || 'combatant'} · {Number(current.hp || 0)}/{unit.maxHp} HP</small>
          <div className={`arena-replay-meter ${enemy ? 'is-enemy' : ''}`}><i style={{ width: `${percentage(current.hp, unit.maxHp)}%` }} /></div>
          <small>{Number(current.mana || 0)}/{unit.maxMana} Mana</small>
          {duelGear.length ? <div className="shared-battle-loadout" data-testid={`duel-loadout-${unit.id}`} aria-label={`${unit.displayName || unit.name} equipped items`}>
            {duelGear.map(([slot, slotLabel, item]) => {
              const gearAsset = resolveShellAsset(item, assets, ['item', 'icon']);
              return <span className="shared-battle-loadout__item" key={slot} aria-label={`${slotLabel}: ${item.name || slotLabel}`} title={`${slotLabel}: ${item.name || slotLabel}`} data-testid={`duel-loadout-${unit.id}-${slot}`}>
                {gearAsset ? <img src={gearAsset.src} alt="" data-visual-asset-id={gearAsset.id} /> : <i aria-hidden="true">✦</i>}
                <small>{item.name || slotLabel}</small>
              </span>;
            })}
          </div> : null}
        </div>
      </div>;
    })}</div>
  </div>;

  if (!replay?.combatants?.length) return null;
  return <section ref={scope} className={`shared-battle-surface arena-replay-surface ${complete ? 'is-complete' : 'is-playing'} ${className}`.trim()} data-testid="shared-battle-surface" data-arena-replay-surface="true" data-replay-state={complete ? 'complete' : 'playing'} data-replay-battle-id={replayId} data-replay-duration-ms={durationMs} data-replay-speed={speed} data-replay-progress={progress.toFixed(4)}>
    <header className="arena-replay-header"><div><span className="shell-kicker">{complete ? statusLabel : 'ARENA REPLAY'}</span><strong>{battleLabel || replay.context?.activity?.replaceAll('-', ' ') || 'Battle'}</strong></div><span>{Math.round(progress * 100)}%</span></header>
    <div className="arena-replay-board" role="img" aria-label={`8 by 8 battle arena. ${players.length} players and ${enemies.length} enemies.`}>
      <div className="arena-replay-grid" aria-hidden="true" />
      <svg className="arena-replay-projectiles" viewBox="0 0 8 8" aria-hidden="true" focusable="false" data-testid="arena-replay-projectiles">
        {actionEffects.map(({ event, index, ageMs }) => {
          const actor = units.find((unit) => unit.id === event.actorId);
          const target = units.find((unit) => unit.id === event.targetId);
          const isRanged = actor?.role === 'ranged' || actor?.basicActionCode === 'ranged-strike' || actor?.role === 'support';
          const healingOnly = (event.healingEvents || []).length > 0 && !(event.damageEvents || []).some((entry) => Number(entry.damage) > 0);
          if (!isRanged || healingOnly) return null;
          const from = event.actorPosition || actor;
          const to = event.targetPosition || target;
          if (!from || !to) return null;
          const travel = Math.min(1, ageMs / 420);
          const x1 = Number(from.x) + 0.5;
          const y1 = Number(from.y) + 0.5;
          const x2 = Number(to.x) + 0.5;
          const y2 = Number(to.y) + 0.5;
          const projectileX = x1 + (x2 - x1) * travel;
          const projectileY = y1 + (y2 - y1) * travel;
          const opacity = Math.max(0, 1 - Math.max(0, ageMs - 340) / 380);
          return <g key={`${event.turnNumber || 'action'}-${index}`} className={`arena-replay-projectile ${event.actionType === 'skill' ? 'is-skill' : ''}`}>
            <line x1={x1} y1={y1} x2={projectileX} y2={projectileY} style={{ opacity: opacity * 0.55 }} />
            <circle cx={projectileX} cy={projectileY} r="0.09" style={{ opacity }} />
          </g>;
        })}
      </svg>
      {roster.map((start) => {
        const unit = units.find((candidate) => candidate.id === start.id) || start;
        const enemy = unit.team === 'enemies';
        const asset = resolveShellAsset(unit, assets, enemy ? (unit.isBoss ? ['boss', 'mob'] : ['mob', 'boss']) : ['character']);
        const hp = Number(unit.hp || 0);
        const mana = Number(unit.mana || 0);
        const defeated = hp <= 0;
        const unitActions = actionEffects.filter(({ event }) => event.actorId === unit.id || event.targetId === unit.id
          || (event.damageEvents || []).some((entry) => entry.targetId === unit.id)
          || (event.healingEvents || []).some((entry) => entry.targetId === unit.id));
        const feedback = actionEffects.flatMap(({ event, index, ageMs }) => [
          ...(event.damageEvents || []).filter((entry) => entry.targetId === unit.id && Number(entry.damage) > 0)
            .map((entry, part) => ({ key: `damage-${index}-${part}`, type: 'damage', amount: entry.damage, ageMs })),
          ...(event.healingEvents || []).filter((entry) => entry.targetId === unit.id && Number(entry.healing) > 0)
            .map((entry, part) => ({ key: `heal-${index}-${part}`, type: 'healing', amount: entry.healing, ageMs })),
        ]);
        const statusPulse = actionEffects.find(({ event }) => event.skillId && (
          event.actorId === unit.id
          || (event.healingEvents || []).some((entry) => entry.targetId === unit.id)
          || (event.effectEvents || []).some((entry) => String(entry.targetId || '') === unit.id)
        ));
        const active = actionEffects.some(({ event }) => event.actorId === unit.id);
        const targeted = feedback.length > 0 || targetId === unit.id && actionEvent?.targetId === unit.id;
        const activeMove = [...events].reverse().find((event) => event.kind === 'move' && event.unitId === unit.id
          && timeMs >= Number(event.atMs || 0) && timeMs <= Number(event.atMs || 0) + Number(event.durationMs || 0));
        const moveProgress = activeMove ? Math.max(0, Math.min(1, (timeMs - Number(activeMove.atMs || 0)) / Math.max(1, Number(activeMove.durationMs || 1)))) : 0;
        const lunge = reducedMotion ? 0 : unitActions.reduce((maximum, action) => {
          if (action.event.actorId !== unit.id) return maximum;
          const phase = Math.min(1, action.ageMs / 230);
          const recovery = action.ageMs > 230 ? Math.max(0, 1 - (action.ageMs - 230) / 300) : 1;
          return Math.max(maximum, Math.sin(phase * Math.PI) * recovery);
        }, 0);
        const facing = Number(unit.facing) < 0 ? -1 : 1;
        const walkBounce = reducedMotion || !activeMove ? 0 : Math.sin((moveProgress * Number(activeMove.durationMs || 1)) / 75) * 2;
        const defeatAge = actionEffects.find(({ event }) => event.damageEvents?.some((entry) => entry.targetId === unit.id && Number(entry.targetHpAfter) === 0))?.ageMs;
        const defeatOpacity = defeated ? Math.max(0.24, 1 - Math.max(0, Number(defeatAge || 0) - 80) / 900) : 1;
        const groundHealing = feedback.filter((entry) => entry.type === 'healing').reduce((maximum, entry) => Math.max(maximum, 1 - entry.ageMs / 650), 0);
        const bodyTransform = `translate3d(${facing * lunge * 10}px,${walkBounce}px,0) scaleX(${facing})`;
        return <div className={`arena-replay-unit shared-battle-unit ${enemy ? 'is-enemy' : 'is-player'} ${defeated ? 'is-defeated' : ''} ${active ? 'is-active' : ''} ${targeted ? 'is-targeted' : ''} ${activeMove ? 'is-moving' : ''}`}
          key={unit.id} data-combatant-id={unit.id} data-testid={`arena-replay-unit-${unit.id}`}
          data-combat-profile={unit.combatProfileCode || ''}
          style={{ left: `${Number(start.x || 0) * 12.5}%`, top: `${Number(start.y || 0) * 12.5}%`, zIndex: (active ? 30 : 2) + Math.round(Number(unit.y || 0) * 2) }}
          ref={(node) => { if (node) unitRefs.current.set(unit.id, node); else unitRefs.current.delete(unit.id); }}>
          <span className="arena-replay-unit__ground" aria-hidden="true" style={{ opacity: Math.max(0.25, groundHealing), transform: `scale(${1 + (1 - groundHealing) * 0.35})` }} />
          {statusPulse ? <span className="arena-replay-unit__effect-ring" aria-hidden="true" style={{ opacity: Math.max(0, 1 - statusPulse.ageMs / 720), transform: `scale(${0.72 + Math.min(1, statusPulse.ageMs / 720) * 0.5})` }} /> : null}
          <div className="arena-replay-unit__bars"><span className="hp"><i style={{ transform: `scaleX(${percentage(hp, unit.maxHp) / 100})` }} /></span><span className="mana"><i style={{ transform: `scaleX(${percentage(mana, unit.maxMana) / 100})` }} /></span></div>
          <span className="arena-replay-unit__body" style={{ transform: bodyTransform, opacity: defeatOpacity }}>
            {asset ? <img src={asset.src} alt="" data-visual-asset-id={asset.id} /> : <span className="arena-replay-unit__fallback" aria-hidden="true">✦</span>}
          </span>
          <small>{unit.displayName || unit.name}</small>
          {feedback.map((entry) => {
            const ageRatio = Math.min(1, entry.ageMs / 720);
            return <b key={entry.key} className={`arena-replay-feedback is-${entry.type}`} style={{ opacity: Math.max(0, 1 - ageRatio), transform: `translateY(${-4 - 13 * ageRatio}px)` }}>
              {entry.type === 'healing' ? '+' : '−'}{entry.amount}
            </b>;
          })}
          <span className="sr-only" aria-hidden="true" data-testid={enemy ? 'shared-battle-enemy' : 'shared-battle-player'} data-combatant-id={unit.id}>
            {unit.displayName || unit.name}
            <small className="shared-battle-signature">{unit.signatureSkill?.name || unit.skills?.[0] || unit.skillCode || 'Attack pattern'}</small>
          </span>
          <div className="sr-only shared-battle-hp" data-testid={`shared-battle-hp-${unit.id}`}><span /><b>{hp}/{unit.maxHp} HP</b></div>
          <div className="sr-only shared-battle-mana" data-testid={`shared-battle-mana-${unit.id}`} data-mana={mana} aria-label={`${unit.displayName || unit.name} Mana ${mana}/${unit.maxMana}`}><span /><b>{mana}/{unit.maxMana} Mana</b></div>
          <div className="sr-only shared-battle-effects" data-testid={`shared-battle-effects-${unit.id}`}>{(unit.effects || []).map((effect) => effect.name || effect.type).join(', ')}</div>
        </div>;
      })}
      <span className="arena-replay-time">{(timeMs / 1000).toFixed(1)}s</span>
    </div>
    <div className="arena-replay-rosters">{teamSummary(players, 'PARTY')}{teamSummary(enemies, 'ENEMIES', true)}</div>
    <div className="arena-replay-feed" aria-live="polite"><span className="shell-kicker">{complete ? 'FINAL RESULT' : actionEvent?.actionType === 'skill' ? <span className="shared-battle-action-label">{titleCase(actionEvent.skillName || actionEvent.skillId || 'Skill')}</span> : 'BATTLE MOMENT'}</span><p>{complete ? finalDetail || finalTitle || `${statusLabel} · ${Number(replay.finalCombatants?.length || 0)} combatants` : arenaActionSummary(currentEvent, units)}</p>{manaUpdates.length ? <div className="shared-battle-status-updates" data-testid="shared-battle-status-updates">{manaUpdates.map((update, index) => <span key={`${update}-${index}`}>{update}</span>)}</div> : null}</div>
    {complete ? <div className={`arena-replay-result shared-battle-result is-${status}`} data-testid="shared-battle-result"><b>{finalTitle || (status === 'room_clear' || status === 'victory' ? 'Victory' : status === 'defeat' ? 'Defeat' : 'Draw')}</b><span>{finalDetail || `${Number(finalById.get(players[0]?.id)?.hp || 0)} HP remaining`}</span></div> : null}
    <div className="arena-replay-controls" aria-label="Battle replay controls">
      <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pause battle replay' : 'Play battle replay'}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" onClick={restart} aria-label="Restart battle replay">Replay</button>
      <button type="button" onClick={skip} disabled={complete} aria-label="Skip to battle result">Skip</button>
      <div role="group" aria-label="Replay speed">{[1, 2, 4].map((value) => <button type="button" key={value} onClick={() => setSpeed(value)} aria-pressed={speed === value}>{value}×</button>)}</div>
      {reducedMotion ? <span>Reduced motion</span> : null}
    </div>
    <span className="sr-only">{[...players, ...enemies].map((unit) => `${unit.displayName || unit.name}, ${Number(unit.hp || 0)} of ${unit.maxHp} HP`).join('. ')}</span>
  </section>;
}

export function SharedBattleSurface(props) {
  const arenaReplay = props.replay?.arenaReplay
    || (props.replay?.kind === 'arena-combat-replay' ? props.replay : null);
  if (arenaReplay) return <ArenaReplaySurface {...props} replay={arenaReplay} legacyReplay={props.replay} />;
  return <LegacySharedBattleSurface {...props} />;
}
