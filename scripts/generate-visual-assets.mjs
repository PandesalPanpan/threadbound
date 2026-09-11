import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public', 'assets', 'generated');
const OUTPUT_DIR = path.join(ROOT, 'public', 'assets', 'runtime');
const CATALOG_MODULE = path.join(ROOT, 'public', 'visual-asset-catalog.js');

const palettes = ['wood', 'iron', 'steel', 'gold', 'ice', 'void', 'holy', 'fire'];
const itemRows = [
  ['wood sword', 'iron sword', 'steel sword', 'gold sword', 'ice sword', 'void sword', 'holy sword', 'fire sword', 'wood dagger', 'iron dagger', 'gold dagger', 'ice dagger', 'void dagger', 'fire dagger', 'crimson dagger'],
  ['wood spear', 'iron spear', 'steel spear', 'gold spear', 'ice spear', 'void spear', 'holy spear', 'fire spear', 'wood axe', 'iron axe', 'steel axe', 'gold axe', 'ice axe', 'void axe', 'fire axe'],
  ['wood bow', 'iron bow', 'steel bow', 'gold bow', 'nature bow', 'void bow', 'holy bow', 'fire bow', 'wood crossbow', 'iron crossbow', 'steel crossbow', 'fire crossbow', 'nature staff', 'arcane staff', 'ice staff'],
  [...palettes.map((v) => `${v} shield`), 'leather hood', 'iron helmet', 'steel helmet', 'gold helmet', 'ice helmet', 'void helmet', 'holy helmet', 'fire helmet'],
  [...palettes.map((v) => `${v} armor`), 'nature robe', 'arcane robe', 'fire robe', 'holy robe', 'royal robe', 'void robe', 'shadow robe', 'crimson robe'],
  [...palettes.map((v) => `${v} cloak`), 'leather boots', 'iron boots', 'royal boots', 'gold boots', 'ice boots', 'void boots', 'holy boots', 'fire boots'],
  [...palettes.map((v) => `${v} gauntlets`), 'leather belt', 'iron belt', 'royal belt', 'gold belt', 'ice belt', 'void belt', 'holy belt', 'fire belt'],
  [...palettes.map((v) => `${v} ring`), 'leather bracer', 'iron bracer', 'royal bracer', 'gold bracer', 'ice bracer', 'void bracer', 'holy bracer', 'fire bracer'],
  ['fang necklace', 'silver medallion', 'water pendant', 'fire pendant', 'nature pendant', 'moon pendant', 'sun pendant', 'demon pendant', 'lucky clover', 'white feather', 'angel feather', 'arcane potion', 'fire crystal', 'ice crystal', 'hourglass', 'compass'],
  ['health potion', 'mana potion', 'nature potion', 'arcane potion', 'stamina potion', 'fire potion', 'clear potion', 'greater health potion', 'gold coin', 'silver coin', 'sapphire', 'ruby', 'emerald', 'amethyst', 'quest scroll', 'coin pouch', 'iron treasure chest', 'gold treasure chest', 'royal treasure chest'],
];

const iconRows = [
  ['attack sword', 'defense shield', 'armor helmet', 'chest armor', 'boots', 'gauntlet', 'magic ring', 'magic necklace', 'health potion', 'mana potion'],
  ['health', 'mana', 'energy', 'poison', 'bleed', 'burn', 'freeze', 'stun', 'sleep', 'curse'],
  ['holy damage', 'impact', 'wind', 'target', 'flight', 'level up', 'level down', 'healing', 'feather', 'party'],
  ['chest', 'inventory bag', 'key', 'locked', 'gold', 'crystal currency', 'royal currency', 'quest scroll', 'map', 'dungeon'],
  ['forge anvil', 'crafting hammer', 'upgrade', 'campfire', 'camp', 'enemy banner', 'portal', 'battle', 'radiance', 'arcane flame'],
  ['nature', 'water', 'fire', 'light', 'earth', 'wind', 'shadow', 'lightning', 'ice', 'arcane'],
];

