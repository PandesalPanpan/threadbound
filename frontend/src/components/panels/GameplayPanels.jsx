import { useState } from 'react';
import { commandKey } from '../../api/client.js';
import { compactText, findDungeon, resolveShellAsset } from '../../shell/presentation.js';
import { PanelButton, RichCard, StateMessage } from '../common/RichCard.jsx';
import { ShopSurface } from '../chat/ShopSurface.jsx';

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

function gamblingDelta(record = {}) {
  return Number(record.payoutGold || 0) - Number(record.wager || 0);
}

function GamblingOutcomeBanner({ outcome = 'resolved', delta = 0, active = false, detail = '' }) {
  const tone = active ? 'is-neutral' : delta > 0 ? 'is-win' : delta < 0 ? 'is-loss' : 'is-push';
  const deltaText = delta > 0 ? `+${delta} GOLD` : delta < 0 ? `−${Math.abs(delta)} GOLD` : '±0 GOLD';
  return <div className={`stream-outcome-banner shell-gambling-outcome ${tone}`}><span>{active ? 'LIVE' : String(outcome || 'resolved').toUpperCase()}</span><strong>{active ? 'Hand in progress' : delta > 0 ? 'YOU WON' : delta < 0 ? 'YOU LOST' : 'PUSH'}</strong><b>{active ? detail : deltaText}</b></div>;
}

export function HelpPanel({ onCommand }) {
  const commands = [
    ['hunt', null, 'Resolve one short automatic battle for Gold, XP, and possible gear.'],
    ['adventure', 'adv', 'Take a larger automatic encounter in the current Area.'],
    ['dungeon', 'dg', 'Enter a persistent Dungeon and watch each room resolve in the shared thread.'],
    ['inventory', 'inv', 'Inspect Equipment, equip a piece, Upgrade, Sell, or Heal.'],
    ['shop', 'sh', 'Buy supplies and Equipment with Gold.'],
    ['party', 'pt', 'Create or join a cooperative party.'],
    ['area', 'ar', 'Travel between unlocked Areas and visit Town NPCs.'],
    ['quest', null, 'Accept or claim the current Area Quest.'],
    ['leaderboard', 'lb', 'Inspect Guild Hall standings or Duel a simulated rival.'],
    ['blackjack', 'bj <Gold>', 'Start the shared Blackjack table with a wager.'],
    ['coinflip', 'cf <Gold> heads|tails', 'Call a Gold Coinflip.'],
    ['slots', 'sl <Gold>', 'Spin Slots with carried Gold.'],
    ['heal', 'pot [tier]', 'Use the lowest available potion, or choose minor/health/greater/major.'],
    ['status', 'st', 'Read the one persistent HP pool and character status.'],
    ['continue', 'cont', 'Continue to the next Dungeon room.'],
    ['retreat', 'lv', 'Leave a paused Dungeon safely.'],
    ['codex', 'cx', 'Open the Living Codex.'],
    ['world', null, 'Read shared Arc progress and your milestones.'],
  ];
  return <RichCard kind="help" kicker="THREAD GUIDE · /help" title="Choose your next thread" subtitle="Common words, short aliases, and slash commands work the same way."><div className="shell-command-list">{commands.map(([command, alias, description]) => <button type="button" key={command} onClick={() => onCommand(command)}><strong>/{command}</strong><span>{alias ? `alias: ${alias} · ${description}` : description}</span><b>›</b></button>)}</div><p className="shell-muted-copy">Battle details remain available in the focused Battle view when you want turn-by-turn animation.</p></RichCard>;
}

