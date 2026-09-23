import { areaContentForNumber } from '../content/AreaContentCatalog.js';

export const STARTING_AREA_NUMBER = 1;

function requireAreaNumber(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < STARTING_AREA_NUMBER) {
    throw new Error(`${label} must be an integer of at least ${STARTING_AREA_NUMBER}.`);
  }
  return number;
}

export function areaIdForNumber(areaNumber) {
  return `area-${requireAreaNumber(areaNumber, 'Area number')}`;
}

export function projectArea(areaNumber) {
  const number = requireAreaNumber(areaNumber, 'Area number');
  let content = null;
  try { content = areaContentForNumber(number); } catch (error) {
    if (error.code !== 'area_content_unavailable') throw error;
  }
  return Object.freeze({
    id: areaIdForNumber(number),
    number,
    name: content?.name || `Area ${number}`,
  });
}

/**
 * Player-owned world position for the ordered Area progression foundation.
 *
 * Durable position and unlock state stays separate from authored Area content.
 * The contiguous unlock path means highest unlocked Area is sufficient to
 * prove which earlier Areas a player can visit.
 */
export class AreaProgression {
  constructor({ currentAreaNumber = STARTING_AREA_NUMBER, highestUnlockedAreaNumber = STARTING_AREA_NUMBER } = {}) {
    this.currentAreaNumber = requireAreaNumber(currentAreaNumber, 'Current Area');
    this.highestUnlockedAreaNumber = requireAreaNumber(highestUnlockedAreaNumber, 'Highest unlocked Area');
    if (this.currentAreaNumber > this.highestUnlockedAreaNumber) {
      throw new Error('Current Area cannot be above the highest unlocked Area.');
    }
  }

  canVisit(areaNumber) {
    const number = requireAreaNumber(areaNumber, 'Area number');
    return number <= this.highestUnlockedAreaNumber;
  }

  withCurrentArea(areaNumber) {
    const number = requireAreaNumber(areaNumber, 'Current Area');
    if (!this.canVisit(number)) throw new Error('Cannot move to an Area that is not unlocked.');
    return new AreaProgression({
      currentAreaNumber: number,
      highestUnlockedAreaNumber: this.highestUnlockedAreaNumber,
    });
  }

  withHighestUnlockedArea(areaNumber) {
    const number = requireAreaNumber(areaNumber, 'Highest unlocked Area');
    if (number < this.highestUnlockedAreaNumber) {
      throw new Error('Highest unlocked Area cannot move backwards.');
    }
    return new AreaProgression({
      currentAreaNumber: this.currentAreaNumber,
      highestUnlockedAreaNumber: number,
    });
  }

  toJSON() {
    return Object.freeze({
      currentAreaNumber: this.currentAreaNumber,
      highestUnlockedAreaNumber: this.highestUnlockedAreaNumber,
      currentArea: projectArea(this.currentAreaNumber),
      highestUnlockedArea: projectArea(this.highestUnlockedAreaNumber),
    });
  }
}
