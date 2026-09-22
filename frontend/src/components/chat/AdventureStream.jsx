import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commandKey } from '../../api/client.js';
import { entryBody, entryKey, entryKind, formatEntryTime, resolveShellAsset } from '../../shell/presentation.js';
import { PanelButton, RichCard } from '../common/RichCard.jsx';
import { BlackjackSurface } from '../games/BlackjackSurface.jsx';
import { SharedBattleSurface } from './SharedBattleSurface.jsx';
import { ShopSurface } from './ShopSurface.jsx';

function actorLabel(entry) {
  const metadata = entry?.metadata || {};
  const battleActor = metadata?.battle?.combatants?.find((unit) => unit.id === metadata.playerId);
  return metadata.playerName
    || metadata.character?.displayName
    || battleActor?.displayName
    || battleActor?.name
    || (entry?.actorName && entry.actorName !== 'THREADBOUND' ? entry.actorName : 'A Weaver');
}

function isOwner(entry, viewerId) {
  return Boolean(viewerId && entry?.actorPlayerId === viewerId);
}

function sharedKicker(entry, viewerId, command) {
  return `${isOwner(entry, viewerId) ? 'YOUR SHARED ACTION' : `${actorLabel(entry)} · SHARED ACTION`} · /${command}`;
}

function sharedBattleReplay(entry) {
  const metadata = entry?.metadata || {};
  if (metadata.battleReplay?.kind === 'simple-dungeon-battle') return metadata.battleReplay;
  if (entry?.eventType !== 'HuntResolved' || !metadata.battleReplay) return null;
  return {
    ...metadata.battleReplay,
    battleId: metadata.battleReplay.battleId || entry.id || null,
    kind: 'automatic-battle-result',
    battle: metadata.battle,
    playerVisualAssetId: metadata.playerVisualAssetId || null,
    enemyVisualAssetId: metadata.enemyVisualAssetId || null,
  };
}

function finalBattleDetail(metadata, victory) {
  const gold = Number(metadata.gold ?? metadata.threadDust ?? 0) || 0;
  const xp = Number(metadata.experienceGained ?? metadata.xp ?? 0) || 0;
  const loss = Number(metadata.goldLost || 0) || 0;
  if (victory) return `+${gold} Gold · +${xp} XP${metadata.itemName ? ` · Loot: ${metadata.itemName}` : ''}`;
  return loss > 0 ? `−${loss} Gold · Bank safe` : 'No reward · Recover before the next Hunt';
}

function HuntSharedCard({ entry, viewerId, assets }) {
  const metadata = entry.metadata || {};
  const victory = Boolean(metadata.victory);
  const gold = Number(metadata.gold ?? metadata.threadDust ?? 0) || 0;
  const xp = Number(metadata.experienceGained ?? metadata.xp ?? 0) || 0;
  const goldLost = Number(metadata.goldLost || 0) || 0;
  const loadout = Object.values(metadata.battleLoadout || {}).filter(Boolean);
  const replay = sharedBattleReplay(entry);
  const [replayComplete, setReplayComplete] = useState(!replay);
  useEffect(() => setReplayComplete(!replay), [entry.id, replay?.battleId]);
  const revealFinal = !replay || replayComplete;
  return (
    <RichCard
      kind="hunt"
      kicker={sharedKicker(entry, viewerId, 'hunt')}
      title="Hunt"
      subtitle="The server committed the result; the shared thread is replaying the same public beats for everyone."
      className={`stream-shared-card ${isOwner(entry, viewerId) ? 'is-owner' : 'is-observer'}`}
      testId="stream-hunt-rich-card"
    >
      {replay ? <SharedBattleSurface replay={replay} createdAt={entry.createdAt} metadata={metadata} assets={assets} onComplete={() => setReplayComplete(true)} finalTitle={victory ? `Defeated ${metadata.enemyName || 'the encounter'}` : `Fell to ${metadata.enemyName || 'the encounter'}`} finalDetail={finalBattleDetail(metadata, victory)} /> : <div className={`stream-outcome-banner ${victory ? 'is-win' : 'is-loss'}`}><span>{victory ? 'VICTORY' : 'DEFEAT'}</span><strong>{victory ? `Defeated ${metadata.enemyName || 'the encounter'}` : `Fell to ${metadata.enemyName || 'the encounter'}`}</strong><b>{victory ? `+${gold} GOLD · +${xp} XP` : goldLost > 0 ? `−${goldLost} GOLD` : 'NO REWARD'}</b></div>}
      {revealFinal ? <>
        <div className="stream-card-facts" data-testid="hunt-final-facts"><span>HP <strong>{metadata.remainingHp ?? 0}/{metadata.maxHp ?? 0}</strong></span><span>Turns <strong>{metadata.battleTurnCount ?? metadata.battle?.turns?.length ?? 0}</strong></span><span>Enemy <strong>{metadata.enemyName || 'Unknown'}</strong></span></div>
        {loadout.length ? <div className="stream-loadout"><span className="shell-kicker">LOADOUT USED</span><div>{loadout.map((item) => <span key={item.id || item.name}>{item.name}<small>{item.slot || 'gear'}</small></span>)}</div></div> : null}
        {metadata.itemName ? <div className="stream-loot-line"><span>LOOT</span><strong>{metadata.itemName}</strong><small>{metadata.itemRarity || 'equipment'}</small></div> : null}
      </> : <p className="stream-card-detail" data-testid="hunt-replay-pending">Rewards and final HP appear when the shared replay completes.</p>}
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
      detail: round.status === 'active' ? `Player ${round.playerScore ?? 0} · Dealer ${round.dealerScore ?? 0}+` : `Player ${round.playerScore ?? 0} · Dealer ${round.dealerScore ?? 0}`,
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
    detail: entry.eventType === 'CoinflipPlayed' ? `Called ${result.choice || '—'} · landed ${result.result || '—'}` : (result.reels || []).join(' · '),
    carriedGold: Number(metadata.carriedGold || 0),
  };
}