export function ShopPanel({ shop, assets, onRequest, onCommand, busy = false, bankOnly = false }) {
  if (!shop) return <RichCard kind="shop" kicker="SHOP"><StateMessage title="Shop unavailable" copy="The vendor could not be reached yet." /></RichCard>;
  if (!bankOnly) return <ShopSurface shop={shop} assets={assets} owner onRequest={onRequest} onCommand={onCommand} busy={busy} kicker="YOUR VIEW · /shop" className="shop-panel" testId="shop-rich-card" />;
  const bank = shop.bank || {};
  return <RichCard kind="bank" kicker="BANK · /bank" title="Bank" subtitle="Gold transport stays server-authoritative." testId="bank-rich-card">
    <div className="shell-bank-balance"><div><span>Carried</span><strong>{bank.carriedGold ?? shop.currency?.balance ?? 0} Gold</strong></div><div><span>Banked</span><strong>{bank.bankedGold ?? 0} Gold</strong></div></div>
    <BankActions bank={bank} onRequest={onRequest} busy={busy} />
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
  if (!party) return <RichCard kind="party" kicker="YOUR VIEW · /party" title="Adventure Party" subtitle="Co-op is optional; the thread is ready for another Weaver."><StateMessage title="Solo thread" copy="Create a party, then share the invite code with a friend." action={<div className="shell-card-actions"><PanelButton primary disabled={busy} onClick={() => onRequest('create party', '/api/party/create', { method: 'POST' })}>Create Party</PanelButton><div className="shell-join-form"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="JOIN CODE" maxLength={12} aria-label="Party join code" data-testid="party-join-code" /><PanelButton disabled={busy || !joinCode.trim()} onClick={() => onRequest(`join party ${joinCode}`, '/api/party/join', { method: 'POST', body: JSON.stringify({ joinCode }) })}>Join</PanelButton></div></div>} /></RichCard>;
  const viewer = party.members?.find((member) => member.playerId === dashboard.character?.id);
  return <RichCard kind="party" kicker="YOUR VIEW · /party" title="Adventure Party" subtitle={`${party.members?.length || 1} Weaver${party.members?.length === 1 ? '' : 's'} · invite ${party.joinCode}`}><div className="shell-party-list">{(party.members || []).map((member) => <div className="shell-party-member" key={member.playerId} data-testid={`party-member-${member.playerId}`}><span className="shell-profile-avatar shell-profile-avatar--small">{String(member.displayName || 'W').slice(0, 1)}</span><div><strong>{member.displayName}</strong><small>{member.playerId === party.leaderPlayerId ? 'Leader · ' : ''}{member.ready ? 'Ready' : 'Not ready'}</small></div><i className={member.ready ? 'is-ready' : ''} /></div>)}</div><div className="shell-card-actions"><PanelButton primary disabled={busy} onClick={() => onRequest(viewer?.ready ? 'unready' : 'ready party', '/api/party/ready', { method: 'POST', body: JSON.stringify({ ready: !viewer?.ready }) })}>{viewer?.ready ? 'Unready' : 'Ready Up'}</PanelButton><PanelButton disabled={busy} onClick={() => onRequest('leave party', '/api/party/leave', { method: 'POST' })}>Leave Party</PanelButton></div></RichCard>;
}

