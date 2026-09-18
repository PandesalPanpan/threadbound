import { useCallback, useEffect, useRef } from 'react';
import { entryBody, entryKey, entryKind, formatEntryTime, resolveShellAsset } from '../../shell/presentation.js';
import { PanelButton, RichCard } from '../common/RichCard.jsx';

function actorLabel(entry) {
  const metadata = entry?.metadata || {};
  const battleActor = metadata?.battle?.combatants?.find((unit) => unit.id === metadata.playerId);
  return metadata.playerName
    || metadata.character?.displayName
    || battleActor?.displayName
    || battleActor?.name
    || (entry?.actorName && entry.actorName !== 'THREADBOUND' ? entry.actorName : 'A Weaver');
}

function sharedKicker(entry, viewerId, command) {
  const mine = Boolean(viewerId && entry?.actorPlayerId === viewerId);
  return `${mine ? 'YOUR SHARED ACTION' : `${actorLabel(entry)} · SHARED ACTION`} · /${command}`;
}

function battleReplayPayload(entry) {
  const metadata = entry?.metadata || {};
  if (!metadata.battle || !metadata.battleReplay) return null;
  return {
    mode: 'hunt-replay',
    source: 'hunt',
    authoritative: true,
    replayable: true,
    battleId: `hunt:${entry.id || metadata.playerId || 'stream'}`,
    battle: metadata.battle,
    loadout: metadata.battleLoadout || {},
    receipt: metadata.battleReplay.receipt,
    details: metadata.battleReplay.details,
  };
}

function openBattleReplay(entry) {
  const payload = battleReplayPayload(entry);
  if (!payload) return;
  window.sessionStorage.setItem('threadbound:battle-replay', JSON.stringify(payload));
  window.location.href = '/game?view=battle&source=stream';
}

function HuntSharedCard({ entry, viewerId }) {
  const metadata = entry.metadata || {};
  const victory = Boolean(metadata.victory);
  const gold = Number(metadata.gold ?? metadata.threadDust ?? 0) || 0;
  const xp = Number(metadata.experienceGained ?? metadata.xp ?? 0) || 0;
  const goldLost = Number(metadata.goldLost || 0) || 0;
  const loadout = Object.values(metadata.battleLoadout || {}).filter(Boolean);
  const hasReplay = Boolean(metadata.battle && metadata.battleReplay);

  return (
    <RichCard
      kind="hunt"
      kicker={sharedKicker(entry, viewerId, 'hunt')}
      title="Hunt"
      subtitle="Authoritative result shared with the whole Adventure Stream."
      className={`stream-shared-card ${entry.actorPlayerId === viewerId ? 'is-owner' : 'is-observer'}`}
      testId="stream-hunt-rich-card"
    >
      <div className={`stream-outcome-banner ${victory ? 'is-win' : 'is-loss'}`}>
        <span>{victory ? 'VICTORY' : 'DEFEAT'}</span>
        <strong>{victory ? `Defeated ${metadata.enemyName || 'the encounter'}` : `Fell to ${metadata.enemyName || 'the encounter'}`}</strong>
        <b>{victory ? `+${gold} GOLD · +${xp} XP` : goldLost > 0 ? `−${goldLost} GOLD` : 'NO REWARD'}</b>
      </div>
      <div className="stream-card-facts">
        <span>HP <strong>{metadata.remainingHp ?? 0}/{metadata.maxHp ?? 0}</strong></span>
        <span>Turns <strong>{metadata.battleTurnCount ?? metadata.battle?.turns?.length ?? 0}</strong></span>
        <span>Enemy <strong>{metadata.enemyName || 'Unknown'}</strong></span>
      </div>
      {loadout.length ? <div className="stream-loadout"><span className="shell-kicker">LOADOUT USED</span><div>{loadout.map((item) => <span key={item.id || item.name}>{item.name}<small>{item.slot || 'gear'}</small></span>)}</div></div> : null}
      {metadata.itemName ? <div className="stream-loot-line"><span>LOOT</span><strong>{metadata.itemName}</strong><small>{metadata.itemRarity || 'equipment'}</small></div> : null}
      {hasReplay ? <div className="shell-card-actions"><PanelButton onClick={() => openBattleReplay(entry)} primary testId="stream-watch-hunt-battle">Watch battle</PanelButton></div> : null}
    </RichCard>
  );
}

