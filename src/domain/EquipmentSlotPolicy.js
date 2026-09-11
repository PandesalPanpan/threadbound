export const EQUIPMENT_SLOTS = Object.freeze(['weapon', 'helmet', 'armor', 'boots', 'accessory']);

export const EQUIPMENT_SLOT_LABELS = Object.freeze({
  weapon: 'Weapon',
  helmet: 'Helmet',
  armor: 'Armor',
  boots: 'Boots',
  accessory: 'Accessory',
});

export function normalizeEquipmentSlot(value) {
  const slot = String(value || '').trim().toLowerCase();
  if (!EQUIPMENT_SLOTS.includes(slot)) {
    const error = new Error(`Unknown equipment slot: ${value || '(empty)'}`);
    error.code = 'invalid_equipment_slot';
    throw error;
  }
  return slot;
}

export function emptyEquipmentLoadout() {
  return Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
}

export function publicEquipmentSlots() {
  return EQUIPMENT_SLOTS.map((id) => ({ id, label: EQUIPMENT_SLOT_LABELS[id] }));
}