export function DungeonPanel({ dashboard, onRequest, onCommand, busy = false }) {
  const [selectedDungeonId, setSelectedDungeonId] = useState(null);
  const run = dashboard?.activeRun;
  const dungeons = dashboard?.dungeons || [];
  const selected = findDungeon(dungeons, selectedDungeonId);
  const readiness = (dashboard?.simpleLoop?.dungeonReadiness || []).find((entry) => entry.dungeonId === (selected?.id || dungeons[0]?.id));
  if (run) {
    if (run.simpleCombat) return null;
    const viewer = run.viewer || run.participants?.[0];
    const enemy = run.enemy;
    return <RichCard kind="dungeon" kicker="PERSISTENT RUN · /dungeon" title={run.dungeonDefinition?.name || 'Dungeon'} subtitle="This run has tactical details in Battle view." testId="shell-dungeon-card"><div className="shell-run-state"><div><span className="shell-kicker">ROOM {Number(run.encounterIndex || 0) + 1}</span><strong>{enemy?.name || (run.phase === 'complete' ? 'Run complete' : 'Run state')}</strong><small>{run.phase} · HP persists between actions</small></div>{enemy ? <div className="shell-run-enemy"><span>ENEMY</span><strong>{enemy.hp}/{enemy.maxHp} HP</strong></div> : null}</div>{viewer ? <ProgressBar value={viewer.hp} max={viewer.maxHp} label={`${dashboard.character?.displayName || 'You'} HP`} tone="green" /> : null}{enemy ? <ProgressBar value={enemy.hp} max={enemy.maxHp} label={enemy.name} tone="red" /> : null}<div className="shell-card-actions"><PanelButton primary onClick={() => { window.location.href = '/game?view=battle'; }}>Open Battle Details</PanelButton><PanelButton onClick={() => onCommand('status')}>View HP</PanelButton></div></RichCard>;
  }
  return <RichCard kind="dungeon" kicker="DUNGEON ENTRY · /dungeon" title="Choose a Dungeon" subtitle="Persistent HP, a shared server replay, and owner-only room decisions." testId="shell-dungeon-card"><div className="shell-dungeon-list">{dungeons.map((dungeon) => <button type="button" key={dungeon.id} className={`shell-dungeon-choice${selected?.id === dungeon.id ? ' is-selected' : ''}`} onClick={() => setSelectedDungeonId(dungeon.id)}><span><strong>{dungeon.name}</strong><small>{dungeon.recommendedPlayers || 1} recommended Weaver{dungeon.recommendedPlayers === 1 ? '' : 's'} · recommended Attack {readiness?.recommendedAttack || 9}+</small></span><b>{selected?.id === dungeon.id ? 'SELECTED' : '›'}</b></button>)}</div>{selected ? <div className="shell-dungeon-ready"><span className={`shell-ready-dot${readiness?.ready ? ' is-ready' : ''}`} /><div><strong>{readiness?.ready ? 'Ready to enter' : 'Ready with risk'}</strong><small>{readiness?.members?.map((member) => `${member.displayName}: ${member.currentHealth}/${member.maxHealth} HP · ${member.canEnter === false ? 'too wounded' : member.ready ? 'ready' : 'below recommendation'}`).join(' · ') || 'Readiness is a server projection; entering remains your choice.'}</small></div></div> : <StateMessage title="Pick a Dungeon" copy="The server will return the authoritative readiness check." />}{selected ? <PanelButton primary disabled={busy} onClick={() => onRequest(`start dungeon ${selected.name}`, `/api/dungeons/${encodeURIComponent(selected.id)}/start-shared`, { method: 'POST' })} testId={`dungeon-start-${selected.id}`}>Enter Dungeon</PanelButton> : null}</RichCard>;
}

export function WorldPanel({ dashboard, onCommand }) {
  const world = dashboard?.world || {};
  const clears = Number(world.frayedHollowClears ?? world.clears ?? 0) || 0;
  const target = Number(world.target ?? world.clearTarget ?? 1) || 1;
  const achievements = dashboard?.achievements || [];
  return <RichCard kind="world" kicker="YOUR VIEW · /world" title={world.arcName || world.name || 'Living World'} subtitle="Shared progression and durable milestones from the same authoritative state." testId="world-rich-card"><div className="shell-world-hero"><span className="shell-world-sigil">◎</span><div><span className="shell-kicker">ACTIVE WORLD ARC</span><strong>{world.arcName || world.name || 'The First Unraveling'}</strong><small>{clears}/{target} Dungeon clear{target === 1 ? '' : 's'} toward the current world milestone.</small></div></div><ProgressBar value={clears} max={target} label="World progress" tone="purple" /><section className="shell-achievement-list"><div className="shell-section-heading"><span className="shell-kicker">YOUR MILESTONES</span><button type="button" onClick={() => onCommand('codex')}>Codex ↗</button></div>{achievements.length ? achievements.slice(-5).reverse().map((achievement) => <div className="shell-achievement-row" key={achievement.id || achievement.name}><span>✦</span><div><strong>{achievement.name}</strong><small>{achievement.description}</small></div></div>) : <p className="shell-muted-copy">Your first achievements will appear here.</p>}</section><div className="shell-card-actions"><PanelButton primary onClick={() => onCommand('adventure')}>Adventure</PanelButton><PanelButton onClick={() => onCommand('dungeon')}>Dungeon</PanelButton></div></RichCard>;
}

