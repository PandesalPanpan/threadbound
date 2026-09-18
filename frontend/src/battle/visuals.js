export const FIGMA_BATTLE_FILE_KEY = 'xfAbc94dv0LxhxhC9q9BhK';
export const FIGMA_BATTLE_PAGE_NODE_ID = '91:2';

export const BATTLE_FIGMA_ASSET_IDS = Object.freeze({
  'bramble-druid': 'character.bramble-druid-figma.v1',
  'iron-vanguard': 'character.iron-vanguard-figma.v1',
  'rune-bard': 'character.rune-bard-figma.v1',
  'cinder-imp': 'mob.cinder-imp-figma.v1',
  'rot-toad': 'mob.rot-toad-figma.v1',
  'gloom-hound': 'mob.gloom-hound-figma.v1',
});

export const BATTLE_FIGMA_NODE_IDS = Object.freeze({
  'bramble-druid': '112:7',
  'iron-vanguard': '112:12',
  'rune-bard': '112:17',
  'cinder-imp': '112:22',
  'rot-toad': '112:27',
  'gloom-hound': '112:32',
});

export const BATTLE_UNIT_REGISTRY = Object.freeze({
  'bramble-druid': Object.freeze({ key: 'bramble-druid', name: 'Bramble Druid', team: 'players', role: 'WEAVER', assetId: BATTLE_FIGMA_ASSET_IDS['bramble-druid'], sourceNodeId: BATTLE_FIGMA_NODE_IDS['bramble-druid'] }),
  'rune-bard': Object.freeze({ key: 'rune-bard', name: 'Rune Bard', team: 'players', role: 'WEAVER', assetId: BATTLE_FIGMA_ASSET_IDS['rune-bard'], sourceNodeId: BATTLE_FIGMA_NODE_IDS['rune-bard'] }),
  'iron-vanguard': Object.freeze({ key: 'iron-vanguard', name: 'Iron Vanguard', team: 'players', role: 'WEAVER', assetId: BATTLE_FIGMA_ASSET_IDS['iron-vanguard'], sourceNodeId: BATTLE_FIGMA_NODE_IDS['iron-vanguard'] }),
  'cinder-imp': Object.freeze({ key: 'cinder-imp', name: 'Cinder Imp', team: 'enemies', role: 'ENEMY', assetId: BATTLE_FIGMA_ASSET_IDS['cinder-imp'], sourceNodeId: BATTLE_FIGMA_NODE_IDS['cinder-imp'] }),
  'rot-toad': Object.freeze({ key: 'rot-toad', name: 'Rot Toad', team: 'enemies', role: 'ENEMY', assetId: BATTLE_FIGMA_ASSET_IDS['rot-toad'], sourceNodeId: BATTLE_FIGMA_NODE_IDS['rot-toad'] }),
  'gloom-hound': Object.freeze({ key: 'gloom-hound', name: 'Gloom Hound', team: 'enemies', role: 'ENEMY', assetId: BATTLE_FIGMA_ASSET_IDS['gloom-hound'], sourceNodeId: BATTLE_FIGMA_NODE_IDS['gloom-hound'] }),
});

function registryKey(unit) {
  const visualAssetId = String(unit?.visualAssetId || '');
  const byAsset = Object.entries(BATTLE_FIGMA_ASSET_IDS).find(([, assetId]) => assetId === visualAssetId);
  if (byAsset) return byAsset[0];
  const value = String(unit?.name || unit?.id || '').toLowerCase();
  return Object.keys(BATTLE_UNIT_REGISTRY).find((key) => value.includes(key)) || null;
}

export function battleVisualAsset(unit, assets = []) {
  const key = registryKey(unit);
  const expectedId = String(unit?.visualAssetId || (key ? BATTLE_FIGMA_ASSET_IDS[key] : '')).trim();
  if (!expectedId) return null;
  return assets.find((asset) => asset.id === expectedId) || null;
}

export function presentBattleUnit(unit, assets = []) {
  if (!unit) return null;
  const key = registryKey(unit);
  const definition = key ? BATTLE_UNIT_REGISTRY[key] : null;
  return {
    ...unit,
    id: unit.id,
    label: unit.displayName || unit.name || definition?.name || unit.id,
    role: definition?.role || (unit.team === 'enemies' ? 'ENEMY' : 'WEAVER'),
    visualAssetId: unit.visualAssetId || definition?.assetId || null,
    sourceNodeId: definition?.sourceNodeId || null,
    asset: battleVisualAsset(unit, assets),
  };
}

export function presentBattleTeams(combatants = [], assets = []) {
  return {
    players: combatants.filter((unit) => unit.team === 'players').map((unit) => presentBattleUnit(unit, assets)),
    enemies: combatants.filter((unit) => unit.team === 'enemies').map((unit) => presentBattleUnit(unit, assets)),
  };
}
