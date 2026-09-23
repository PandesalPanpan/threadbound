import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { replayFrameAt, replayMoments, sharedReplayKind } from '../../battle/sharedReplay.js';
import { resolveShellAsset } from '../../shell/presentation.js';

const DUEL_EQUIPMENT_SLOTS = Object.freeze([
  ['weapon', 'Weapon'],
  ['helmet', 'Helmet'],
  ['armor', 'Armor'],
  ['boots', 'Boots'],
  ['accessory', 'Accessory'],
]);

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

export function SharedBattleSurface({ replay, createdAt, metadata = {}, assets = [], className = '', finalTitle = '', finalDetail = '', battleLabel = null, onComplete = null }) {
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