export function HoneyPanel({ dashboard, onRequest, busy = false }) {
  const local = dashboard?.authSource === 'local' || dashboard?.wallet?.unavailable;
  const balance = dashboard?.wallet?.balance ?? '—';
  return <RichCard kind="honey" kicker="YOUR VIEW · /honey" title="Honey Wallet" subtitle={local ? 'Owned by Threaded; unavailable in standalone local mode.' : 'Threaded-authoritative premium wallet.'} testId="honey-rich-card"><div className="shell-honey-balance"><span>BALANCE</span><strong data-testid="stream-honey-balance">{local ? '—' : balance}</strong><small>Honey stays outside local game economy rules.</small></div>{local ? <StateMessage title="Connect through Threaded" copy="Threadbound will not mint Honey locally. The wallet remains authoritative in Threaded." /> : <div className="shell-card-actions"><PanelButton primary disabled={busy} onClick={() => onRequest('buy training cache', '/api/honey/purchases/training-cache', { method: 'POST', headers: { 'Idempotency-Key': commandKey('shell-honey') } })} testId="stream-buy-training-cache">Buy Training Cache · 25 Honey</PanelButton></div>}</RichCard>;
}

function GamblingResult({ data, type, onCommand, busy }) {
  const result = data?.[type];
  const outcome = result?.[type === 'coinflip' ? 'flip' : 'spin'];
  if (!outcome) return <StateMessage title={`${type === 'coinflip' ? 'Coinflip' : 'Slots'} is ready`} copy={`Type ${type} <wager>${type === 'coinflip' ? ' heads or tails' : ''} to play with carried Gold.`} />;
  const isCoinflip = type === 'coinflip';
  const reels = outcome.reels || [];
  const delta = gamblingDelta(outcome);
  return <section className={`shell-gambling-surface shell-${type}-surface`} data-testid={`shell-${type}-result`}>
    <div className="shell-gambling-balance"><span>{isCoinflip ? 'COINFLIP' : 'SLOTS'} · RESULT</span><strong>{result.carriedGold ?? 0} Gold carried</strong></div>
    <GamblingOutcomeBanner outcome={outcome.outcome} delta={delta} />
    {isCoinflip ? <div className="shell-game-result"><span className="shell-game-result__symbol">{outcome.result === 'heads' ? '◐' : '◑'}</span><div><strong>{compactText(outcome.outcome, 'resolved')}</strong><p>Called {outcome.choice} · landed {outcome.result}</p></div></div> : <div className="shell-slot-reels">{reels.map((reel, index) => <span key={`${reel}-${index}`}>{reel}</span>)}</div>}
    <div className="shell-gambling-meta"><span>Wager <strong>{outcome.wager} Gold</strong></span><span>Outcome <strong>{compactText(outcome.outcome, 'resolved')}</strong> · payout <strong>{outcome.payoutGold ?? 0} Gold</strong></span></div>
    <div className="shell-card-actions"><PanelButton primary disabled={busy} onClick={() => onCommand(type)} testId={`shell-${type}-again`}>Play again</PanelButton><PanelButton disabled={busy} onClick={() => onCommand('gambling')}>All games</PanelButton></div>
  </section>;
}

export function GamblingPanel({ data, onCommand, busy = false }) {
  const game = data?.game || 'games';
  return <RichCard kind="gambling" kicker="YOUR VIEW · /gambling" title="Gold Games" subtitle="Every wager and result is resolved by the server; this card only renders the returned state." testId="gambling-rich-card">
    {game === 'blackjack' ? <StateMessage title="Blackjack lives in the shared thread" copy="The public table is rendered from the latest Blackjack receipt above. Only the hand owner receives Hit and Stand controls." /> : null}
    {game === 'coinflip' ? <GamblingResult data={data} type="coinflip" onCommand={onCommand} busy={busy} /> : null}
    {game === 'slots' ? <GamblingResult data={data} type="slots" onCommand={onCommand} busy={busy} /> : null}
    {game === 'games' ? <><div className="shell-gambling-intro"><span className="shell-gambling-mark">✦</span><div><strong>Choose a Gold game</strong><p>Blackjack, Coinflip, and Slots use only carried Gold. No separate game screen is required.</p></div></div><div className="shell-game-list"><button type="button" onClick={() => onCommand('blackjack')} disabled={busy}><strong>Blackjack</strong><span>Deal a hand · hit or stand</span><b>›</b></button><button type="button" onClick={() => onCommand('coinflip')} disabled={busy}><strong>Coinflip</strong><span>Call heads or tails</span><b>›</b></button><button type="button" onClick={() => onCommand('slots')} disabled={busy}><strong>Slots</strong><span>Spin three reels</span><b>›</b></button></div></> : null}
  </RichCard>;
}