function GamblingSharedCard({ entry, viewerId, onCommand, busy, latestBlackjack }) {
  if (entry.eventType === 'BlackjackPlayed' && latestBlackjack && latestBlackjack !== entry.id) return null;
  if (entry.eventType === 'BlackjackPlayed') {
    const metadata = entry.metadata || {};
    return <RichCard kind="gambling" kicker={sharedKicker(entry, viewerId, 'blackjack')} title="Blackjack" subtitle="One public table for the whole thread. Only the hand owner can act." className={`stream-shared-card ${isOwner(entry, viewerId) ? 'is-owner' : 'is-observer'}`} testId="stream-gambling-rich-card"><BlackjackSurface state={{ round: metadata.round, carriedGold: metadata.carriedGold }} actorName={actorLabel(entry)} canAct={isOwner(entry, viewerId)} onAction={onCommand} busy={busy} testIdPrefix="shared-blackjack" /></RichCard>;
  }
  const projected = gamblingProjection(entry);
  if (!projected) return null;
  const tone = projected.delta > 0 ? 'is-win' : projected.delta < 0 ? 'is-loss' : 'is-push';
  const deltaText = projected.delta > 0 ? `+${projected.delta} GOLD` : projected.delta < 0 ? `−${Math.abs(projected.delta)} GOLD` : '±0 GOLD';
  return <RichCard kind="gambling" kicker={sharedKicker(entry, viewerId, projected.game.toLowerCase())} title={projected.game} subtitle="This wager and result are visible to everyone in the thread." className={`stream-shared-card ${isOwner(entry, viewerId) ? 'is-owner' : 'is-observer'}`} testId="stream-gambling-rich-card"><div className={`stream-outcome-banner ${tone}`}><span>{String(projected.outcome).toUpperCase()}</span><strong>{projected.delta > 0 ? `${actorLabel(entry)} won` : projected.delta < 0 ? `${actorLabel(entry)} lost` : 'Push'}</strong><b>{deltaText}</b></div><div className="stream-card-facts"><span>Wager <strong>{projected.wager} Gold</strong></span><span>Payout <strong>{projected.payout} Gold</strong></span><span>Carried <strong>{projected.carriedGold} Gold</strong></span></div><p className="stream-card-detail">{projected.detail}</p></RichCard>;
}

