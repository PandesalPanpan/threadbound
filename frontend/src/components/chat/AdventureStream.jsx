import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commandKey } from '../../api/client.js';
import { entryBody, entryKey, entryKind, formatEntryTime, resolveShellAsset } from '../../shell/presentation.js';
import { PanelButton, RichCard } from '../common/RichCard.jsx';
import { BlackjackSurface } from '../games/BlackjackSurface.jsx';
import { SharedBattleSurface } from './SharedBattleSurface.jsx';
import { ShopSurface } from './ShopSurface.jsx';

const EQUIPMENT_SLOTS = Object.freeze(['weapon', 'helmet', 'armor', 'boots', 'accessory']);
const EQUIPMENT_SLOT_LABELS = Object.freeze({ weapon: 'Weapon', helmet: 'Helmet', armor: 'Armor', boots: 'Boots', accessory: 'Accessory' });
const ITEM_STAT_FIELDS = Object.freeze([
  ['attackBonus', 'Attack', 'number'],
  ['defenseBonus', 'Defense', 'number'],
  ['maxHpBonus', 'Max HP', 'number'],
  ['speedBonus', 'Speed', 'number'],
  ['critChanceBonus', 'Crit', 'percent'],
]);

function itemStatValue(item, key) {
  const source = item?.item || item || {};
  const stats = item?.itemStats || item?.stats || source?.itemStats || source?.stats || {};
  const aliases = key === 'maxHpBonus' ? ['maxHpBonus', 'maxHealthBonus'] : [key];
  for (const alias of aliases) {
    const value = item?.[alias] ?? item?.itemStats?.[alias] ?? item?.stats?.[alias] ?? source?.[alias] ?? source?.stats?.[alias] ?? stats?.[alias];
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function formatItemStat(value, format) {
  if (!Number.isFinite(Number(value)) || Number(value) === 0) return null;
  const amount = Number(value);
  if (format === 'percent') {
    const percent = Math.round(amount * 1000) / 10;
    return `+${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
  }
  return `${amount > 0 ? '+' : ''}${amount}`;
}

function itemStatSummary(item) {
  return ITEM_STAT_FIELDS.map(([key, label, format]) => {
    const value = formatItemStat(itemStatValue(item, key), format);
    return value ? `${value} ${label}` : null;
  }).filter(Boolean).join(' · ');
}

function EquipmentSlot({ slot, item, assets }) {
  const asset = item ? resolveShellAsset(item, assets, ['item', 'icon']) : null;
  return <div className={`shell-slot stream-equipment-slot${item ? ' has-item' : ''}`} data-testid={`equipment-slot-${slot}`}><span>{EQUIPMENT_SLOT_LABELS[slot]}</span>{item ? <>{asset ? <img src={asset.src} alt="" data-visual-asset-id={asset.id} /> : null}<strong>{item.name || 'Equipment'}</strong><small>{itemStatSummary(item) || 'No listed bonuses'}</small></> : <strong>Empty</strong>}</div>;
}

function actorLabel(entry) {
  const metadata = entry?.metadata || {};
  if (entry?.eventType === 'NpcInteracted') return entry.actorName || metadata.npcName || 'Town NPC';
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
  if (entry?.eventType === 'DuelResolved' && metadata.battleReplay) {
    return {
      ...metadata.battleReplay,
      presentationKind: 'duel',
      battleId: metadata.duelId || entry.id || null,
    };
  }
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
  const growth = metadata.leveledUp ? ` · Level ${metadata.level} · Max HP +${Number(metadata.maxHealthIncrease || 0)}` : '';
  if (victory) return `+${gold} Gold · +${xp} XP${growth}${metadata.itemName ? ` · Loot: ${metadata.itemName}` : ''}`;
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
  const itemAsset = metadata.itemName ? resolveShellAsset({ id: metadata.itemId, name: metadata.itemName, visualAssetId: metadata.itemVisualAssetId }, assets, ['item', 'icon']) : null;
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
        {metadata.leveledUp ? <div className="stream-card-facts" data-testid="hunt-level-up"><span>Level <strong>+{metadata.levelsGained || 1} · {metadata.level}</strong></span>{Number(metadata.maxHealthIncrease) > 0 ? <span>Max HP <strong>+{metadata.maxHealthIncrease} · {metadata.maxHp}</strong></span> : null}</div> : null}
        {loadout.length ? <div className="stream-loadout"><span className="shell-kicker">LOADOUT USED</span><div>{loadout.map((item) => { const asset = resolveShellAsset(item, assets, ['item', 'icon']); return <span key={item.id || item.name}>{asset ? <img src={asset.src} alt="" data-visual-asset-id={asset.id} /> : null}<strong>{item.name}</strong><small>{EQUIPMENT_SLOT_LABELS[item.slot] || item.slot || 'Equipment'}</small></span>; })}</div></div> : null}
        {metadata.itemName ? <div className="stream-loot-line" data-testid="hunt-loot"><span>LOOT</span>{itemAsset ? <img src={itemAsset.src} alt="" data-visual-asset-id={itemAsset.id} /> : null}<strong>{metadata.itemName}</strong><small>{metadata.itemRarity || 'equipment'}{metadata.itemSlot ? ` · ${EQUIPMENT_SLOT_LABELS[metadata.itemSlot] || metadata.itemSlot}` : ''}{itemStatSummary({ itemStats: metadata.itemStats }) ? ` · ${itemStatSummary({ itemStats: metadata.itemStats })}` : ''}</small></div> : null}
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
  const slot = item.itemSlot || item.slot || source.slot || 'Equipment';
  const effect = source.effect?.description || source.effect?.name || null;
  const stats = itemStatSummary(item) || 'No listed bonuses';
  return <article className={`stream-item-tile stream-item-tile--${rarity}${open ? ' is-open' : ''}`} data-testid={offer ? 'stream-shop-item' : 'stream-inventory-item'} data-item-id={item.id || item.sku}><button type="button" className="stream-item-tile__button" aria-label={`Inspect ${itemName}`} aria-describedby={id} aria-controls={id} aria-expanded={open} onClick={() => setOpen((current) => !current)}>{asset ? <img className="stream-item-tile__asset" src={asset.src} alt="" data-visual-asset-id={asset.id} /> : <span className="stream-item-tile__asset stream-item-tile__asset--fallback" aria-hidden="true">✦</span>}<span className="stream-item-tile__name">{itemName}</span><span className={`rarity-chip rarity-chip--${rarity}`}>{rarity}</span>{equipped ? <span className="shell-equipped-badge">EQUIPPED</span> : null}{item.cost != null ? <span className="stream-item-tile__cost">{item.cost} Gold</span> : null}</button><div className="stream-item-tooltip" id={id} role="tooltip"><strong>{itemName}</strong><span className="stream-item-tooltip__meta">{rarity} · {EQUIPMENT_SLOT_LABELS[slot] || slot}{equipped ? ' · Equipped' : ''}</span><span>{stats}</span>{comparison ? <span>Compared with {comparison}</span> : null}{effect ? <span>Effect · {effect}</span> : null}{item.cost != null ? <span>{item.affordable ? 'Affordable' : 'Need more Gold'}</span> : null}</div>{owner && open && !offer ? <div className="stream-item-tile__actions">{equipped ? <PanelButton disabled>Equipped</PanelButton> : <PanelButton primary disabled={busy} onClick={() => onRequest(`equip ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/equip`, { method: 'POST' })}>Equip</PanelButton>}<PanelButton disabled={busy} onClick={() => onRequest(`upgrade ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/upgrade`, { method: 'POST' })}>Upgrade</PanelButton>{equipped ? null : <PanelButton danger disabled={busy} onClick={() => onRequest(`sell ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/salvage`, { method: 'POST' })}>Sell</PanelButton>}</div> : null}{owner && open && offer ? <div className="stream-item-tile__actions"><PanelButton primary disabled={busy || !item.available || !item.affordable} onClick={() => onRequest(`buy ${item.name}`, `/api/shop/purchases/${encodeURIComponent(item.sku)}`, { method: 'POST' })}>{item.affordable ? 'Buy' : 'Need Gold'}</PanelButton></div> : null}</article>;
}

function InventorySharedCard({ entry, viewerId, assets, onRequest, busy }) {
  const metadata = entry.metadata || {};
  const character = metadata.character || {};
  const equipment = metadata.equipment || {};
  const items = Array.isArray(metadata.inventory) ? metadata.inventory : [];
  const potions = Array.isArray(metadata.potions) ? metadata.potions : [];
  const availablePotions = potions.filter((potion) => potion.unlocked !== false && Number(potion.quantity || 0) > 0);
  const owner = isOwner(entry, viewerId);
  return <RichCard kind="inventory" kicker={sharedKicker(entry, viewerId, 'inventory')} title="Inventory" subtitle={`${items.length} item${items.length === 1 ? '' : 's'} · ${Number(character.gold || 0)} Gold · shared snapshot`} className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-inventory-rich-card"><div className="stream-equipment-grid">{EQUIPMENT_SLOTS.map((slot) => <EquipmentSlot key={slot} slot={slot} item={equipment[slot] || null} assets={assets} />)}</div><div className="stream-card-facts"><span>HP <strong>{character.currentHealth ?? 0}/{character.maxHealth ?? 1}</strong></span><span>Potions <strong>{potions.reduce((sum, potion) => sum + Number(potion.quantity || 0), 0) || character.healthPotions || 0}</strong></span><span>Gold <strong>{character.gold ?? 0}</strong></span></div>{potions.length ? <div className="stream-potion-list" aria-label="Healing supplies">{potions.map((potion) => <div className={`stream-potion-row${potion.unlocked === false ? ' is-locked' : ''}`} key={potion.id}><span>{potion.name}</span><strong>×{potion.quantity || 0}</strong><small>{potion.unlocked === false ? `Area ${potion.requiredArea}+` : `+${potion.heal} HP`}</small></div>)}</div> : null}{items.length ? <div className="stream-item-grid">{items.map((item) => {
    const equipped = Object.values(equipment).some((candidate) => candidate?.id === item.id);
    const equippedItem = item.slot ? equipment[item.slot] : null;
    const comparison = equippedItem && !equipped ? ITEM_STAT_FIELDS.map(([key, label, format]) => {
      const difference = itemStatValue(item, key) - itemStatValue(equippedItem, key);
      const delta = formatItemStat(difference, format);
      return delta ? `${delta} ${label}` : null;
    }).filter(Boolean).join(' · ') || 'Same listed stats' : null;
    return <ItemTile key={item.id} item={item} equipped={equipped} comparison={comparison} assets={assets} owner={owner} onRequest={onRequest} busy={busy} tooltipPrefix={entry.id || 'inventory'} />;
  })}</div> : <p className="shell-muted-copy">No Equipment in this snapshot.</p>}{owner ? <div className="stream-shared-actions"><PanelButton primary disabled={busy || !availablePotions.length || Number(character.currentHealth) >= Number(character.maxHealth)} onClick={() => onRequest('heal', '/api/recovery/potion', { method: 'POST' })}>Heal · {availablePotions[0]?.shortName || 'Potion'}</PanelButton></div> : <p className="stream-card-detail">{actorLabel(entry)} controls this inventory. Other Weavers can inspect the same snapshot.</p>}</RichCard>;
}

function StatusSharedCard({ entry, viewerId, assets }) {
  const metadata = entry.metadata || {};
  const character = metadata.character || {};
  const equipment = metadata.equipment || {};
  const stats = character.stats || {};
  const signatureSkill = character.signatureSkill || null;
  const owner = isOwner(entry, viewerId);
  return <RichCard kind="profile" kicker={sharedKicker(entry, viewerId, 'status')} title={`${character.displayName || actorLabel(entry)} · Status`} subtitle="A public snapshot from the same authoritative character state." className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-player-status">
    <div className="stream-status-hero"><span className="shell-profile-avatar">{String(character.displayName || actorLabel(entry) || 'W').slice(0, 1)}</span><div><span className="shell-kicker">LEVEL {character.level || 1}</span><strong>{character.currentHealth ?? 0}/{character.maxHealth ?? 1} HP</strong><small>{character.experience ?? 0} XP · {character.gold ?? 0} Gold</small></div></div>
    <div className="shell-stat-grid shell-stat-grid--five"><div className="shell-stat"><span>Attack</span><strong>{stats.attack ?? 0}</strong></div><div className="shell-stat"><span>Defense</span><strong>{stats.defense ?? 0}</strong></div><div className="shell-stat"><span>Max HP</span><strong>{character.maxHealth ?? 1}</strong></div><div className="shell-stat"><span>Speed</span><strong>{stats.speed ?? 0}</strong></div><div className="shell-stat"><span>Crit</span><strong>{stats.critChancePercent ?? 0}%</strong></div></div>
    {signatureSkill ? <div className="stream-card-detail" data-testid="status-signature-skill"><strong>Signature Skill · {signatureSkill.name}</strong><span> · {signatureSkill.manaCost} Mana · {signatureSkill.description}</span></div> : null}
    <div className="stream-equipment-grid stream-equipment-grid--compact">{EQUIPMENT_SLOTS.map((slot) => <EquipmentSlot key={slot} slot={slot} item={equipment[slot] || null} assets={assets} />)}</div>
    {metadata.activeBuffs?.length ? <div className="stream-card-detail"><strong>Active buffs</strong> · {metadata.activeBuffs.map((buff) => buff.name).join(' · ')}</div> : null}
  </RichCard>;
}

function ShopSharedCard({ entry, viewerId, assets, onRequest, onCommand, busy }) {
  const metadata = entry.metadata || {};
  const owner = isOwner(entry, viewerId);
  return <ShopSurface shop={{ vendor: metadata.vendor, currency: metadata.currency, available: metadata.available, unavailableReason: metadata.unavailableReason, offers: metadata.offers }} assets={assets} owner={owner} actorName={actorLabel(entry)} onRequest={onRequest} onCommand={onCommand} kicker={sharedKicker(entry, viewerId, 'shop')} className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-shop-rich-card" />;
}

function DungeonSharedCard({ entry, viewerId, assets, onRequest, busy, dashboard, interactive = true, onReplayComplete }) {
  const metadata = entry.metadata || {};
  const eventType = entry.eventType;
  const replay = sharedBattleReplay(entry);
  const owner = isOwner(entry, viewerId);
  const [completedReplayIds, setCompletedReplayIds] = useState(() => new Set());
  const replayIdentity = replay?.battleId || replay?.runId || entry.id;
  const replayComplete = !replay || completedReplayIds.has(replayIdentity);
  const activeRun = dashboard?.activeRun || null;
  const runId = metadata.runId || entry.runId || replay?.runId;
  const activeRunMatches = Boolean(activeRun?.id && runId && String(activeRun.id) === String(runId));
  const runLeader = Boolean(activeRunMatches && (activeRun?.isLeader ?? String(activeRun?.startedByPlayerId) === String(viewerId)));
  const betweenEncounters = activeRunMatches && activeRun.simpleCombat && activeRun.phase === 'between_encounter';
  const intermissionConsumed = Boolean(betweenEncounters && activeRun.intermissionPotionClaimedWindowId);
  const claimantId = intermissionConsumed ? activeRun.intermissionPotionClaimedByPlayerId : null;
  const claimantName = activeRun?.participants?.find((participant) => participant.playerId === claimantId)?.displayName || null;
  const personalParticipant = activeRun?.participants?.find((participant) => participant.playerId === viewerId) || activeRun?.viewer || null;
  const potionInventory = Array.isArray(dashboard?.character?.potions) ? dashboard.character.potions : [];
  const availablePotions = potionInventory.filter((potion) => potion.unlocked !== false && Number(potion.quantity || 0) > 0);
  const defaultPotion = availablePotions[0] || null;
  const personalHp = Number(personalParticipant?.hp ?? dashboard?.character?.currentHealth ?? 0);
  const personalMaxHp = Number(personalParticipant?.maxHp ?? dashboard?.character?.maxHealth ?? dashboard?.character?.maxHp ?? 0);
  const canHeal = interactive && betweenEncounters && !intermissionConsumed && Boolean(defaultPotion) && personalHp < personalMaxHp;
  const canContinue = runLeader && interactive && betweenEncounters && replayComplete;
  const canRetreat = runLeader && interactive && betweenEncounters && replayComplete;
  const intermissionStatus = betweenEncounters ? <div className="stream-intermission-state" data-testid="intermission-heal-status" aria-live="polite">{intermissionConsumed ? <><strong>Shared intermission Heal used</strong><span>{claimantName || 'A party member'} claimed the party’s one Heal. Continue is a separate action.</span></> : <><strong>One shared intermission Heal available</strong><span>{defaultPotion ? `${personalHp}/${personalMaxHp} HP · your potion will heal only you.` : 'No available Health Potion on this character.'}</span></>}</div> : null;
  const intermissionActions = betweenEncounters && interactive ? <><div className="stream-shared-actions stream-shared-actions--intermission">{runLeader ? <PanelButton primary disabled={busy || !canContinue} onClick={() => onRequest('continue dungeon', `/api/runs/${encodeURIComponent(activeRun.id)}/continue`, { method: 'POST', headers: { 'Idempotency-Key': commandKey('stream-continue') } })} testId="stream-run-continue">Continue</PanelButton> : null}<PanelButton disabled={busy || !canHeal} onClick={() => onRequest(`use ${defaultPotion?.name || 'Health Potion'} in Dungeon`, `/api/runs/${encodeURIComponent(activeRun.id)}/potion`, { method: 'POST', headers: { 'Idempotency-Key': commandKey('stream-potion') }, ...(defaultPotion ? { body: JSON.stringify({ potion: defaultPotion.id }) } : {}) })} testId="stream-run-potion">{intermissionConsumed ? 'Heal · Used' : `Heal · ${defaultPotion?.shortName || defaultPotion?.name || 'Potion'}`}</PanelButton>{runLeader ? <PanelButton danger disabled={busy || !canRetreat} onClick={() => onRequest('leave dungeon', `/api/runs/${encodeURIComponent(activeRun.id)}/retreat`, { method: 'POST', headers: { 'Idempotency-Key': commandKey('stream-retreat') } })} testId="stream-run-retreat">Leave Dungeon</PanelButton> : null}</div>{intermissionStatus}</> : null;
  if (replay) {
    const roomClear = replay.status === 'room_clear' && replay.finalPhase === 'between_encounter';
    const unlockedArea = replay.areaUnlocks?.find((candidate) => candidate.playerId === entry.actorPlayerId)?.areaNumber || replay.areaUnlocks?.[0]?.areaNumber || null;
    const victoryDetail = unlockedArea ? `Clear reward secured · Area ${unlockedArea} unlocked.` : 'Clear reward secured.';
    const enemyLabel = (replay.enemies || [replay.enemy]).filter(Boolean).map((enemy) => enemy.name || 'Enemy').join(' + ') || 'Room';
    const isTerminalReplay = replay.status === 'victory' || replay.status === 'defeat';
    const stateClasses = [replayComplete && 'is-replay-complete', roomClear && 'is-room-clear', betweenEncounters && 'is-intermission', interactive && 'is-interactive'].filter(Boolean).join(' ');
    return <RichCard kind="dungeon" kicker={sharedKicker(entry, viewerId, 'dungeon')} title="Dungeon" subtitle="The room resolved on the server. The same battle surface is visible to every Weaver." className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'} ${stateClasses}`} testId="stream-dungeon-rich-card"><SharedBattleSurface replay={replay} createdAt={entry.createdAt} metadata={metadata} assets={assets} onComplete={() => { setCompletedReplayIds((current) => current.has(replayIdentity) ? current : new Set([...current, replayIdentity])); if (isTerminalReplay) onReplayComplete?.(replayIdentity); }} finalTitle={replay.status === 'victory' ? 'Dungeon cleared' : replay.status === 'defeat' ? 'The party fell' : `${enemyLabel} cleared`} finalDetail={replay.status === 'victory' ? victoryDetail : replay.status === 'defeat' ? 'Carried Gold is handled by the server.' : 'Choose the next room action.'} />{roomClear && replayComplete ? <>{intermissionActions}</> : null}</RichCard>;
  }

  const defeated = metadata.defeatedEnemyName || metadata.defeatedEnemyId || null;
  const nextName = metadata.nextEnemyName || metadata.enemyName || null;
  const nextHp = metadata.nextEnemyHp ?? metadata.enemyHp ?? null;
  const nextMaxHp = metadata.nextEnemyMaxHp ?? metadata.enemyMaxHp ?? null;
  const actorHp = metadata.actorHp === null || metadata.actorHp === undefined ? null : `${metadata.actorHp}/${metadata.actorMaxHp} HP`;
  const isPotionReceipt = eventType === 'DungeonPotionUsed';
  const tone = eventType === 'DungeonFailed' ? 'is-loss' : eventType === 'DungeonRetreated' ? 'is-push' : 'is-neutral';
  const label = isPotionReceipt ? 'INTERMISSION HEAL' : eventType === 'DungeonRetreated' ? 'LEFT SAFELY' : eventType === 'DungeonFailed' ? 'DEFEAT' : eventType === 'DungeonStarted' ? 'ENTERED' : eventType === 'DungeonEncounterContinued' ? 'CONTINUE' : 'DUNGEON';
  const title = isPotionReceipt
    ? `${actorLabel(entry)} used ${metadata.potionName || 'a Health Potion'}`
    : eventType === 'DungeonRetreated' ? 'Dungeon run ended before the next room' : eventType === 'DungeonFailed' ? 'The party fell' : defeated ? `${actorLabel(entry)} defeated ${defeated}` : `${actorLabel(entry)} updated the Dungeon`;
  const detail = isPotionReceipt
    ? `+${Number(metadata.healed || 0)} HP · ${metadata.actorHp}/${metadata.actorMaxHp} HP · Intermission heal used.`
    : eventType === 'DungeonRetreated' ? 'Carried Gold is safe. The clear reward was not secured.' : eventType === 'DungeonFailed' ? (metadata.goldLost > 0 ? `−${metadata.goldLost} carried Gold · Bank safe.` : 'Carried Gold loss: 0 · Bank safe.') : nextName ? `${nextName} · ${nextHp}/${nextMaxHp} HP` : 'The shared Dungeon state was updated.';
  return <RichCard kind="dungeon" kicker={sharedKicker(entry, viewerId, 'dungeon')} title="Dungeon" subtitle="A shared receipt from the authoritative Dungeon state." className={`stream-shared-card ${owner ? 'is-owner' : 'is-observer'}`} testId="stream-dungeon-rich-card"><div className={`stream-outcome-banner ${tone}`} data-testid={isPotionReceipt ? 'dungeon-potion-receipt' : undefined}><span>{label}</span><strong>{title}</strong><b>{detail}</b></div><div className="stream-card-facts">{actorHp ? <span>Player HP <strong>{actorHp}</strong></span> : null}{nextName ? <span>Enemy <strong>{nextName}{nextHp !== null ? ` · ${nextHp}/${nextMaxHp}` : ''}</strong></span> : null}{metadata.phase ? <span>Phase <strong>{String(metadata.phase).replaceAll('_', ' ')}</strong></span> : null}</div>{intermissionActions}</RichCard>;
}

function AdventureSharedCard({ entry, viewerId, assets }) {
  const metadata = entry.metadata || {};
  const victory = Boolean(metadata.victory);
  const gold = Number(metadata.gold || 0);
  const xp = Number(metadata.experienceGained ?? metadata.xp ?? 0);
  const loss = Number(metadata.goldLost || 0);
  const loot = metadata.itemName ? { id: metadata.itemId, name: metadata.itemName, visualAssetId: metadata.itemVisualAssetId, itemSlot: metadata.itemSlot, itemStats: metadata.itemStats } : null;
  const lootAsset = loot ? resolveShellAsset(loot, assets, ['item', 'icon']) : null;
  return <RichCard kind="adventure" kicker={sharedKicker(entry, viewerId, 'adventure')} title="Adventure" subtitle="An Area encounter resolved by the server and shared with the thread." className={`stream-shared-card ${isOwner(entry, viewerId) ? 'is-owner' : 'is-observer'}`} testId="stream-adventure-rich-card">
    <div className={`stream-outcome-banner ${victory ? 'is-win' : 'is-loss'}`}><span>{victory ? 'VICTORY' : 'DEFEAT'}</span><strong>{victory ? `${actorLabel(entry)} defeated ${metadata.enemyName || 'the encounter'}` : `${actorLabel(entry)} fell to ${metadata.enemyName || 'the encounter'}`}</strong><b>{victory ? `+${gold} GOLD · +${xp} XP` : loss > 0 ? `−${loss} GOLD · BANK SAFE` : 'NO REWARD'}</b></div>
    <div className="stream-card-facts"><span>HP <strong>{metadata.remainingHp ?? 0}/{metadata.maxHp ?? 0}</strong></span><span>Area <strong>{metadata.areaName || `Area ${metadata.areaNumber || 1}`}</strong></span>{metadata.itemName ? <span>Loot <strong>{metadata.itemName}</strong></span> : null}</div>
    {metadata.leveledUp ? <div className="stream-card-facts" data-testid="adventure-level-up"><span>Level <strong>+{metadata.levelsGained || 1} · {metadata.level}</strong></span>{Number(metadata.maxHealthIncrease) > 0 ? <span>Max HP <strong>+{metadata.maxHealthIncrease}</strong></span> : null}</div> : null}
    {loot ? <div className="stream-loot-line" data-testid="adventure-loot"><span>LOOT</span>{lootAsset ? <img src={lootAsset.src} alt="" data-visual-asset-id={lootAsset.id} /> : null}<strong>{loot.name}</strong><small>{EQUIPMENT_SLOT_LABELS[loot.itemSlot] || loot.itemSlot || 'Equipment'}{itemStatSummary(loot) ? ` · ${itemStatSummary(loot)}` : ''}</small></div> : null}
    {metadata.storyEvent?.text ? <p className="stream-card-detail">{metadata.storyEvent.text}</p> : null}
  </RichCard>;
}

function DuelSharedCard({ entry, viewerId, assets }) {
  const metadata = entry.metadata || {};
  const replay = sharedBattleReplay(entry);
  if (!replay) return null;
  const receipt = replay.receipt || {};
  const outcome = replay.details?.outcome || receipt.outcome || metadata.outcome;
  const status = outcome === 'victory' ? 'victory' : outcome === 'defeat' ? 'defeat' : outcome === 'draw' ? 'draw' : 'resolved';
  return <RichCard kind="duel" kicker={`${actorLabel(entry)} · GUILD HALL DUEL`} title="Duel" subtitle="The committed Guild Hall battle replay is shared in this thread." className="stream-shared-card" testId="stream-duel-rich-card"><SharedBattleSurface replay={replay} createdAt={entry.createdAt} metadata={metadata} assets={assets} battleLabel="Duel" finalTitle={receipt.headline || `Duel ${status}`} finalDetail={receipt.text || `${Number(replay.details?.turnCount || metadata.turnCount || 0)} committed turns`} /></RichCard>;
}

function NpcSharedCard({ entry, viewerId, assets, areas }) {
  const metadata = entry.metadata || {};
  const town = areas?.towns?.find((candidate) => candidate.id === metadata.townId) || null;
  const npc = town?.npcs?.find((candidate) => candidate.id === metadata.npcId) || {
    id: metadata.npcId,
    name: metadata.npcName || entry.actorName || 'Town NPC',
    role: metadata.role || null,
    service: metadata.service || null,
    visualAssetId: metadata.npcVisualAssetId || null,
  };
  const asset = resolveShellAsset(npc, assets, ['npc', 'character']);
  return <RichCard kind="town" kicker={`${metadata.townName || town?.name || 'Town'} · NPC DIALOGUE`} title={npc.name || entry.actorName || 'Town NPC'} subtitle={[npc.role, npc.service].filter(Boolean).join(' · ') || 'Town resident'} className={`stream-shared-card ${isOwner(entry, viewerId) ? 'is-owner' : 'is-observer'}`} testId="stream-npc-rich-card"><div className="stream-npc-dialogue">{asset ? <img src={asset.src} alt="" data-visual-asset-id={asset.id} /> : null}<blockquote>{metadata.dialogue || entryBody(entry)}</blockquote></div></RichCard>;
}

function QuestRewardSharedCard({ entry, viewerId }) {
  const metadata = entry.metadata || {};
  const gold = Math.max(0, Number(metadata.goldAwarded || 0));
  const xp = Math.max(0, Number(metadata.experienceAwarded || 0));
  const levels = Math.max(0, Number(metadata.levelsGained || 0));
  const level = metadata.progression?.level || metadata.level || null;
  return <RichCard kind="quest" kicker={sharedKicker(entry, viewerId, 'quest')} title="Quest Reward" subtitle={metadata.questTitle || 'Quest completed'} className={`stream-shared-card ${isOwner(entry, viewerId) ? 'is-owner' : 'is-observer'}`} testId="stream-quest-reward"><div className="stream-outcome-banner is-win"><span>CLAIMED</span><strong>{metadata.questTitle || 'Quest reward'}</strong><b>+{gold} GOLD · +{xp} XP</b></div>{levels > 0 ? <div className="stream-card-facts"><span>Level <strong>{level || 'Up'} · +{levels}</strong></span>{Number(metadata.maxHealthIncrease) > 0 ? <span>Max HP <strong>+{metadata.maxHealthIncrease}</strong></span> : null}</div> : null}</RichCard>;
}

const SHARED_RICH_EVENT_TYPES = new Set(['HuntResolved', 'AdventureResolved', 'DuelResolved', 'NpcInteracted', 'QuestClaimed', 'BlackjackPlayed', 'CoinflipPlayed', 'SlotsPlayed', 'InventoryViewed', 'StatusViewed', 'ShopViewed', 'DungeonStarted', 'CombatActionResolved', 'DungeonEncounterContinued', 'DungeonPotionUsed', 'DungeonRetreated', 'DungeonFailed']);

function SharedEntryCard({ entry, viewerId, assets, areas, onRequest, onCommand, onDungeonReplayComplete, busy, latestBlackjack, dashboard, interactiveDungeon = true }) {
  if (entry.eventType === 'HuntResolved') return <HuntSharedCard entry={entry} viewerId={viewerId} assets={assets} />;
  if (entry.eventType === 'AdventureResolved') return <AdventureSharedCard entry={entry} viewerId={viewerId} assets={assets} />;
  if (entry.eventType === 'DuelResolved') return <DuelSharedCard entry={entry} viewerId={viewerId} assets={assets} />;
  if (entry.eventType === 'NpcInteracted') return <NpcSharedCard entry={entry} viewerId={viewerId} assets={assets} areas={areas} />;
  if (entry.eventType === 'QuestClaimed') return <QuestRewardSharedCard entry={entry} viewerId={viewerId} />;
  if (['BlackjackPlayed', 'CoinflipPlayed', 'SlotsPlayed'].includes(entry.eventType)) return <GamblingSharedCard entry={entry} viewerId={viewerId} onCommand={onCommand} busy={busy} latestBlackjack={latestBlackjack} />;
  if (entry.eventType === 'InventoryViewed') return <InventorySharedCard entry={entry} viewerId={viewerId} assets={assets} onRequest={onRequest} busy={busy} />;
  if (entry.eventType === 'StatusViewed') return <StatusSharedCard entry={entry} viewerId={viewerId} assets={assets} />;
  if (entry.eventType === 'ShopViewed') return <ShopSharedCard entry={entry} viewerId={viewerId} assets={assets} onRequest={onRequest} onCommand={onCommand} busy={busy} />;
  if (['DungeonStarted', 'CombatActionResolved', 'DungeonEncounterContinued', 'DungeonPotionUsed', 'DungeonRetreated', 'DungeonFailed'].includes(entry.eventType)) return <DungeonSharedCard entry={entry} viewerId={viewerId} assets={assets} onRequest={onRequest} busy={busy} dashboard={dashboard} interactive={interactiveDungeon} onReplayComplete={onDungeonReplayComplete} />;
  return null;
}

export function AdventureStream({ entries = [], ephemeralCard = null, onLoadMore = null, hasMore = false, connected = false, viewerId = null, assets = [], areas = null, onRequest = () => {}, onCommand = () => {}, onDungeonReplayComplete = null, busy = false, dashboard = null }) {
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
       ? <SharedEntryCard entry={entry} viewerId={viewerId} assets={assets} areas={areas} onRequest={onRequest} onCommand={onCommand} onDungeonReplayComplete={onDungeonReplayComplete} busy={busy} latestBlackjack={roundId ? latestBlackjack.get(roundId) : null} dashboard={dashboard} interactiveDungeon={entry.id === latestDungeonEntryId} />
      : null;
    return <article className={`stream-entry stream-${kind}-entry${sharedCard ? ' stream-entry--rich' : ''}`} key={entryKey(entry)} data-entry-id={entry.id || undefined} data-testid={`stream-${kind}-entry`}><span className={`stream-entry__avatar stream-entry__avatar--${kind}`} aria-hidden="true">{String(sharedCard ? actorLabel(entry) : entry.actorName || (kind === 'chat' ? 'W' : '✦')).slice(0, 1)}</span><div className="stream-entry__content"><div className="stream-entry__meta"><strong>{sharedCard ? actorLabel(entry) : entry.actorName || 'THREADBOUND'}</strong><time dateTime={entry.createdAt || undefined}>{formatEntryTime(entry.createdAt)}</time></div>{sharedCard || <p>{entryBody(entry)}</p>}</div></article>;
  }) : <div className="stream-empty"><span aria-hidden="true">✦</span><p>Your first result will land here.</p></div>}{ephemeralCard ? <div className="stream-active-card">{ephemeralCard}</div> : null}</div></section>;
}
