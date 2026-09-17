import { useState } from 'react';
import { commandKey } from '../../api/client.js';
import { compactText, findDungeon, goldValue, healthValue, resolveShellAsset } from '../../shell/presentation.js';
import { PanelButton, RichCard, StateMessage } from '../common/RichCard.jsx';

function AssetThumb({ entity, assets, kinds, alt = '', className = '' }) {
  const asset = resolveShellAsset(entity, assets, kinds);
  return asset ? <img className={`shell-asset-thumb ${className}`.trim()} src={asset.src} alt={alt} data-visual-asset-id={asset.id} /> : <span className={`shell-asset-fallback ${className}`.trim()} aria-hidden="true">✦</span>;
}

function Stat({ label, value, tone = '' }) {
  return <div className={`shell-stat ${tone ? `shell-stat--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

function ProgressBar({ value, max, label = 'Progress', tone = 'purple' }) {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeValue = Math.max(0, Math.min(safeMax, Number(value) || 0));
  return <div className="shell-progress"><div className="shell-progress__label"><span>{label}</span><strong>{safeValue}/{safeMax}</strong></div><div className="shell-progress__track"><span className={`shell-progress__fill shell-progress__fill--${tone}`} style={{ width: `${Math.round((safeValue / safeMax) * 100)}%` }} /></div></div>;
}

export function StatusPanel({ dashboard, onCommand }) {
  const character = dashboard?.character;
  const health = healthValue(character);
  const progression = character?.levelProgression || {};
  return (
    <RichCard kind="profile" kicker="PRIVATE THREAD REPLY · /status" title={character?.displayName || 'Weaver profile'} subtitle="Your authoritative player state, mirrored into the shared thread." testId="stream-player-status">
      <div className="shell-profile-hero"><span className="shell-profile-avatar">{String(character?.displayName || 'W').slice(0, 1)}</span><div><span className="shell-kicker">LEVEL {character?.level || 1}</span><h3>Ready for the next thread.</h3><p>{dashboard?.activeRun ? 'A dungeon is active. Finish it before starting a Hunt.' : 'Choose a Quick Command or type a plain word below.'}</p></div></div>
      <div className="shell-stat-grid"><Stat label="HP" value={`${health.current}/${health.max}`} tone="green" /><Stat label="Attack" value={character?.attack ?? character?.attackPower ?? '—'} tone="blue" /><Stat label="Defense" value={character?.defense ?? '—'} /><Stat label="Gold" value={goldValue(character)} tone="gold" /></div>
      <ProgressBar value={progression.experienceIntoLevel || character?.experience || 0} max={progression.experienceNeededForLevel || 100} label="Experience" />
      <div className="shell-inline-summary"><span>Health potions <strong>{character?.healthPotions ?? 0}</strong></span><span>Party <strong>{dashboard?.party ? `${dashboard.party.members?.length || 1} Weaver${dashboard.party.members?.length === 1 ? '' : 's'}` : 'Solo'}</strong></span></div>
      <div className="shell-card-actions"><PanelButton primary onClick={() => onCommand('inventory')}>Open Inventory</PanelButton><PanelButton onClick={() => onCommand('quest')}>View Quest</PanelButton></div>
    </RichCard>
  );
}

export function HelpPanel({ onCommand }) {
  const commands = [
    ['hunt', 'Resolve one short automatic battle for Gold, XP, and possible gear.'],
    ['dungeon', 'Open the persistent attack-only run and keep HP across encounters.'],
    ['inventory', 'Inspect Equipment, equip a piece, Upgrade, Sell, or Heal.'],
    ['shop', 'Buy supplies and Equipment with Gold.'],
    ['party', 'Create or join a cooperative party.'],
    ['area', 'Travel between unlocked Areas and visit Town NPCs.'],
    ['quest', 'Accept or claim the current Area Quest.'],
  ];
  return <RichCard kind="help" kicker="THREAD GUIDE · /help" title="Choose your next thread" subtitle="Common words and slash commands work the same way."><div className="shell-command-list">{commands.map(([command, description]) => <button type="button" key={command} onClick={() => onCommand(command)}><strong>/{command}</strong><span>{description}</span><b>›</b></button>)}</div><p className="shell-muted-copy">Battle details remain available in the focused Battle view when you want turn-by-turn animation.</p></RichCard>;
}

export function InventoryPanel({ dashboard, assets, onRequest, onCommand, busy = false }) {
  const [confirming, setConfirming] = useState(null);
  const character = dashboard?.character || {};
  const equipment = character.equipment || {};
  const items = dashboard?.inventory || [];
  const health = healthValue(character);
  const slots = ['weapon', 'head', 'chest', 'boots', 'accessory'];
  return (
    <RichCard kind="inventory" kicker="PRIVATE THREAD REPLY · /inventory" title="Inventory" subtitle={`${items.length} item${items.length === 1 ? '' : 's'} · ${goldValue(character)} Gold`} testId="inventory-rich-card">
      <div className="shell-stat-grid shell-stat-grid--five">{slots.map((slot) => <div className="shell-slot" key={slot}><span>{slot}</span><strong>{equipment[slot]?.name || 'Empty'}</strong></div>)}</div>
      <div className="shell-utility-row"><div><strong>Health potion</strong><small>Restore HP outside an active dungeon.</small></div><PanelButton onClick={() => onRequest('heal', '/api/recovery/potion', { method: 'POST' })} disabled={busy || !character.healthPotions || health.current >= health.max} primary>Heal · {character.healthPotions ?? 0} left</PanelButton></div>
      {items.length ? <div className="shell-item-list">{items.map((item) => {
        const equipped = Object.values(equipment).some((candidate) => candidate?.id === item.id);
        const asset = resolveShellAsset(item, assets, ['item', 'icon']);
        return <article className="shell-item-row" key={item.id} data-testid="inventory-rich-item" data-item-id={item.id}>
          <AssetThumb entity={item} assets={assets} kinds={['item', 'icon']} alt="" />
          <div className="shell-item-copy"><div className="shell-item-heading"><strong>{item.name}</strong><span className={`rarity-chip rarity-chip--${item.rarity || 'common'}`}>{item.rarity || 'Common'}</span></div><small>{item.slot || 'Equipment'} · +{item.attackBonus || 0} Attack · {item.effect?.name || 'Reliable'}{asset ? ` · ${asset.label}` : ''}</small>{equipped ? <span className="shell-equipped-badge">EQUIPPED</span> : null}</div>
          <div className="shell-item-actions">{equipped ? <PanelButton disabled>Equipped</PanelButton> : <PanelButton primary disabled={busy} onClick={() => onRequest(`equip ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/equip`, { method: 'POST' })} testId={`inventory-rich-equip-${item.id}`}>Equip</PanelButton>}<PanelButton disabled={busy} onClick={() => onRequest(`upgrade ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/upgrade`, { method: 'POST' })} testId={`inventory-rich-upgrade-${item.id}`}>Upgrade</PanelButton>{equipped ? null : <PanelButton danger disabled={busy} onClick={() => { if (confirming === item.id) { setConfirming(null); onRequest(`sell ${item.name}`, `/api/items/${encodeURIComponent(item.id)}/salvage`, { method: 'POST' }); } else setConfirming(item.id); }} testId={`inventory-rich-sell-${item.id}`}>{confirming === item.id ? 'Confirm Sell' : 'Sell'}</PanelButton>}</div>
        </article>;
      })}</div> : <StateMessage title="No Equipment yet" copy="Hunt or clear a Dungeon to find your first piece of Equipment." action={<PanelButton primary onClick={() => onCommand('hunt')}>Go Hunt</PanelButton>} />}
    </RichCard>
  );
}

export function ShopPanel({ shop, assets, onRequest, onCommand, busy = false, bankOnly = false }) {
  if (!shop) return <RichCard kind="shop" kicker="SHOP"><StateMessage title="Shop unavailable" copy="The vendor could not be reached yet." /></RichCard>;
  const offers = shop.offers || [];
  const bank = shop.bank || {};
  return <RichCard kind={bankOnly ? 'bank' : 'shop'} kicker={bankOnly ? 'PRIVATE THREAD REPLY · /bank' : 'PRIVATE THREAD REPLY · /shop'} title={bankOnly ? 'Bank' : shop.vendor?.name || 'Town Shop'} subtitle={bankOnly ? 'Gold transport stays server-authoritative.' : `${shop.currency?.balance ?? 0} Gold available`} testId={bankOnly ? 'bank-rich-card' : 'shop-rich-card'}>
    <div className="shell-bank-balance"><div><span>Carried</span><strong>{bank.carriedGold ?? shop.currency?.balance ?? 0} Gold</strong></div><div><span>Banked</span><strong>{bank.bankedGold ?? 0} Gold</strong></div></div>
    {bankOnly ? <BankActions bank={bank} onRequest={onRequest} busy={busy} /> : null}
    {!bankOnly ? <div className="shell-offer-list">{offers.map((offer) => <article className="shell-offer-row" key={offer.sku} data-testid="shop-offer" data-sku={offer.sku}><AssetThumb entity={offer} assets={assets} kinds={['item', 'icon']} alt="" /><div><div className="shell-item-heading"><strong>{offer.name}</strong><span>{offer.cost} Gold</span></div><small>{offer.description || `${offer.quantity || 1} available`}</small></div><PanelButton primary disabled={busy || !offer.available || !offer.affordable} onClick={() => onRequest(`buy ${offer.name}`, `/api/shop/purchases/${encodeURIComponent(offer.sku)}`, { method: 'POST' })} testId={`shop-buy-${offer.sku}`}>{offer.affordable ? 'Buy' : 'Need Gold'}</PanelButton></article>)}</div> : null}
    {!bankOnly ? <div className="shell-card-actions"><span className="shell-muted-copy">Gold is authoritative.</span><PanelButton onClick={() => onCommand('bank')}>Open Bank</PanelButton></div> : null}
  </RichCard>;
}

function BankActions({ bank, onRequest, busy }) {
  const [amount, setAmount] = useState('5');
  const parsed = Math.max(1, Number(amount) || 1);
  return <div className="shell-bank-actions"><label>Amount <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" aria-label="Gold amount" data-testid="bank-amount" /></label><div><PanelButton disabled={busy || parsed > Number(bank.carriedGold || 0)} onClick={() => onRequest(`deposit ${parsed} Gold`, `/api/shop/purchases/bank-deposit-${parsed}`, { method: 'POST' })}>Deposit</PanelButton><PanelButton primary disabled={busy || parsed > Number(bank.bankedGold || 0)} onClick={() => onRequest(`withdraw ${parsed} Gold`, `/api/shop/purchases/bank-withdraw-${parsed}`, { method: 'POST' })}>Withdraw</PanelButton></div></div>;
}

export function PartyPanel({ dashboard, onRequest, busy = false }) {
  const [joinCode, setJoinCode] = useState('');
  const party = dashboard?.party;
  if (!party) return <RichCard kind="party" kicker="PRIVATE THREAD REPLY · /party" title="Adventure Party" subtitle="Co-op is optional; the thread is ready for another Weaver."><StateMessage title="Solo thread" copy="Create a party, then share the invite code with a friend." action={<div className="shell-card-actions"><PanelButton primary disabled={busy} onClick={() => onRequest('create party', '/api/party/create', { method: 'POST' })}>Create Party</PanelButton><div className="shell-join-form"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="JOIN CODE" maxLength={12} aria-label="Party join code" data-testid="party-join-code" /><PanelButton disabled={busy || !joinCode.trim()} onClick={() => onRequest(`join party ${joinCode}`, '/api/party/join', { method: 'POST', body: JSON.stringify({ joinCode }) })}>Join</PanelButton></div></div>} /></RichCard>;
  const viewer = party.members?.find((member) => member.playerId === dashboard.character?.id);
  return <RichCard kind="party" kicker="PRIVATE THREAD REPLY · /party" title="Adventure Party" subtitle={`${party.members?.length || 1} Weaver${party.members?.length === 1 ? '' : 's'} · invite ${party.joinCode}`}><div className="shell-party-list">{(party.members || []).map((member) => <div className="shell-party-member" key={member.playerId}><span className="shell-profile-avatar shell-profile-avatar--small">{String(member.displayName || 'W').slice(0, 1)}</span><div><strong>{member.displayName}</strong><small>{member.playerId === party.leaderPlayerId ? 'Leader · ' : ''}{member.ready ? 'Ready' : 'Not ready'}</small></div><i className={member.ready ? 'is-ready' : ''} /></div>)}</div><div className="shell-card-actions"><PanelButton primary disabled={busy} onClick={() => onRequest(viewer?.ready ? 'unready' : 'ready party', '/api/party/ready', { method: 'POST', body: JSON.stringify({ ready: !viewer?.ready }) })}>{viewer?.ready ? 'Unready' : 'Ready Up'}</PanelButton><PanelButton disabled={busy} onClick={() => onRequest('leave party', '/api/party/leave', { method: 'POST' })}>Leave Party</PanelButton></div></RichCard>;
}

export function DungeonPanel({ dashboard, onRequest, onCommand, busy = false }) {
  const [selectedDungeonId, setSelectedDungeonId] = useState(null);
  const run = dashboard?.activeRun;
  const dungeons = dashboard?.dungeons || [];
  const selected = findDungeon(dungeons, selectedDungeonId);
  const readiness = (dashboard?.simpleLoop?.dungeonReadiness || []).find((entry) => entry.dungeonId === (selected?.id || dungeons[0]?.id));
  if (run) {
    const viewer = run.viewer || run.participants?.[0];
    const enemy = run.enemy;
    return <RichCard kind="dungeon" kicker="PERSISTENT RUN · /dungeon" title={run.dungeonDefinition?.name || 'Dungeon'} subtitle={run.simpleCombat ? 'Attack is the only combat action in this Adventure.' : 'This run has tactical details in Battle view.'} testId="shell-dungeon-card"><div className="shell-run-state"><div><span className="shell-kicker">ROOM {Number(run.encounterIndex || 0) + 1}</span><strong>{enemy?.name || (run.phase === 'complete' ? 'Run complete' : 'Run state')}</strong><small>{run.phase} · HP persists between actions</small></div>{enemy ? <div className="shell-run-enemy"><span>ENEMY</span><strong>{enemy.hp}/{enemy.maxHp} HP</strong></div> : null}</div>{viewer ? <ProgressBar value={viewer.hp} max={viewer.maxHp} label={`${dashboard.character?.displayName || 'You'} HP`} tone="green" /> : null}{enemy ? <ProgressBar value={enemy.hp} max={enemy.maxHp} label={enemy.name} tone="red" /> : null}<div className="shell-card-actions">{run.simpleCombat ? <PanelButton primary disabled={busy || !enemy} onClick={() => onRequest(`attack ${enemy?.name || 'enemy'}`, `/api/runs/${encodeURIComponent(run.id)}/attack`, { method: 'POST', headers: { 'Idempotency-Key': commandKey('shell-attack') } })} testId="shell-run-attack">Attack</PanelButton> : <PanelButton primary onClick={() => { window.location.href = '/game-react?view=battle'; }}>Open Battle Details</PanelButton>}<PanelButton onClick={() => onCommand('status')}>View HP</PanelButton></div></RichCard>;
  }
  return <RichCard kind="dungeon" kicker="PRIVATE THREAD REPLY · /dungeon" title="Choose a Dungeon" subtitle="Persistent HP, one clear Attack action, and server-resolved rewards." testId="shell-dungeon-card"><div className="shell-dungeon-list">{dungeons.map((dungeon) => <button type="button" key={dungeon.id} className={`shell-dungeon-choice${selected?.id === dungeon.id ? ' is-selected' : ''}`} onClick={() => setSelectedDungeonId(dungeon.id)}><span><strong>{dungeon.name}</strong><small>{dungeon.recommendedPlayers || 1} recommended Weaver{dungeon.recommendedPlayers === 1 ? '' : 's'} · recommended Attack {readiness?.recommendedAttack || 9}+</small></span><b>{selected?.id === dungeon.id ? 'SELECTED' : '›'}</b></button>)}</div>{selected ? <div className="shell-dungeon-ready"><span className={`shell-ready-dot${readiness?.ready ? ' is-ready' : ''}`} /><div><strong>{readiness?.ready ? 'Ready to enter' : 'Check readiness'}</strong><small>{readiness?.members?.map((member) => `${member.displayName}: ${member.ready ? 'ready' : 'needs more Attack/HP'}`).join(' · ') || 'Solo readiness is evaluated by the server.'}</small></div></div> : <StateMessage title="Pick a Dungeon" copy="The server will return the authoritative readiness check." />}{selected ? <PanelButton primary disabled={busy || readiness?.ready === false} onClick={() => onRequest(`start dungeon ${selected.name}`, `/api/dungeons/${encodeURIComponent(selected.id)}/start-simple`, { method: 'POST' })} testId={`dungeon-start-${selected.id}`}>Enter Dungeon</PanelButton> : null}</RichCard>;
}

export function HuntPanel({ result, dashboard, onRequest, onCommand, busy = false }) {
  const hunt = result || {};
  return <RichCard kind="hunt" kicker="PRIVATE THREAD REPLY · /hunt" title="Hunt" subtitle="One automatic encounter. The server commits the result, reward, and HP." testId="hunt-rich-card">{result ? <div className="shell-result-summary"><span className={`shell-result-mark${hunt.victory ? ' is-good' : ''}`}>{hunt.victory ? '✓' : '!'}</span><div><strong>{hunt.victory ? `Defeated ${hunt.enemy?.name || 'the encounter'}` : 'The encounter won'}</strong><p>{hunt.victory ? `+${hunt.gold || 0} Gold · +${hunt.experience || hunt.xp || 0} XP` : 'Recover before the next Hunt.'} · {hunt.character?.currentHealth ?? dashboard?.character?.currentHealth ?? 0}/{hunt.character?.maxHealth ?? dashboard?.character?.maxHealth ?? 0} HP</p>{hunt.item ? <small>Found {hunt.item.name}</small> : null}</div></div> : <StateMessage title="The next Hunt is ready" copy="Resolve a short automatic battle for a clear receipt." /> }<div className="shell-card-actions"><PanelButton primary disabled={busy || !dashboard?.simpleLoop?.huntAvailable} onClick={() => onRequest('hunt', '/api/hunt', { method: 'POST' })} testId="shell-hunt">{result ? 'Hunt Again' : 'Start Hunt'}</PanelButton><PanelButton onClick={() => onCommand('inventory')}>Inventory</PanelButton></div></RichCard>;
}

export function QuestPanel({ quests, onRequest, busy = false }) {
  if (!quests) return <RichCard kind="quest" kicker="QUESTS"><StateMessage title="Quest board unavailable" copy="The current Area Quest could not be loaded." /></RichCard>;
  const list = quests.quests || [];
  return <RichCard kind="quest" kicker="PRIVATE THREAD REPLY · /quest" title="Quest Board" subtitle={`${quests.currentArea?.name || 'Current Area'} · progress is tracked by the server`} testId="quest-rich-card">{list.length ? <div className="shell-quest-list">{list.map((quest) => <article className="shell-quest-row" key={quest.id} data-testid="quest-row"><div className="shell-quest-heading"><div><span className="shell-kicker">{quest.state}</span><h3>{quest.title}</h3></div><span className={`quest-state quest-state--${quest.state}`}>{quest.state}</span></div><p>{quest.description || quest.summary || 'Complete the objectives in this Area.'}</p><ul>{(quest.objectives || []).map((objective) => <li key={objective.id || objective.label}><span>{objective.label || objective.type}</span><strong>{objective.current ?? objective.progress ?? 0}/{objective.required ?? objective.target ?? 1}</strong></li>)}</ul><div className="shell-card-actions">{quest.state === 'available' ? <PanelButton primary disabled={busy} onClick={() => onRequest(`accept quest ${quest.title}`, `/api/quests/${encodeURIComponent(quest.id)}/accept`, { method: 'POST' })}>Accept Quest</PanelButton> : null}{quest.state === 'claimable' ? <PanelButton primary disabled={busy} onClick={() => onRequest(`claim quest ${quest.title}`, `/api/quests/${encodeURIComponent(quest.id)}/claim`, { method: 'POST' })}>Claim Reward</PanelButton> : null}</div></article>)}</div> : <StateMessage title="No Quest in this Area" copy="Travel to another unlocked Area when the thread opens it." />}</RichCard>;
}

export function AreaPanel({ areas, onRequest, busy = false }) {
  const [interaction, setInteraction] = useState(null);
  if (!areas) return <RichCard kind="area" kicker="AREAS"><StateMessage title="Area map unavailable" copy="The world position could not be loaded." /></RichCard>;
  const area = areas;
  return <RichCard kind="area" kicker="PRIVATE THREAD REPLY · /area" title={area.currentArea?.name || 'Area'} subtitle={`${area.towns?.length || 0} Town${area.towns?.length === 1 ? '' : 's'} · ${area.highestUnlockedAreaNumber || 1} Area${area.highestUnlockedAreaNumber === 1 ? '' : 's'} unlocked`} testId="area-rich-card"><div className="shell-area-list">{(area.areas || []).map((candidate) => <div className={`shell-area-row${candidate.current ? ' is-current' : ''}`} key={candidate.id}><div><span className="shell-kicker">AREA {candidate.number}</span><strong>{candidate.name}</strong></div>{candidate.current ? <span className="shell-current-badge">CURRENT</span> : <PanelButton disabled={busy} onClick={() => onRequest(`travel to ${candidate.name}`, `/api/areas/${candidate.number}/travel`, { method: 'POST' })}>Travel</PanelButton>}</div>)}</div><div className="shell-town-list"><span className="shell-kicker">TOWNS IN THIS AREA</span>{(area.towns || []).map((town) => <article key={town.id}><div><strong>{town.name}</strong><small>{town.tagline || 'A place to recover and resupply.'}</small></div><div className="shell-town-actions">{(town.npcs || []).slice(0, 2).map((npc) => <PanelButton key={npc.id} disabled={busy} onClick={async () => { const payload = await onRequest(`talk to ${npc.name}`, `/api/towns/${encodeURIComponent(town.id)}/npcs/${encodeURIComponent(npc.id)}/interact`, { method: 'POST' }); if (payload?.interaction) setInteraction(payload.interaction); }}>{npc.name}</PanelButton>)}</div></article>)}</div>{interaction ? <div className="shell-interaction"><span className="shell-kicker">TOWN RECEIPT</span><strong>{interaction.npcName || interaction.npc?.name || 'Town NPC'}</strong><p>{interaction.text || interaction.message || interaction.description || 'The conversation was recorded in the Adventure Stream.'}</p></div> : null}</RichCard>;
}

export function CodexPanel() {
  return <RichCard kind="codex" kicker="LIVING CODEX · /codex" title="Codex" subtitle="The full reference remains available without leaving the product shell."><StateMessage title="Open the Living Codex" copy="Rules, Areas, NPCs, Monsters, and Equipment stay in their focused reference view." action={<a className="shell-button shell-button--primary" href="/codex">Open Codex ↗</a>} /></RichCard>;
}

export function renderGameplayPanel({ panel, dashboard, assets, areas, quests, shop, onRequest, onCommand, busy }) {
  const props = { dashboard, assets, areas, quests, shop, onRequest, onCommand, busy };
  switch (panel?.kind) {
    case 'help': return <HelpPanel {...props} />;
    case 'status': return <StatusPanel {...props} />;
    case 'inventory': return <InventoryPanel {...props} />;
    case 'shop': return <ShopPanel {...props} />;
    case 'bank': return <ShopPanel {...props} bankOnly />;
    case 'party': return <PartyPanel {...props} />;
    case 'dungeon': return <DungeonPanel {...props} />;
    case 'hunt': return <HuntPanel {...props} result={panel.data} />;
    case 'quest': return <QuestPanel {...props} />;
    case 'area': return <AreaPanel {...props} areas={areas} />;
    case 'codex': return <CodexPanel {...props} />;
    default: return <StatusPanel {...props} />;
  }
}