function gamblingProjection(entry) {
  const metadata = entry?.metadata || {};
  if (entry.eventType === 'BlackjackPlayed') {
    const round = metadata.round || {};
    const wager = Number(round.wager || 0);
    const payout = Number(round.payoutGold || 0);
    return {
      game: 'Blackjack',
      active: round.status === 'active',
      outcome: round.outcome || (round.status === 'active' ? 'Hand in progress' : 'Resolved'),
      wager,
      payout,
      delta: payout - wager,
      detail: round.status === 'active'
        ? `Player ${round.playerScore ?? 0} · Dealer ${round.dealerScore ?? 0}+`
        : `Player ${round.playerScore ?? 0} · Dealer ${round.dealerScore ?? 0}`,
      carriedGold: Number(metadata.carriedGold || 0),
    };
  }
  const result = entry.eventType === 'CoinflipPlayed' ? metadata.flip : metadata.spin;
  if (!result) return null;
  const wager = Number(result.wager || 0);
  const payout = Number(result.payoutGold || 0);
  return {
    game: entry.eventType === 'CoinflipPlayed' ? 'Coinflip' : 'Slots',
    active: false,
    outcome: result.outcome || 'Resolved',
    wager,
    payout,
    delta: payout - wager,
    detail: entry.eventType === 'CoinflipPlayed'
      ? `Called ${result.choice || '—'} · landed ${result.result || '—'}`
      : (result.reels || []).join(' · '),
    carriedGold: Number(metadata.carriedGold || 0),
  };
}

function GamblingSharedCard({ entry, viewerId }) {
  const projected = gamblingProjection(entry);
  if (!projected) return null;
  const tone = projected.active ? 'is-neutral' : projected.delta > 0 ? 'is-win' : projected.delta < 0 ? 'is-loss' : 'is-push';
  const deltaText = projected.delta > 0 ? `+${projected.delta} GOLD` : projected.delta < 0 ? `−${Math.abs(projected.delta)} GOLD` : '±0 GOLD';
  return (
    <RichCard
      kind="gambling"
      kicker={sharedKicker(entry, viewerId, projected.game.toLowerCase())}
      title={projected.game}
      subtitle="This wager and result are visible to everyone in the thread."
      className={`stream-shared-card ${entry.actorPlayerId === viewerId ? 'is-owner' : 'is-observer'}`}
      testId="stream-gambling-rich-card"
    >
      <div className={`stream-outcome-banner ${tone}`}>
        <span>{projected.active ? 'LIVE HAND' : String(projected.outcome).toUpperCase()}</span>
        <strong>{projected.active ? projected.detail : projected.delta > 0 ? `${actorLabel(entry)} won` : projected.delta < 0 ? `${actorLabel(entry)} lost` : 'Push'}</strong>
        <b>{projected.active ? `${projected.wager} GOLD WAGER` : deltaText}</b>
      </div>
      <div className="stream-card-facts">
        <span>Wager <strong>{projected.wager} Gold</strong></span>
        <span>Payout <strong>{projected.payout} Gold</strong></span>
        <span>Carried <strong>{projected.carriedGold} Gold</strong></span>
      </div>
      <p className="stream-card-detail">{projected.detail}</p>
    </RichCard>
  );
}