const characterRows = [
  ['male fighter', 'male wizard', 'male rogue', 'male ranger', 'male cleric', 'male monk', 'male knight', 'male adventurer'],
  ['female fighter', 'female wizard', 'female rogue', 'female ranger', 'female cleric', 'female monk', 'female knight', 'female adventurer'],
];

const bossRows = [
  ['royal slime', 'infernal warlord', 'undead archmage', 'red dragon', 'hydra', 'giant spider', 'ice queen'],
  ['rune golem', 'skeleton king', 'sea dragon', 'minotaur', 'vampire lord', 'plague lich', 'storm griffin'],
  ['lava beast', 'many-eyed horror', 'giant crab', 'magma golem', 'frost sorceress', 'void sorcerer', 'ancient treant'],
  ['void knight', 'skeletal reaper', 'radiant hierophant', 'orc warlord', 'blood cardinal', 'frost yeti', 'void dragon'],
  ['crystal worm', 'plague reaper', 'forest queen', 'lava titan', 'frost knight', 'radiant angel', 'void singularity'],
];

const mobRows = [
  ['green slime', 'blue slime', 'red slime', 'horned void slime', 'small void bat', 'greater void bat', 'gray wolf', 'dire wolf', 'gray mouse', 'black rat', 'brown boar', 'crimson boar'],
  ['red mushroom', 'violet mushroom', 'giant mushroom', 'mandrake', 'shield skeleton', 'sword skeleton', 'void necromancer', 'light zombie', 'armored zombie', 'brown rogue', 'black rogue', 'gray rogue', 'crimson rogue'],
  ['sword goblin', 'shield goblin', 'club goblin', 'brute goblin', 'small imp', 'winged imp', 'horned imp', 'greater demon', 'ice wisp', 'void wisp', 'hooded wraith', 'shadow beast', 'skull flame'],
  ['small spider', 'giant spider', 'green serpent', 'violet serpent', 'shield lizardfolk', 'spear lizardfolk', 'harpy', 'crimson harpy', 'merfolk warrior', 'sharkfolk warrior', 'dire shark'],
  ['tongue mimic', 'fang mimic', 'elder stump', 'elder tree', 'stone golem', 'ice elemental', 'fire elemental', 'water elemental', 'wind elemental', 'glacier elemental', 'light elemental'],
  ['black knight', 'silver knight', 'gold knight', 'frost knight', 'shadow knight', 'crimson cultist', 'radiant cultist', 'plague cultist', 'void cultist', 'shadow cultist', 'skull warlock', 'void warlock'],
  ['black dire wolf', 'void dire wolf', 'fire dire wolf', 'many-eyed horror', 'floating eye', 'carnivorous plant', 'bone spider', 'giant scorpion', 'giant hornet', 'giant octopus', 'giant mantis'],
  ['ice wolf', 'polar bear', 'snow yeti', 'snow owl', 'stone sentinel', 'forest turtle', 'forest spirit', 'antler spirit', 'haunted doll', 'pumpkin spirit', 'lantern wraith', 'void spirit'],
];

const sheets = [
  { file: 'mobs_sheets.png', kind: 'mob', rows: mobRows },
  { file: 'boss_sheets.png', kind: 'boss', rows: bossRows },
  { file: 'items_sheets.png', kind: 'item', rows: itemRows },
  { file: 'icon_sheets.png', kind: 'icon', rows: iconRows, rowBounds: [[70, 260], [250, 420], [415, 575], [570, 730], [720, 890], [885, 1040]] },
  { file: 'character_sheets.png', kind: 'character', rows: characterRows, rowBounds: [[185, 555], [585, 955]] },
];