function ItemTile({ item, equipped = false, comparison = null, assets, owner = false, onRequest, busy = false, offer = false, tooltipPrefix = 'snapshot' }) {
  const [open, setOpen] = useState(false);
  const asset = resolveShellAsset(item, assets, ['item', 'icon']);
  const id = `stream-item-tooltip-${String(tooltipPrefix)}-${item.id || item.sku}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const rarity = item.rarity || item.item?.rarity || 'common';
  const source = item.item || item;
  const itemName = item.name || source.name || 'Item';
  const slot = item.slot || source.slot || 'Equipment';
  const attack = Number(item.attackBonus ?? source.attackBonus ?? 0) || 0;
  const defense = Number(item.defenseBonus ?? source.defenseBonus ?? 0) || 0;
  const effect = source.effect?.description || source.effect?.name || null;
  const stats = `+${attack} Attack · +${defense} Defense`;
  return <article className={`stream-item-tile stream-item-tile--${rarity}${open ? ' is-open' : ''}`} data-testid={offer ? 'stream-shop-item' : 'stream-inventory-item'} data-item-id={item.id || item.sku}><button type="button" className="stream-item-tile__button" aria-label={`Inspect ${itemName}`} aria-describedby={id} aria-controls={id} aria-expanded={open} onClick={() => setOpen((current) => !current)}>{asset ? <img className="stream-item-tile__asset" src={asset.src} alt="" data-visual-asset-id={asset.id} /> : <span className="stream-item-tile__asset stream-item-tile__asset--fallback" aria-hidden="true">✦</span>}<span className="stream-item-tile__name">{itemName}</span><span className={`rarity-chip rarity-chip--${rarity}`}>{rarity}</span>{equipped ? <span className="shell-equipped-badge">EQUIPPED</span> : null}{item.cost != null ? <span className="stream-item-tile__cost">{item.cost} Gold</span> : null}</button><div className="stream-item-tooltip" id={id} role="tooltip"><strong>{itemName}</strong><span className="stream-item-tooltip__meta">{rarity} · {slot}{equipped ? ' · Equipped' : ''}</span><span>{stats}</span>{comparison ? <span>Compared with {comparison}</span> : null}{effect ? <span>Effect · {effect}</span> : null}{item.cost != null ? <span>{item.affordable ? 'Affordable' : 'Need more Gold'}</span> : null}</div>{owner && open && !offer ? <div className="stream-item-tile__actions">{equipped ? <PanelButton disabled>Equipped</PanelButton> : <PanelButton primary disabled={busy} onClick={() => onRequest(`equip ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/equip`, { method: 'POST' })}>Equip</PanelButton>}<PanelButton disabled={busy} onClick={() => onRequest(`upgrade ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/upgrade`, { method: 'POST' })}>Upgrade</PanelButton>{equipped ? null : <PanelButton danger disabled={busy} onClick={() => onRequest(`sell ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/salvage`, { method: 'POST' })}>Sell</PanelButton>}</div> : null}{owner && open && offer ? <div className="stream-item-tile__actions"><PanelButton primary disabled={busy || !item.available || !item.affordable} onClick={() => onRequest(`buy ${item.name}`, `/api/shop/purchases/${encodeURIComponent(item.sku)}`, { method: 'POST' })}>{item.affordable ? 'Buy' : 'Need Gold'}</PanelButton></div> : null}</article>;
}

function InventorySharedCard({ entry, viewerId, assets, onRequest, busy }) {
  const metadata = entry.metadata || {};
  const character = metadata.character || {};
  const equipment = metadata.equipment || {};
  const items = Array.isArray(metadata.inventory) ? metadata.inventory : [];
  const slots = ['weapon', 'head', 'chest', 'boots', 'accessory'];
  const owner = isOwner(entry, viewerId);
  return <RichCard kind="inventory" kicker={sharedKicker(entry, viewerId, 'inventory')} title="Inventory" subtitle={`${items.length} item${items.length === 1 ? '' : 's'} · ${Number(character.gold || 0)} Gold · shared snapshot`} className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-inventory-rich-card"><div className="shell-stat-grid shell-stat-grid--five">{slots.map((slot) => <div className="shell-slot" key={slot}><span>{slot}</span><strong>{equipment[slot]?.name || 'Empty'}</strong></div>)}</div><div className="stream-card-facts"><span>HP <strong>{character.currentHealth ?? 0}/{character.maxHealth ?? 1}</strong></span><span>Potions <strong>{character.healthPotions ?? 0}</strong></span><span>Gold <strong>{character.gold ?? 0}</strong></span></div>{items.length ? <div className="stream-item-grid">{items.map((item) => {
    const equipped = Object.values(equipment).some((candidate) => candidate?.id === item.id);
    const equippedItem = item.slot ? equipment[item.slot] : null;
    const equippedAttack = Number(equippedItem?.attackBonus || 0);
    const equippedDefense = Number(equippedItem?.defenseBonus || 0);
    const itemAttack = Number(item.attackBonus || item.item?.attackBonus || 0);
    const itemDefense = Number(item.defenseBonus || item.item?.defenseBonus || 0);
    const attackDelta = itemAttack - equippedAttack;
    const defenseDelta = itemDefense - equippedDefense;
    const comparison = equippedItem && !equipped ? `${equippedItem.name}: ${attackDelta >= 0 ? '+' : ''}${attackDelta} Attack · ${defenseDelta >= 0 ? '+' : ''}${defenseDelta} Defense` : null;
    return <ItemTile key={item.id} item={item} equipped={equipped} comparison={comparison} assets={assets} owner={owner} onRequest={onRequest} busy={busy} tooltipPrefix={entry.id || 'inventory'} />;
  })}</div> : <p className="shell-muted-copy">No Equipment in this snapshot.</p>}{owner ? <div className="stream-shared-actions"><PanelButton primary disabled={busy || !Number(character.healthPotions) || Number(character.currentHealth) >= Number(character.maxHealth)} onClick={() => onRequest('heal', '/api/recovery/potion', { method: 'POST' })}>Heal · {character.healthPotions ?? 0} left</PanelButton></div> : <p className="stream-card-detail">{actorLabel(entry)} controls this inventory. Other Weavers can inspect the same snapshot.</p>}</RichCard>;
}

function StatusSharedCard({ entry, viewerId }) {
  const metadata = entry.metadata || {};
  const character = metadata.character || {};
  const equipment = metadata.equipment || {};
  const stats = character.stats || {};
  const owner = isOwner(entry, viewerId);
  return <RichCard kind="profile" kicker={sharedKicker(entry, viewerId, 'status')} title={`${character.displayName || actorLabel(entry)} · Status`} subtitle="A public snapshot from the same authoritative character state." className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-player-status"><div className="stream-status-hero"><span className="shell-profile-avatar">{String(character.displayName || actorLabel(entry) || 'W').slice(0, 1)}</span><div><span className="shell-kicker">LEVEL {character.level || 1}</span><strong>{character.currentHealth ?? 0}/{character.maxHealth ?? 1} HP</strong><small>{character.experience ?? 0} XP · {character.gold ?? 0} Gold</small></div></div><div className="shell-stat-grid"><div className="shell-stat"><span>Attack</span><strong>{stats.attack ?? 0}</strong></div><div className="shell-stat"><span>Defense</span><strong>{stats.defense ?? 0}</strong></div><div className="shell-stat"><span>Speed</span><strong>{stats.speed ?? 0}</strong></div><div className="shell-stat"><span>Crit</span><strong>{stats.critChancePercent ?? 0}%</strong></div></div><div className="stream-status-equipment">{['weapon', 'head', 'chest', 'boots', 'accessory'].map((slot) => <div key={slot}><span>{slot}</span><strong>{equipment[slot]?.name || 'Empty'}</strong></div>)}</div>{metadata.activeBuffs?.length ? <div className="stream-card-detail"><strong>Active buffs</strong> · {metadata.activeBuffs.map((buff) => buff.name).join(' · ')}</div> : null}</RichCard>;
}

function ShopSharedCard({ entry, viewerId, assets, onRequest, onCommand, busy }) {
  const metadata = entry.metadata || {};
  const owner = isOwner(entry, viewerId);
  return <ShopSurface shop={{ vendor: metadata.vendor, currency: metadata.currency, available: metadata.available, unavailableReason: metadata.unavailableReason, offers: metadata.offers }} assets={assets} owner={owner} actorName={actorLabel(entry)} onRequest={onRequest} onCommand={onCommand} kicker={sharedKicker(entry, viewerId, 'shop')} className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-shop-rich-card" />;
}

function DungeonSharedCard({ entry, viewerId, assets, onRequest, busy, dashboard, interactive = true }) {
  const metadata = entry.metadata || {};
  const eventType = entry.eventType;
  const replay = sharedBattleReplay(entry);
  const owner = isOwner(entry, viewerId);
  const [replayComplete, setReplayComplete] = useState(false);
  const replayIdentity = replay?.battleId || replay?.runId || entry.id;
  useEffect(() => setReplayComplete(false), [replayIdentity]);
  if (replay) {
    const roomClear = replay.status === 'room_clear' && replay.finalPhase === 'between_encounter';
    const canAct = owner && interactive && roomClear && replayComplete;
    const runId = metadata.runId || entry.runId;
    const potions = Number(dashboard?.character?.healthPotions || 0);
    const unlockedArea = replay.areaUnlocks?.find((candidate) => candidate.playerId === entry.actorPlayerId)?.areaNumber || replay.areaUnlocks?.[0]?.areaNumber || null;
    const victoryDetail = unlockedArea ? `Clear reward secured · Area ${unlockedArea} unlocked.` : 'Clear reward secured.';
    const enemyLabel = (replay.enemies || [replay.enemy]).filter(Boolean).map((enemy) => enemy.name || 'Enemy').join(' + ') || 'Room';
    return <RichCard kind="dungeon" kicker={sharedKicker(entry, viewerId, 'dungeon')} title="Dungeon" subtitle="The room resolved on the server. The same battle surface is visible to every Weaver." className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-dungeon-rich-card"><SharedBattleSurface replay={replay} createdAt={entry.createdAt} metadata={metadata} assets={assets} onComplete={() => setReplayComplete(true)} finalTitle={replay.status === 'victory' ? 'Dungeon cleared' : replay.status === 'defeat' ? 'The party fell' : `${enemyLabel} cleared`} finalDetail={replay.status === 'victory' ? victoryDetail : replay.status === 'defeat' ? 'Carried Gold is handled by the server.' : 'Choose the next room action.'} />{canAct ? <div className="stream-shared-actions"><PanelButton primary disabled={busy} onClick={() => onRequest('continue dungeon', `/api/runs/${encodeURIComponent(runId)}/continue`, { method: 'POST', headers: { 'Idempotency-Key': commandKey('stream-continue') } })} testId="stream-run-continue">Continue</PanelButton><PanelButton disabled={busy || potions <= 0} onClick={() => onRequest('use Health Potion in Dungeon', `/api/runs/${encodeURIComponent(runId)}/potion`, { method: 'POST', headers: { 'Idempotency-Key': commandKey('stream-potion') } })} testId="stream-run-potion">Use Potion · {potions} left</PanelButton><PanelButton danger disabled={busy} onClick={() => onRequest('leave dungeon', `/api/runs/${encodeURIComponent(runId)}/retreat`, { method: 'POST', headers: { 'Idempotency-Key': commandKey('stream-retreat') } })} testId="stream-run-retreat">Leave Dungeon</PanelButton></div> : null}</RichCard>;
  }

  const defeated = metadata.defeatedEnemyName || metadata.defeatedEnemyId || null;
  const nextName = metadata.nextEnemyName || metadata.enemyName || null;
  const nextHp = metadata.nextEnemyHp ?? metadata.enemyHp ?? null;
  const nextMaxHp = metadata.nextEnemyMaxHp ?? metadata.enemyMaxHp ?? null;
  const actorHp = metadata.actorHp === null || metadata.actorHp === undefined ? null : `${metadata.actorHp}/${metadata.actorMaxHp} HP`;
  const tone = eventType === 'DungeonFailed' ? 'is-loss' : eventType === 'DungeonRetreated' ? 'is-push' : 'is-neutral';
  const label = eventType === 'DungeonRetreated' ? 'LEFT SAFELY' : eventType === 'DungeonFailed' ? 'DEFEAT' : eventType === 'DungeonStarted' ? 'ENTERED' : eventType === 'DungeonEncounterContinued' ? 'CONTINUE' : 'DUNGEON';
  const title = eventType === 'DungeonRetreated' ? 'Dungeon run ended before the next room' : eventType === 'DungeonFailed' ? 'The party fell' : defeated ? `${actorLabel(entry)} defeated ${defeated}` : `${actorLabel(entry)} updated the Dungeon`;
  const detail = eventType === 'DungeonRetreated' ? 'Carried Gold is safe. The clear reward was not secured.' : eventType === 'DungeonFailed' ? (metadata.goldLost > 0 ? `−${metadata.goldLost} carried Gold · Bank safe.` : 'Carried Gold loss: 0 · Bank safe.') : nextName ? `${nextName} · ${nextHp}/${nextMaxHp} HP` : 'The shared Dungeon state was updated.';
  return <RichCard kind="dungeon" kicker={sharedKicker(entry, viewerId, 'dungeon')} title="Dungeon" subtitle="A shared receipt from the authoritative Dungeon state." className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-dungeon-rich-card"><div className={`stream-outcome-banner ${tone}`}><span>{label}</span><strong>{title}</strong><b>{detail}</b></div><div className="stream-card-facts">{actorHp ? <span>Player HP <strong>{actorHp}</strong></span> : null}{nextName ? <span>Enemy <strong>{nextName}{nextHp !== null ? ` · ${nextHp}/${nextMaxHp}` : ''}</strong></span> : null}{metadata.phase ? <span>Phase <strong>{String(metadata.phase).replaceAll('_', ' ')}</strong></span> : null}</div></RichCard>;
}

function AdventureSharedCard({ entry, viewerId }) {
  const metadata = entry.metadata || {};
  const victory = Boolean(metadata.victory);
  const gold = Number(metadata.gold || 0);
  const xp = Number(metadata.experienceGained ?? metadata.xp ?? 0);
  const loss = Number(metadata.goldLost || 0);
  return <RichCard kind="adventure" kicker={sharedKicker(entry, viewerId, 'adventure')} title="Adventure" subtitle="An Area encounter resolved by the server and shared with the thread." className={`stream-shared-card ${isOwner(entry, viewerId) ? 'is-owner' : 'is-observer'}`} testId="stream-adventure-rich-card"><div className={`stream-outcome-banner ${victory ? 'is-win' : 'is-loss'}`}><span>{victory ? 'VICTORY' : 'DEFEAT'}</span><strong>{victory ? `${actorLabel(entry)} defeated ${metadata.enemyName || 'the encounter'}` : `${actorLabel(entry)} fell to ${metadata.enemyName || 'the encounter'}`}</strong><b>{victory ? `+${gold} GOLD · +${xp} XP` : loss > 0 ? `−${loss} GOLD · BANK SAFE` : 'NO REWARD'}</b></div><div className="stream-card-facts"><span>HP <strong>{metadata.remainingHp ?? 0}/{metadata.maxHp ?? 0}</strong></span><span>Area <strong>{metadata.areaName || `Area ${metadata.areaNumber || 1}`}</strong></span>{metadata.itemName ? <span>Loot <strong>{metadata.itemName}</strong></span> : null}</div>{metadata.storyEvent?.text ? <p className="stream-card-detail">{metadata.storyEvent.text}</p> : null}</RichCard>;
}

const SHARED_RICH_EVENT_TYPES = new Set(['HuntResolved', 'AdventureResolved', 'BlackjackPlayed', 'CoinflipPlayed', 'SlotsPlayed', 'InventoryViewed', 'StatusViewed', 'ShopViewed', 'DungeonStarted', 'CombatActionResolved', 'DungeonEncounterContinued', 'DungeonPotionUsed', 'DungeonRetreated', 'DungeonFailed']);

function SharedEntryCard({ entry, viewerId, assets, onRequest, onCommand, busy, latestBlackjack, dashboard, interactiveDungeon = true }) {
  if (entry.eventType === 'HuntResolved') return <HuntSharedCard entry={entry} viewerId={viewerId} assets={assets} />;
  if (entry.eventType === 'AdventureResolved') return <AdventureSharedCard entry={entry} viewerId={viewerId} />;
  if (['BlackjackPlayed', 'CoinflipPlayed', 'SlotsPlayed'].includes(entry.eventType)) return <GamblingSharedCard entry={entry} viewerId={viewerId} onCommand={onCommand} busy={busy} latestBlackjack={latestBlackjack} />;
  if (entry.eventType === 'InventoryViewed') return <InventorySharedCard entry={entry} viewerId={viewerId} assets={assets} onRequest={onRequest} busy={busy} />;
  if (entry.eventType === 'StatusViewed') return <StatusSharedCard entry={entry} viewerId={viewerId} />;
  if (entry.eventType === 'ShopViewed') return <ShopSharedCard entry={entry} viewerId={viewerId} assets={assets} onRequest={onRequest} onCommand={onCommand} busy={busy} />;
  if (['DungeonStarted', 'CombatActionResolved', 'DungeonEncounterContinued', 'DungeonPotionUsed', 'DungeonRetreated', 'DungeonFailed'].includes(entry.eventType)) return <DungeonSharedCard entry={entry} viewerId={viewerId} assets={assets} onRequest={onRequest} busy={busy} dashboard={dashboard} interactive={interactiveDungeon} />;
  return null;
}

export function AdventureStream({ entries = [], ephemeralCard = null, onLoadMore = null, hasMore = false, connected = false, viewerId = null, assets = [], onRequest = () => {}, onCommand = () => {}, busy = false, dashboard = null }) {
  const logRef = useRef(null);
  const nearBottomRef = useRef(true);
  const latestBlackjack = useMemo(() => {
    const latest = new Map();
    for (const entry of entries) {
      if (entry.eventType !== 'BlackjackPlayed') continue;
      const roundId = entry.metadata?.round?.id;
      if (roundId) latest.set(roundId, entry.id);
    }
    return latest;
  }, [entries]);
  const latestDungeonEntryId = useMemo(() => {
    const dungeonEntries = entries.filter((entry) => ['DungeonStarted', 'CombatActionResolved', 'DungeonEncounterContinued', 'DungeonPotionUsed', 'DungeonRetreated', 'DungeonFailed'].includes(entry.eventType));
    return dungeonEntries[dungeonEntries.length - 1]?.id || null;
  }, [entries]);
  const onScroll = useCallback((event) => {
    const element = event.currentTarget;
    nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
  }, []);

  useEffect(() => {
    const element = logRef.current;
    if (!element || !nearBottomRef.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [entries.length, ephemeralCard]);

  return <section className="game-shell-stream" aria-labelledby="adventure-stream-title"><header className="game-shell-stream__header"><div><span className="shell-kicker">ADVENTURE STREAM</span><h1 id="adventure-stream-title">The shared thread</h1></div><span className={`stream-live-pill${connected ? ' is-live' : ''}`} data-testid="stream-connection"><i /> {connected ? 'LIVE' : 'SYNC'}</span></header><div ref={logRef} className="game-shell-stream__log" data-testid="adventure-stream-log" role="log" aria-live="polite" onScroll={onScroll}>{hasMore && onLoadMore ? <button className="stream-load-more" type="button" onClick={onLoadMore}>Load earlier receipts</button> : null}{entries.length ? entries.map((entry) => {
    const kind = entryKind(entry);
    const roundId = entry.eventType === 'BlackjackPlayed' ? entry.metadata?.round?.id : null;
    const isLatestBlackjack = !roundId || latestBlackjack.get(roundId) === entry.id;
    const sharedCard = kind === 'system' && SHARED_RICH_EVENT_TYPES.has(entry.eventType) && (entry.eventType !== 'BlackjackPlayed' || isLatestBlackjack)
      ? <SharedEntryCard entry={entry} viewerId={viewerId} assets={assets} onRequest={onRequest} onCommand={onCommand} busy={busy} latestBlackjack={roundId ? latestBlackjack.get(roundId) : null} dashboard={dashboard} interactiveDungeon={entry.id === latestDungeonEntryId} />
      : null;
    return <article className={`stream-entry stream-${kind}-entry${sharedCard ? ' stream-entry--rich' : ''}`} key={entryKey(entry)} data-entry-id={entry.id || undefined} data-testid={`stream-${kind}-entry`}><span className={`stream-entry__avatar stream-entry__avatar--${kind}`} aria-hidden="true">{String(sharedCard ? actorLabel(entry) : entry.actorName || (kind === 'chat' ? 'W' : '✦')).slice(0, 1)}</span><div className="stream-entry__content"><div className="stream-entry__meta"><strong>{sharedCard ? actorLabel(entry) : entry.actorName || 'THREADBOUND'}</strong><time dateTime={entry.createdAt || undefined}>{formatEntryTime(entry.createdAt)}</time></div>{sharedCard || <p>{entryBody(entry)}</p>}</div></article>;
  }) : <div className="stream-empty"><span aria-hidden="true">✦</span><p>Your first result will land here.</p></div>}{ephemeralCard ? <div className="stream-active-card">{ephemeralCard}</div> : null}</div></section>;
}