function InventorySharedCard({ entry, viewerId, assets }) {
  const metadata = entry.metadata || {};
  const character = metadata.character || {};
  const equipment = metadata.equipment || {};
  const items = Array.isArray(metadata.inventory) ? metadata.inventory : [];
  const slots = ['weapon', 'head', 'chest', 'boots', 'accessory'];
  return (
    <RichCard
      kind="inventory"
      kicker={sharedKicker(entry, viewerId, 'inventory')}
      title="Inventory"
      subtitle={`${items.length} item${items.length === 1 ? '' : 's'} · ${Number(character.gold || 0)} Gold · shared snapshot`}
      className={`stream-shared-card ${entry.actorPlayerId === viewerId ? 'is-owner' : 'is-observer'}`}
      testId="stream-inventory-rich-card"
    >
      <div className="shell-stat-grid shell-stat-grid--five">{slots.map((slot) => <div className="shell-slot" key={slot}><span>{slot}</span><strong>{equipment[slot]?.name || 'Empty'}</strong></div>)}</div>
      <div className="stream-card-facts">
        <span>HP <strong>{character.currentHealth ?? 0}/{character.maxHealth ?? 1}</strong></span>
        <span>Potions <strong>{character.healthPotions ?? 0}</strong></span>
        <span>Gold <strong>{character.gold ?? 0}</strong></span>
      </div>
      {items.length ? <div className="shell-item-list stream-inventory-list">{items.map((item) => {
        const asset = resolveShellAsset(item, assets, ['item', 'icon']);
        const equipped = Object.values(equipment).some((candidate) => candidate?.id === item.id);
        return <article className="shell-item-row stream-item-readonly" key={item.id}>
          {asset ? <img className="shell-asset-thumb" src={asset.src} alt="" data-visual-asset-id={asset.id} /> : <span className="shell-asset-fallback" aria-hidden="true">✦</span>}
          <div className="shell-item-copy"><div className="shell-item-heading"><strong>{item.name}</strong><span className={`rarity-chip rarity-chip--${item.rarity || 'common'}`}>{item.rarity || 'Common'}</span></div><small>{item.slot || 'Equipment'} · +{item.attackBonus || 0} Attack · {item.effect?.name || 'Reliable'}</small>{equipped ? <span className="shell-equipped-badge">EQUIPPED</span> : null}</div>
        </article>;
      })}</div> : <p className="shell-muted-copy">No Equipment in this snapshot.</p>}
    </RichCard>
  );
}