// These authored mappings use exact detected subject bounds because the mob sheet is
// intentionally packed and several silhouettes cross an inferred equal-width cell.
const cropOverrides = Object.freeze({
  'mob.small-spider.v1': [11, 471, 113, 552],
  'mob.gray-wolf.v1': [676, 40, 778, 144],
  'mob.void-wisp.v1': [1007, 296, 1086, 416],
  'mob.shadow-beast.v1': [1216, 290, 1327, 420],
  'mob.silver-knight.v1': [126, 709, 249, 850],
  'mob.ice-wolf.v1': [17, 969, 127, 1077],
  'mob.black-knight.v1': [9, 705, 125, 849],
  'mob.many-eyed-horror.v1': [399, 850, 535, 973],
  'mob.giant-mantis.v1': [1310, 851, 1433, 965],
  'mob.lantern-wraith.v1': [1204, 963, 1315, 1079],
  'boss.void-knight.v1': [7, 645, 218, 853],
  'boss.void-singularity.v1': [1235, 847, 1445, 1075],
});

function slug(value) { return value.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function tags(kind, label) { return [...new Set([kind, ...label.split(/\s+/)])]; }

async function preserveCellArtwork(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Preserve every authored component (chains, bottle bodies, glows, stars, etc.).
  // Only pixels that are effectively transparent are normalized away.
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    if (data[pixel * 4 + 3] <= 16) data[pixel * 4 + 3] = 0;
  }
  let originalOpaque = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) if (data[pixel * 4 + 3] > 16) originalOpaque += 1;
  const edgeConnected = new Uint8Array(info.width * info.height);
  const stack = [];
  const enqueue = (x, y) => {
    const pixel = y * info.width + x;
    if (!edgeConnected[pixel] && data[pixel * 4 + 3] > 16) { edgeConnected[pixel] = 1; stack.push(pixel); }
  };
  for (let x = 0; x < info.width; x += 1) { enqueue(x, 0); enqueue(x, info.height - 1); }
  for (let y = 0; y < info.height; y += 1) { enqueue(0, y); enqueue(info.width - 1, y); }
  while (stack.length) {
    const pixel = stack.pop();
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < info.width && ny >= 0 && ny < info.height) enqueue(nx, ny);
    }
  }
  const removed = edgeConnected.reduce((sum, value) => sum + value, 0);
  // Reject neighbor spill only when a substantial centered subject remains.
  if (originalOpaque - removed >= originalOpaque * 0.35) {
    for (let pixel = 0; pixel < edgeConnected.length; pixel += 1) if (edgeConnected[pixel]) data[pixel * 4 + 3] = 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function weightedCenters(values, count) {
  let centers = Array.from({ length: count }, (_, index) => ((index + 0.5) * values.length) / count);
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const sums = new Float64Array(count);
    const weights = new Float64Array(count);
    for (let coordinate = 0; coordinate < values.length; coordinate += 1) {
      const weight = values[coordinate];
      if (!weight) continue;
      let nearest = 0;
      for (let index = 1; index < centers.length; index += 1) {
        if (Math.abs(coordinate - centers[index]) < Math.abs(coordinate - centers[nearest])) nearest = index;
      }
      sums[nearest] += coordinate * weight;
      weights[nearest] += weight;
    }
    centers = centers.map((center, index) => weights[index] ? sums[index] / weights[index] : center);
  }
  return centers.sort((a, b) => a - b);
}

function ownershipBounds(centers, limit) {
  return [0, ...centers.slice(0, -1).map((center, index) => Math.round((center + centers[index + 1]) / 2)), limit];
}