function guildHallFromAreas(areas) {
  return (areas?.towns || []).find((town) => town.guildHall?.leaderboard)?.guildHall || null;
}

function leaderboardMetric(label, value) {
  return <span key={label}>{label} <strong>{value ?? 0}</strong></span>;
}

function SimulatedProfile({ entry, assets }) {
  const record = entry.duelRecord || { wins: 0, losses: 0, draws: 0 };
  const equipment = Object.entries(entry.equipment || {});
  const recent = entry.history?.recent || [];
  return <section className="shell-leaderboard-profile" data-testid="shell-simulated-profile"><div className="shell-leaderboard-profile__hero"><AssetThumb entity={entry} assets={assets} kinds={['character', 'npc']} alt="" className="shell-leaderboard-profile__avatar" /><div><span className="shell-kicker">SIMULATED ADVENTURER</span><strong data-testid="shell-profile-name">{entry.name}</strong><small>{entry.personality || entry.note || 'Guild Hall adventurer'}</small></div></div><div className="shell-leaderboard-stats"><Stat label="Level" value={entry.level} /><Stat label="Area" value={entry.highestUnlockedAreaNumber} /><Stat label="Attack" value={entry.stats?.attack ?? 0} tone="blue" /><Stat label="Defense" value={entry.stats?.defense ?? 0} /><Stat label="Duels" value={`${record.wins}-${record.losses}-${record.draws}`} tone="gold" /></div><div className="shell-leaderboard-detail"><span className="shell-kicker">EQUIPMENT</span>{equipment.length ? equipment.map(([slot, item]) => <div key={slot}><span>{slot}</span><strong>{item?.name || 'Empty'}</strong></div>) : <p className="shell-muted-copy">No equipment recorded.</p>}</div>{recent.length ? <div className="shell-leaderboard-detail"><span className="shell-kicker">RECENT HISTORY</span>{recent.slice(0, 5).map((item, index) => <div key={`${item.type}-${item.occurredAt || index}`}><span>{item.type}</span><strong>{item.outcome || `+${item.experienceAward || 0} XP`}</strong></div>)}</div> : null}</section>;
}

