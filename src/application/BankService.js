import { SQLiteBankRepository } from '../infrastructure/SQLiteBankRepository.js';

export class BankService {
  constructor({ repository, eventBus, bankRepository = null }) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.bankRepository = bankRepository || new SQLiteBankRepository({ database: repository.db });
  }

  browse(playerId) {
    const player = this.repository.getPlayer(playerId);
    if (!player) throw new Error('Player not found.');
    return this.bankRepository.getBalance(playerId);
  }

  deposit(playerId, amount) {
    const before = this.bankRepository.getBalance(playerId);
    const balance = this.bankRepository.deposit(playerId, amount);
    const moved = before.carriedGold - balance.carriedGold;
    this.eventBus.publish({ type: 'GoldDeposited', playerId, amount: moved, ...balance });
    return { action: 'deposit', amount: moved, ...balance };
  }

  withdraw(playerId, amount) {
    const before = this.bankRepository.getBalance(playerId);
    const balance = this.bankRepository.withdraw(playerId, amount);
    const moved = balance.carriedGold - before.carriedGold;
    this.eventBus.publish({ type: 'GoldWithdrawn', playerId, amount: moved, ...balance });
    return { action: 'withdraw', amount: moved, ...balance };
  }
}