async function inferSheetCells(source, rowDefinitions) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const yDensity = new Uint32Array(info.height);
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if (data[(y * info.width + x) * 4 + 3] > 16) yDensity[y] += 1;
  }
  const yBounds = ownershipBounds(weightedCenters(yDensity, rowDefinitions.length), info.height);
  return rowDefinitions.map((labels, rowIndex) => {
    const xDensity = new Uint32Array(info.width);
    for (let y = yBounds[rowIndex]; y < yBounds[rowIndex + 1]; y += 1) for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 16) xDensity[x] += 1;
    }
    const xBounds = ownershipBounds(weightedCenters(xDensity, labels.length), info.width);
    return labels.map((_label, columnIndex) => [xBounds[columnIndex], yBounds[rowIndex], xBounds[columnIndex + 1], yBounds[rowIndex + 1]]);
  });
}

await mkdir(OUTPUT_DIR, { recursive: true });
for (const name of await readdir(OUTPUT_DIR)) {
  if (/^[a-z0-9-]+\.[a-f0-9]{12}\.webp$/.test(name)) await rm(path.join(OUTPUT_DIR, name));
}

const assets = [];
const occurrences = new Map();
for (const sheet of sheets) {
  const source = path.join(SOURCE_DIR, sheet.file);
  const inferredCells = await inferSheetCells(source, sheet.rows);
  for (const [rowIndex, labels] of sheet.rows.entries()) {
    for (const [columnIndex, label] of labels.entries()) {
      const baseSlug = slug(label);
      const occurrenceKey = `${sheet.kind}.${baseSlug}`;
      const occurrence = (occurrences.get(occurrenceKey) || 0) + 1;
      occurrences.set(occurrenceKey, occurrence);
      const semanticSlug = occurrence === 1 ? baseSlug : `${baseSlug}-${occurrence}`;
      const visualAssetId = `${sheet.kind}.${semanticSlug}.v1`;
      const inferred = inferredCells[rowIndex][columnIndex];
      const [left, top, right, bottom] = cropOverrides[visualAssetId] || inferred;
      const extractedCell = await sharp(source)
        .extract({ left, top, width: right - left, height: bottom - top })
        .png()
        .toBuffer();
      const cell = await preserveCellArtwork(extractedCell);
      const pipeline = sharp(cell)
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
        .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true, kernel: sharp.kernel.nearest })
        .webp({ lossless: true, effort: 6 });
      let rendered;
      try {
        rendered = await pipeline.toBuffer({ resolveWithObject: true });
      } catch (error) {
        throw new Error(`Could not extract ${sheet.file} row ${rowIndex} column ${columnIndex} (${left},${top},${right},${bottom}): ${error.message}`);
      }
      const { data, info } = rendered;
      const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
      const name = `${sheet.kind}-${semanticSlug}.${hash}.webp`;
      await writeFile(path.join(OUTPUT_DIR, name), data);
      assets.push({
        id: visualAssetId,
        kind: sheet.kind,
        label: label.replace(/\b\w/g, (letter) => letter.toUpperCase()),
        description: `Pixel-art ${label}.`,
        tags: tags(sheet.kind, label),
        src: `/assets/runtime/${name}`,
        width: info.width,
        height: info.height,
        provenance: { sourceSheet: sheet.file, creator: 'Threadbound project', license: 'project-owned-ai-generated' },
        sourceCell: { row: rowIndex, column: columnIndex },
      });
    }
  }
}

const banner = '// Generated by scripts/generate-visual-assets.mjs. Do not edit by hand.\n';
const body = `${banner}export const VISUAL_ASSET_CATALOG_VERSION = 1;\nexport const VISUAL_ASSETS = Object.freeze(${JSON.stringify(assets, null, 2)}.map((asset) => Object.freeze(asset)));\nexport const VISUAL_ASSET_BY_ID = new Map(VISUAL_ASSETS.map((asset) => [asset.id, asset]));\nexport function visualAsset(id, kind) { const asset = VISUAL_ASSET_BY_ID.get(String(id || '')); return asset && (!kind || asset.kind === kind) ? asset : null; }\n`;
await writeFile(CATALOG_MODULE, body);
console.log(`Generated ${assets.length} runtime assets and ${path.relative(ROOT, CATALOG_MODULE)}.`);
