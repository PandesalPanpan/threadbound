import { BlackjackService } from './application/BlackjackService.js';
import { CoinflipService } from './application/CoinflipService.js';
import { SlotsService } from './application/SlotsService.js';
import { SQLiteActivityStreamRepository } from './infrastructure/SQLiteActivityStreamRepository.js';

function idempotencyKey(request) {
  return String(request.get('Idempotency-Key') || '').trim();
}

function titleize(value) {
  const text = String(value || '').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function goldDelta({ wager, payoutGold }) {
  return Number(payoutGold || 0) - Number(wager || 0);
}

function deltaText(delta) {
  if (delta > 0) return `+${delta} Gold`;
  if (delta < 0) return `−${Math.abs(delta)} Gold`;
  return '±0 Gold';
}

function blackjackReceipt(playerName, result, action) {
  const round = result.round;
  const dealer = `${round.dealerScore}${round.dealerHiddenCardCount ? ' + hidden' : ''}`;
  if (round.status === 'active') {
    return `${playerName} played Blackjack · ${titleize(action)} · ${round.wager} Gold wager · Hand ${round.playerScore} · Dealer ${dealer}.`;
  }
  const delta = goldDelta(round);
  return `${playerName} played Blackjack · ${titleize(round.outcome)} · Hand ${round.playerScore} vs Dealer ${round.dealerScore} · ${deltaText(delta)} · ${result.carriedGold} carried Gold.`;
}

function coinflipReceipt(playerName, result) {
  const flip = result.flip;
  const delta = goldDelta(flip);
  return `${playerName} played Coinflip · Called ${titleize(flip.choice)} · ${titleize(flip.result)} · ${titleize(flip.outcome)} · ${deltaText(delta)} · ${result.carriedGold} carried Gold.`;
}

function slotsReceipt(playerName, result) {
  const spin = result.spin;
  const delta = goldDelta(spin);
  const reels = spin.reels.map(titleize).join(' · ');
  return `${playerName} played Slots · ${reels} · ${titleize(spin.outcome)} · ${deltaText(delta)} · ${result.carriedGold} carried Gold.`;
}

function statusFor(error) {
  const code = String(error?.code || '');
  if (code.includes('not_found')) return 404;
  if (code.startsWith('invalid_')) return 422;
  if (code.includes('insufficient') || code.includes('active') || code.includes('resolved') || code.includes('replay_mismatch')) return 409;
  return 500;
}

export function installGamblingRoutes(app, { repository }) {
  if (!app) throw new Error('installGamblingRoutes requires an Express app.');
  if (!repository) throw new Error('installGamblingRoutes requires the game repository.');

  const blackjack = new BlackjackService({ repository });
  const coinflip = new CoinflipService({ repository });
  const slots = new SlotsService({ repository });
  const streamRepository = new SQLiteActivityStreamRepository({ database: repository.db });

  const requireConnection = (request, response, next) => {
    if (!request.session?.threaded?.playerId) {
      return response.status(401).json({ error: 'identity_not_connected', message: 'Sign in to Threadbound first.' });
    }
    return next();
  };

  const record = (request, eventType, body, metadata) => {
    const playerId = request.session.threaded.playerId;
    const entry = streamRepository.append({
      kind: 'system',
      eventType,
      actorPlayerId: playerId,
      actorName: 'THREADBOUND',
      body,
      metadata: { playerId, ...metadata },
    });
    app.locals.realtimeHub?.broadcast({ type: 'stream_entry', entry });
    app.locals.realtimeHub?.broadcast({ type: 'state_changed', eventType }, { playerIds: [playerId] });
    return entry;
  };

  const respond = (handler) => (request, response) => {
    try {
      return handler(request, response);
    } catch (error) {
      const status = statusFor(error);
      return response.status(status).json({
        error: error?.code || (status === 500 ? 'internal_error' : 'game_rule_violation'),
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  app.get('/api/gambling', requireConnection, respond((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    return response.json({ blackjack: blackjack.browse(request.session.threaded.playerId) });
  }));

  app.post('/api/gambling/blackjack', requireConnection, respond((request, response) => {
    const playerId = request.session.threaded.playerId;
    const result = blackjack.start(playerId, request.body?.wager, { idempotencyKey: idempotencyKey(request) });
    let entry = null;
    if (!result.replayed) {
      const playerName = repository.getPlayer(playerId)?.displayName || 'Adventurer';
      entry = record(request, 'BlackjackPlayed', blackjackReceipt(playerName, result, 'deal'), {
        game: 'blackjack', action: 'deal', round: result.round, carriedGold: result.carriedGold,
      });
    }
    return response.status(201).json({ blackjack: result, entry });
  }));

  for (const action of ['hit', 'stand']) {
    app.post(`/api/gambling/blackjack/:roundId/${action}`, requireConnection, respond((request, response) => {
      const playerId = request.session.threaded.playerId;
      const result = blackjack[action](playerId, request.params.roundId, { idempotencyKey: idempotencyKey(request) });
      let entry = null;
      if (!result.replayed) {
        const playerName = repository.getPlayer(playerId)?.displayName || 'Adventurer';
        entry = record(request, 'BlackjackPlayed', blackjackReceipt(playerName, result, action), {
          game: 'blackjack', action, round: result.round, carriedGold: result.carriedGold,
        });
      }
      return response.json({ blackjack: result, entry });
    }));
  }

  app.post('/api/gambling/coinflip', requireConnection, respond((request, response) => {
    const playerId = request.session.threaded.playerId;
    const result = coinflip.flip(playerId, request.body?.wager, request.body?.choice, { idempotencyKey: idempotencyKey(request) });
    let entry = null;
    if (!result.replayed) {
      const playerName = repository.getPlayer(playerId)?.displayName || 'Adventurer';
      entry = record(request, 'CoinflipPlayed', coinflipReceipt(playerName, result), {
        game: 'coinflip', flip: result.flip, carriedGold: result.carriedGold,
      });
    }
    return response.status(201).json({ coinflip: result, entry });
  }));

  app.post('/api/gambling/slots', requireConnection, respond((request, response) => {
    const playerId = request.session.threaded.playerId;
    const result = slots.spin(playerId, request.body?.wager, { idempotencyKey: idempotencyKey(request) });
    let entry = null;
    if (!result.replayed) {
      const playerName = repository.getPlayer(playerId)?.displayName || 'Adventurer';
      entry = record(request, 'SlotsPlayed', slotsReceipt(playerName, result), {
        game: 'slots', spin: result.spin, carriedGold: result.carriedGold,
      });
    }
    return response.status(201).json({ slots: result, entry });
  }));
}