function DungeonSharedCard({ entry, viewerId }) {
  const metadata = entry.metadata || {};
  const eventType = entry.eventType;
  const defeated = metadata.defeatedEnemyName || metadata.defeatedEnemyId || null;
  const nextName = metadata.nextEnemyName || metadata.enemyName || null;
  const nextHp = metadata.nextEnemyHp ?? metadata.enemyHp ?? null;
  const nextMaxHp = metadata.nextEnemyMaxHp ?? metadata.enemyMaxHp ?? null;
  const actorHp = metadata.actorHp === null || metadata.actorHp === undefined ? null : `${metadata.actorHp}/${metadata.actorMaxHp} HP`;
  let tone = 'is-neutral';
  let label = 'DUNGEON';
  let title = 'Shared Dungeon update';
  let detail = '';
  if (eventType === 'DungeonStarted') {
    label = 'ENTERED';
    title = `${actorLabel(entry)} entered ${metadata.dungeonName || 'the Dungeon'}`;
    detail = nextName ? `${nextName} · ${nextHp}/${nextMaxHp} HP` : 'The first room is ready.';
  } else if (eventType === 'DungeonEncounterContinued') {
    label = 'CONTINUE';
    title = `${nextName || 'The next enemy'} entered`;
    detail = `${nextHp}/${nextMaxHp} HP · Attack is ready.`;
  } else if (eventType === 'DungeonPotionUsed') {
    label = 'POTION USED';
    title = `+${metadata.healed || 0} HP · ${actorHp || 'HP updated'}`;
    detail = `${metadata.healthPotions ?? 0} Health Potion${Number(metadata.healthPotions ?? 0) === 1 ? '' : 's'} left · ${nextName || 'Next room'} waiting.`;
  } else if (eventType === 'DungeonRetreated') {
    label = 'LEFT SAFELY';
    title = 'Dungeon run ended before the next room';
    detail = 'Carried Gold is safe. The clear reward was not secured.';
    tone = 'is-push';
  } else if (eventType === 'DungeonFailed') {
    label = 'DEFEAT';
    title = 'The party fell';
    detail = metadata.goldLost > 0 ? `−${metadata.goldLost} carried Gold · Bank safe.` : 'Carried Gold loss: 0 · Bank safe.';
    tone = 'is-loss';
  } else if (eventType === 'CombatActionResolved') {
    label = metadata.phase === 'complete' ? 'CLEARED' : defeated ? 'ROOM CLEARED' : 'ACTION RESOLVED';
    title = defeated ? `${actorLabel(entry)} defeated ${defeated}` : `${actorLabel(entry)} attacked ${metadata.enemyName || 'the enemy'}`;
    detail = defeated
      ? `+${metadata.damage || 0} damage · ${metadata.nextEnemyName ? `Next: ${metadata.nextEnemyName} · ${metadata.nextEnemyHp}/${metadata.nextEnemyMaxHp} HP` : metadata.phase === 'complete' ? 'Dungeon clear reward secured.' : 'Choose the next step.'}`
      : `${metadata.damage || 0} damage${metadata.retaliation ? ` · −${metadata.retaliation} HP` : ''}`;
    if (metadata.phase === 'complete') tone = 'is-win';
  }
  return (
    <RichCard
      kind="dungeon"
      kicker={sharedKicker(entry, viewerId, 'dungeon')}
      title="Dungeon"
      subtitle="A shared read-only receipt. The active Weaver controls the next command."
      className={`stream-shared-card ${entry.actorPlayerId === viewerId ? 'is-owner' : 'is-observer'}`}
      testId="stream-dungeon-rich-card"
    >
      <div className={`stream-outcome-banner ${tone}`}>
        <span>{label}</span>
        <strong>{title}</strong>
        <b>{detail}</b>
      </div>
      <div className="stream-card-facts">
        {actorHp ? <span>Player HP <strong>{actorHp}</strong></span> : null}
        {nextName ? <span>{metadata.phase === 'between_encounter' ? 'Next' : 'Enemy'} <strong>{nextName}{nextHp !== null ? ` · ${nextHp}/${nextMaxHp}` : ''}</strong></span> : null}
        {metadata.phase ? <span>Phase <strong>{String(metadata.phase).replaceAll('_', ' ')}</strong></span> : null}
      </div>
    </RichCard>
  );
}

function AdventureSharedCard({ entry, viewerId }) {
  const metadata = entry.metadata || {};
  const victory = Boolean(metadata.victory);
  const gold = Number(metadata.gold || 0);
  const xp = Number(metadata.experienceGained ?? metadata.xp ?? 0);
  const loss = Number(metadata.goldLost || 0);
  return (
    <RichCard
      kind="adventure"
      kicker={sharedKicker(entry, viewerId, 'adventure')}
      title="Adventure"
      subtitle="An Area encounter resolved by the server and shared with the thread."
      className={`stream-shared-card ${entry.actorPlayerId === viewerId ? 'is-owner' : 'is-observer'}`}
      testId="stream-adventure-rich-card"
    >
      <div className={`stream-outcome-banner ${victory ? 'is-win' : 'is-loss'}`}>
        <span>{victory ? 'VICTORY' : 'DEFEAT'}</span>
        <strong>{victory ? `${actorLabel(entry)} defeated ${metadata.enemyName || 'the encounter'}` : `${actorLabel(entry)} fell to ${metadata.enemyName || 'the encounter'}`}</strong>
        <b>{victory ? `+${gold} GOLD · +${xp} XP` : loss > 0 ? `−${loss} GOLD · BANK SAFE` : 'NO REWARD'}</b>
      </div>
      <div className="stream-card-facts">
        <span>HP <strong>{metadata.remainingHp ?? 0}/{metadata.maxHp ?? 0}</strong></span>
        <span>Area <strong>{metadata.areaName || `Area ${metadata.areaNumber || 1}`}</strong></span>
        {metadata.itemName ? <span>Loot <strong>{metadata.itemName}</strong></span> : null}
      </div>
      {metadata.storyEvent?.text ? <p className="stream-card-detail">{metadata.storyEvent.text}</p> : null}
    </RichCard>
  );
}

