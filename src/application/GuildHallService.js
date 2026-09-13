import { guildHallPopulationForTown } from '../content/FoundationGuildHallCatalog.js';

function projectEntry(entry, state) {
  const adventurer = state.adventurer;
  return Object.freeze({
    id: adventurer.id,
    name: adventurer.name,
    level: adventurer.level,
    experience: adventurer.experience,
    highestUnlockedAreaNumber: adventurer.highestUnlockedAreaNumber,
    huntCount: adventurer.huntCount,
    adventureCount: adventurer.adventureCount,
    activityProfile: adventurer.activityProfile,
    strongRival: entry.strongRival,
    note: entry.note,
    spriteVariant: entry.spriteVariant,
  });
}

/**
 * Service Layer boundary for a Town Guild Hall roster.
 *
 * The catalog owns stable roster membership. The simulated-adventurer repository
 * owns persistent progression. `ensure` creates missing catalog adventurers once
 * and never overwrites their later simulated progression on subsequent Town reads.
 */
export class GuildHallService {
  constructor({ repository, populationCatalog = guildHallPopulationForTown, nowFactory = () => new Date() } = {}) {
    if (!repository) throw new Error('GuildHallService requires a simulated-adventurer repository.');
    this.repository = repository;
    this.populationCatalog = populationCatalog;
    this.nowFactory = nowFactory;
  }

  browse(townId) {
    const normalizedTownId = String(townId || '').trim().toLowerCase();
    const entries = this.populationCatalog(normalizedTownId);
    const initializedAt = this.nowFactory().toISOString();
    const adventurers = entries.map((entry) => {
      const state = this.repository.ensure(entry.adventurer, { lastSimulatedAt: initializedAt });
      return projectEntry(entry, state);
    });

    return Object.freeze({
      townId: normalizedTownId,
      name: 'Guild Hall',
      adventurers: Object.freeze(adventurers),
    });
  }
}
