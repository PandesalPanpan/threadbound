import { projectArea } from './AreaProgression.js';

export const TOWN_SERVICE_TYPES = Object.freeze([
  'shop',
  'upgrade',
  'bank',
  'heal',
  'quest',
  'cook',
  'craft',
  'guild_hall',
]);

const SERVICE_TYPES = new Set(TOWN_SERVICE_TYPES);
const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requireStableId(value, label) {
  const id = String(value || '').trim();
  if (!STABLE_ID.test(id)) throw new Error(`${label} must be a stable kebab-case id.`);
  return id;
}

function requireName(value) {
  const name = String(value || '').trim();
  if (!name) throw new Error('Town name is required.');
  return name;
}

function uniqueValues(values, label, normalize) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array.`);
  const normalized = values.map(normalize);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicates.`);
  return Object.freeze(normalized);
}

function requireService(value) {
  const service = String(value || '').trim().toLowerCase();
  if (!SERVICE_TYPES.has(service)) throw new Error(`Unsupported Town service: ${service || '(empty)'}.`);
  return service;
}

/**
 * Immutable world-content model for an Area-owned Town hub.
 *
 * Town owns stable hub identity and references to the services/NPC identities that
 * later presentation and interaction milestones may project. It does not own
 * player position, economy transactions, dialogue state, or browser behavior.
 */
export class Town {
  constructor({ id, name, areaNumber, services = [], npcIds = [] } = {}) {
    this.id = requireStableId(id, 'Town id');
    this.name = requireName(name);
    this.area = projectArea(areaNumber);
    this.areaNumber = this.area.number;
    this.services = uniqueValues(services, 'Town services', requireService);
    this.npcIds = uniqueValues(npcIds, 'Town NPC ids', (value) => requireStableId(value, 'Town NPC id'));
    Object.freeze(this);
  }

  hasService(service) {
    return this.services.includes(String(service || '').trim().toLowerCase());
  }

  toJSON() {
    return Object.freeze({
      id: this.id,
      name: this.name,
      area: this.area,
      areaNumber: this.areaNumber,
      services: this.services,
      npcIds: this.npcIds,
    });
  }
}
