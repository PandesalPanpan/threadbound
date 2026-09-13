import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBlackjackAction,
  createBlackjackDeck,
  projectBlackjackRound,
  scoreBlackjackHand,
  startBlackjackRound,
} from '../src/domain/BlackjackPolicy.js';

test('Blackjack deck and hand scoring handle unique cards, face cards, and soft aces', () => {
  const deck = createBlackjackDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52);
  assert.deepEqual(scoreBlackjackHand(['AS', 'KH']), { total: 21, soft: true, blackjack: true, bust: false });
  assert.deepEqual(scoreBlackjackHand(['AS', 'AH', '9C']), { total: 21, soft: true, blackjack: false, bust: false });
  assert.deepEqual(scoreBlackjackHand(['KS', 'QH', '2C']), { total: 22, soft: false, blackjack: false, bust: true });
});

test('stand resolves dealer play authoritatively and projects the hole card only after resolution', () => {
  const round = startBlackjackRound({
    id: 'round-stand',
    playerId: 'player-a',
    wager: 10,
    deck: ['10H', '6S', '7C', '9D', '5H'],
  });
  const active = projectBlackjackRound(round);
  assert.equal(active.status, 'active');
  assert.deepEqual(active.playerHand, ['10H', '7C']);
  assert.deepEqual(active.dealerHand, ['6S']);
  assert.equal(active.dealerHiddenCardCount, 1);

  const settled = applyBlackjackAction(round, 'stand');
  assert.equal(settled.status, 'resolved');
  assert.equal(settled.outcome, 'loss');
  assert.deepEqual(settled.dealerHand, ['6S', '9D', '5H']);
  assert.equal(settled.payoutGold, 0);
  const visible = projectBlackjackRound(settled);
  assert.deepEqual(visible.dealerHand, ['6S', '9D', '5H']);
  assert.equal(visible.dealerHiddenCardCount, 0);
});

test('hit to 21 auto-settles the dealer and credits the standard even-money settlement', () => {
  const round = startBlackjackRound({
    id: 'round-hit',
    playerId: 'player-a',
    wager: 10,
    deck: ['10H', '9S', '6C', '7D', '5H', '10C'],
  });
  const settled = applyBlackjackAction(round, 'hit');
  assert.deepEqual(settled.playerHand, ['10H', '6C', '5H']);
  assert.equal(settled.outcome, 'win');
  assert.equal(settled.payoutGold, 20);
  assert.equal(scoreBlackjackHand(settled.dealerHand).bust, true);
});

test('natural Blackjack resolves on the deal and a mutual natural pushes', () => {
  const win = startBlackjackRound({
    id: 'natural-win',
    playerId: 'player-a',
    wager: 8,
    deck: ['AH', '9S', 'KC', '7D'],
  });
  assert.equal(win.status, 'resolved');
  assert.equal(win.outcome, 'win');
  assert.equal(win.payoutGold, 16);

  const push = startBlackjackRound({
    id: 'natural-push',
    playerId: 'player-a',
    wager: 8,
    deck: ['AH', 'AS', 'KC', 'KH'],
  });
  assert.equal(push.status, 'resolved');
  assert.equal(push.outcome, 'push');
  assert.equal(push.payoutGold, 8);
});