export function LeaderboardPanel({ areas, assets, profileQuery = '', onRequest, busy = false }) {
  const [selected, setSelected] = useState(null);
  const [latestDuel, setLatestDuel] = useState(null);
  const guildHall = guildHallFromAreas(areas);
  if (!guildHall) return <RichCard kind="leaderboard" kicker="GUILD HALL · /leaderboard" title="Leaderboard"><StateMessage title="Guild Hall unavailable" copy="Open an Area with a Guild Hall to read the server-ranked roster." /></RichCard>;
  const entries = guildHall.leaderboard || [];
  const queriedProfile = profileQuery ? entries.find((entry) => [entry.id, entry.name].some((value) => String(value || '').trim().toLowerCase() === profileQuery.trim().toLowerCase() && entry.isSimulated)) : null;
  const visibleProfile = selected || queriedProfile;
  const duel = async (entry) => {
    const payload = await onRequest(`duel ${entry.name}`, `/api/duels/${encodeURIComponent(entry.id)}`, { method: 'POST', headers: { 'Idempotency-Key': commandKey(`shell-duel-${entry.id}`) } });
    if (payload?.duel) setLatestDuel(payload.duel);
  };
  const inspect = async (entry) => {
    const payload = await onRequest(`profile ${entry.name}`, '/api/areas');
    if (payload) setSelected(entry);
  };
  return <RichCard kind="leaderboard" kicker="YOUR VIEW · /leaderboard" title="Leaderboard" subtitle={`${guildHall.name || 'Guild Hall'} standings · ranked by persisted progression`} testId="leaderboard-rich-card"><div className="shell-leaderboard-list" data-testid="leaderboard-list">{entries.map((entry) => <article className="shell-leaderboard-row" key={entry.id} data-testid={`leaderboard-row-${entry.id}`}><span className="shell-leaderboard-place">#{entry.placement}</span><AssetThumb entity={entry} assets={assets} kinds={['character', 'npc']} alt={`${entry.name} portrait`} className="shell-leaderboard-avatar" /><div className="shell-leaderboard-copy"><div className="shell-leaderboard-name"><strong>{entry.name}</strong><span>{entry.isSimulated ? 'Simulated' : 'Player'}</span>{entry.strongRival ? <em>Veteran rival</em> : null}</div><div className="shell-leaderboard-metrics">{leaderboardMetric('Lv', entry.level)}{leaderboardMetric('Hunts', entry.huntCount)}{leaderboardMetric('Area', entry.highestUnlockedAreaNumber)}{leaderboardMetric('Achievements', entry.achievementCount)}</div><div className="shell-leaderboard-metrics">{leaderboardMetric('ATK', entry.power?.attack)}{leaderboardMetric('DEF', entry.power?.defense)}{leaderboardMetric('Gear', `${entry.power?.equippedCount || 0}/5`)}</div></div>{entry.isSimulated ? <div className="shell-leaderboard-actions" aria-label={`${entry.name} actions`}><PanelButton disabled={busy} onClick={() => selected?.id === entry.id ? setSelected(null) : inspect(entry)} testId={`leaderboard-profile-${entry.id}`}>Profile</PanelButton><PanelButton primary disabled={busy} onClick={() => duel(entry)} testId={`leaderboard-duel-${entry.id}`}>{entry.strongRival ? 'Duel rival' : 'Duel'}</PanelButton></div> : null}</article>)}</div>{visibleProfile ? <SimulatedProfile entry={visibleProfile} assets={assets} /> : null}{latestDuel ? <section className="shell-duel-result" data-testid="shell-duel-result"><span className="shell-kicker">DUEL RECEIPT</span><strong>{latestDuel.battle?.receipt?.headline || 'Duel resolved'}</strong><p>{latestDuel.opponent?.name || 'Opponent'} · Record {latestDuel.record?.wins || 0}-{latestDuel.record?.losses || 0}-{latestDuel.record?.draws || 0}</p><PanelButton onClick={() => setLatestDuel(null)}>Dismiss</PanelButton></section> : null}<p className="shell-muted-copy">Placement uses persisted Level, XP, Area, Hunts, achievements, equipment, and authoritative Duel records.</p></RichCard>;
}

export function QuestPanel({ quests, onRequest, busy = false }) {
  if (!quests) return <RichCard kind="quest" kicker="QUESTS"><StateMessage title="Quest board unavailable" copy="The current Area Quest could not be loaded." /></RichCard>;
  const list = quests.quests || [];
  return <RichCard kind="quest" kicker="YOUR VIEW · /quest" title="Quest Board" subtitle={`${quests.currentArea?.name || 'Current Area'} · progress is tracked by the server`} testId="quest-rich-card">{list.length ? <div className="shell-quest-list">{list.map((quest) => <article className="shell-quest-row" key={quest.id} data-testid="quest-row"><div className="shell-quest-heading"><div><span className="shell-kicker">{quest.state}</span><h3>{quest.title}</h3></div><span className={`quest-state quest-state--${quest.state}`}>{quest.state}</span></div><p>{quest.description || quest.summary || 'Complete the objectives in this Area.'}</p><ul>{(quest.objectives || []).map((objective) => { const current = objective.current ?? objective.progress ?? 0; const required = objective.required ?? objective.target ?? 1; return <li key={objective.id || objective.label}><span>{objective.label || objective.type}</span><strong data-testid={`quest-objective-${objective.id || objective.type}`}>{current}/{required}</strong></li>; })}</ul><div className="shell-card-actions">{quest.state === 'available' ? <PanelButton primary disabled={busy} onClick={() => onRequest(`accept quest ${quest.title}`, `/api/quests/${encodeURIComponent(quest.id)}/accept`, { method: 'POST' })}>Accept Quest</PanelButton> : null}{quest.state === 'claimable' ? <PanelButton primary disabled={busy} onClick={() => onRequest(`claim quest ${quest.title}`, `/api/quests/${encodeURIComponent(quest.id)}/claim`, { method: 'POST' })}>Claim Reward</PanelButton> : null}</div></article>)}</div> : <StateMessage title="No Quest in this Area" copy="Travel to another unlocked Area when the thread opens it." />}</RichCard>;
}

export function AreaPanel({ areas, onRequest, busy = false }) {
  const [interaction, setInteraction] = useState(null);
  if (!areas) return <RichCard kind="area" kicker="AREAS"><StateMessage title="Area map unavailable" copy="The world position could not be loaded." /></RichCard>;
  const area = areas;
  return <RichCard kind="area" kicker="YOUR VIEW · /area" title={area.currentArea?.name || 'Area'} subtitle={`${area.towns?.length || 0} Town${area.towns?.length === 1 ? '' : 's'} · ${area.highestUnlockedAreaNumber || 1} Area${area.highestUnlockedAreaNumber === 1 ? '' : 's'} unlocked`} testId="area-rich-card"><div className="shell-area-list">{(area.areas || []).map((candidate) => <div className={`shell-area-row${candidate.current ? ' is-current' : ''}`} key={candidate.id}><div><span className="shell-kicker">AREA {candidate.number}</span><strong>{candidate.name}</strong></div>{candidate.current ? <span className="shell-current-badge">CURRENT</span> : <PanelButton disabled={busy} onClick={() => onRequest(`travel to ${candidate.name}`, `/api/areas/${candidate.number}/travel`, { method: 'POST' })}>Travel</PanelButton>}</div>)}</div><div className="shell-town-list"><span className="shell-kicker">TOWNS IN THIS AREA</span>{(area.towns || []).map((town) => <article key={town.id}><div><strong>{town.name}</strong><small>{town.tagline || 'A place to recover and resupply.'}</small></div><div className="shell-town-actions">{(town.npcs || []).slice(0, 2).map((npc) => <PanelButton key={npc.id} disabled={busy} onClick={async () => { const payload = await onRequest(`talk to ${npc.name}`, `/api/towns/${encodeURIComponent(town.id)}/npcs/${encodeURIComponent(npc.id)}/interact`, { method: 'POST' }); if (payload?.interaction) setInteraction(payload.interaction); }}>{npc.name}</PanelButton>)}</div></article>)}</div>{interaction ? <div className="shell-interaction"><span className="shell-kicker">TOWN RECEIPT</span><strong>{interaction.npcName || interaction.npc?.name || 'Town NPC'}</strong><p>{interaction.text || interaction.message || interaction.description || 'The conversation was recorded in the Adventure Stream.'}</p></div> : null}</RichCard>;
}

export function CodexPanel() {
  return <RichCard kind="codex" kicker="LIVING CODEX · /codex" title="Codex" subtitle="The full reference remains available without leaving the product shell."><StateMessage title="Open the Living Codex" copy="Rules, Areas, NPCs, Monsters, and Equipment stay in their focused reference view." action={<a className="shell-button shell-button--primary" href="/codex">Open Codex ↗</a>} /></RichCard>;
}

export function renderGameplayPanel({ panel, dashboard, assets, areas, quests, shop, onRequest, onCommand, busy }) {
  const props = { dashboard, assets, areas, quests, shop, onRequest, onCommand, busy };
  switch (panel?.kind) {
    case 'help': return <HelpPanel {...props} />;
    case 'status': return null;
    case 'inventory': return null;
    case 'shop': return null;
    case 'bank': return <ShopPanel {...props} bankOnly />;
    case 'party': return <PartyPanel {...props} />;
    case 'dungeon': return <DungeonPanel {...props} />;
    case 'hunt': return null;
    case 'adventure': return null;
    case 'world': return <WorldPanel {...props} />;
    case 'honey': return <HoneyPanel {...props} />;
    case 'gambling': return <GamblingPanel {...props} data={panel.data} />;
    case 'leaderboard': return <LeaderboardPanel {...props} profileQuery={panel.data?.profileQuery} />;
    case 'quest': return <QuestPanel {...props} />;
    case 'area': return <AreaPanel {...props} areas={areas} />;
    case 'codex': return <CodexPanel {...props} />;
    default: return null;
  }
}
