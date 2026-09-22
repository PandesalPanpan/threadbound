import { compactText } from '../../shell/presentation.js';
import { PanelButton, StateMessage } from '../common/RichCard.jsx';

const CARD_SUITS = Object.freeze({ C: '♣', D: '♦', H: '♥', S: '♠' });

function PlayingCard({ code, hidden = false, testId }) {
  if (hidden) return <span className="shell-playing-card shell-playing-card--back" data-testid={testId} aria-label="Hidden dealer card">?</span>;
  const value = String(code || '').trim().toUpperCase();
  const rank = value.slice(0, -1) || '?';
  const suit = CARD_SUITS[value.slice(-1)] || '•';
  const red = value.endsWith('D') || value.endsWith('H');
  return <span className={`shell-playing-card${red ? ' is-red' : ''}`} data-testid={testId} data-card-code={value} aria-label={`${rank} ${suit}`}>{rank}<small>{suit}</small></span>;
}

function outcomeTone(round, active) {
  if (active) return 'is-neutral';
  const delta = Number(round?.payoutGold || 0) - Number(round?.wager || 0);
  return delta > 0 ? 'is-win' : delta < 0 ? 'is-loss' : 'is-push';
}

export function BlackjackSurface({ state, actorName = 'Player', canAct = false, onAction = () => {}, busy = false, testIdPrefix = 'shared-blackjack' }) {
  const round = state?.round || state || null;
  if (!round) return <StateMessage title="Blackjack is ready" copy="Type blackjack <wager> to deal a hand. Wagers use carried Gold." />;
  const active = round.status === 'active';
  const dealerCards = round.dealerHand || [];
  const delta = Number(round.payoutGold || 0) - Number(round.wager || 0);
  const tone = outcomeTone(round, active);
  const ownerPrompt = active && canAct ? 'Choose Hit or Stand' : active ? `${actorName} is choosing · view only` : 'This hand is resolved for everyone';
  return (
    <section className={`shell-gambling-surface shell-blackjack-surface shared-blackjack-surface ${active ? 'is-active' : 'is-result'}`} data-testid={`${testIdPrefix}-${active ? 'active' : 'result'}`} data-round-id={round.id || undefined}>
      <div className="shell-gambling-balance"><span>BLACKJACK · {active ? 'OPEN HAND' : 'RESULT'}</span><strong>{state?.carriedGold ?? 0} Gold carried</strong></div>
      <div className={`stream-outcome-banner shell-gambling-outcome ${tone}`}><span>{active ? 'LIVE HAND' : String(round.outcome || 'resolved').toUpperCase()}</span><strong>{active ? `${actorName}'s hand` : delta > 0 ? `${actorName} won` : delta < 0 ? `${actorName} lost` : 'Push'}</strong><b>{active ? `${round.wager} GOLD WAGER` : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)} GOLD`}</b></div>
      <div className="shell-blackjack-hands">
        <div className="shell-blackjack-hand"><div className="shell-gambling-label"><span>Dealer</span><strong>{round.dealerScore}{round.dealerHiddenCardCount ? '+' : ''}</strong></div><div className="shell-playing-card-row">{dealerCards.map((card, index) => <PlayingCard key={`${card}-${index}`} code={card} testId={`${testIdPrefix}-dealer-card-${index}`} />)}{Array.from({ length: round.dealerHiddenCardCount || 0 }, (_, index) => <PlayingCard key={`hidden-${index}`} hidden testId={`${testIdPrefix}-dealer-card-hidden-${index}`} />)}</div></div>
        <div className="shell-blackjack-hand"><div className="shell-gambling-label"><span>{canAct ? 'You' : actorName}</span><strong>{round.playerScore}</strong></div><div className="shell-playing-card-row">{(round.playerHand || []).map((card, index) => <PlayingCard key={`${card}-${index}`} code={card} testId={`${testIdPrefix}-player-card-${index}`} />)}</div></div>
      </div>
      <div className="shell-gambling-meta"><span>Wager <strong>{round.wager} Gold</strong></span><span>{active ? ownerPrompt : <>Outcome <strong>{compactText(round.outcome, 'resolved')}</strong> · payout <strong>{round.payoutGold ?? 0} Gold</strong></>}</span></div>
      {canAct ? <div className="shell-card-actions">{active ? <><PanelButton primary disabled={busy} onClick={() => onAction('hit')} testId={`${testIdPrefix}-hit`}>Hit</PanelButton><PanelButton disabled={busy} onClick={() => onAction('stand')} testId={`${testIdPrefix}-stand`}>Stand</PanelButton></> : <PanelButton primary disabled={busy} onClick={() => onAction('blackjack')} testId={`${testIdPrefix}-play`}>Deal another hand</PanelButton>}</div> : null}
    </section>
  );
}

export { PlayingCard };