const SHARED_RICH_EVENT_TYPES = new Set(['HuntResolved', 'AdventureResolved', 'BlackjackPlayed', 'CoinflipPlayed', 'SlotsPlayed', 'InventoryViewed', 'DungeonStarted', 'CombatActionResolved', 'DungeonEncounterContinued', 'DungeonPotionUsed', 'DungeonRetreated', 'DungeonFailed']);

function SharedEntryCard({ entry, viewerId, assets }) {
  if (entry.eventType === 'HuntResolved') return <HuntSharedCard entry={entry} viewerId={viewerId} />;
  if (entry.eventType === 'AdventureResolved') return <AdventureSharedCard entry={entry} viewerId={viewerId} />;
  if (['BlackjackPlayed', 'CoinflipPlayed', 'SlotsPlayed'].includes(entry.eventType)) return <GamblingSharedCard entry={entry} viewerId={viewerId} />;
  if (entry.eventType === 'InventoryViewed') return <InventorySharedCard entry={entry} viewerId={viewerId} assets={assets} />;
  if (['DungeonStarted', 'CombatActionResolved', 'DungeonEncounterContinued', 'DungeonPotionUsed', 'DungeonRetreated', 'DungeonFailed'].includes(entry.eventType)) return <DungeonSharedCard entry={entry} viewerId={viewerId} />;
  return null;
}

export function AdventureStream({ entries = [], activeCard = null, onLoadMore = null, hasMore = false, connected = false, viewerId = null, assets = [] }) {
  const logRef = useRef(null);
  const nearBottomRef = useRef(true);
  const onScroll = useCallback((event) => {
    const element = event.currentTarget;
    nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
  }, []);

  useEffect(() => {
    const element = logRef.current;
    if (!element || !nearBottomRef.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [entries.length, activeCard]);

  return (
    <section className="game-shell-stream" aria-labelledby="adventure-stream-title">
      <header className="game-shell-stream__header">
        <div>
          <span className="shell-kicker">ADVENTURE STREAM</span>
          <h1 id="adventure-stream-title">The shared thread</h1>
        </div>
        <span className={`stream-live-pill${connected ? ' is-live' : ''}`} data-testid="stream-connection"><i /> {connected ? 'LIVE' : 'SYNC'}</span>
      </header>
      <div ref={logRef} className="game-shell-stream__log" data-testid="adventure-stream-log" role="log" aria-live="polite" onScroll={onScroll}>
        {hasMore && onLoadMore ? <button className="stream-load-more" type="button" onClick={onLoadMore}>Load earlier receipts</button> : null}
        {entries.length ? entries.map((entry) => {
          const kind = entryKind(entry);
          const sharedCard = kind === 'system' && SHARED_RICH_EVENT_TYPES.has(entry.eventType)
            ? <SharedEntryCard entry={entry} viewerId={viewerId} assets={assets} />
            : null;
          return (
            <article className={`stream-entry stream-${kind}-entry${sharedCard ? ' stream-entry--rich' : ''}`} key={entryKey(entry)} data-entry-id={entry.id || undefined} data-testid={`stream-${kind}-entry`}>
              <span className={`stream-entry__avatar stream-entry__avatar--${kind}`} aria-hidden="true">{String(sharedCard ? actorLabel(entry) : entry.actorName || (kind === 'chat' ? 'W' : '✦')).slice(0, 1)}</span>
              <div className="stream-entry__content">
                <div className="stream-entry__meta"><strong>{sharedCard ? actorLabel(entry) : entry.actorName || 'THREADBOUND'}</strong><time dateTime={entry.createdAt || undefined}>{formatEntryTime(entry.createdAt)}</time></div>
                {sharedCard || <p>{entryBody(entry)}</p>}
              </div>
            </article>
          );
        }) : (
          <div className="stream-empty"><span aria-hidden="true">✦</span><p>Your first result will land here.</p></div>
        )}
        {activeCard ? <div className="stream-active-card">{activeCard}</div> : null}
      </div>
    </section>
  );
}
