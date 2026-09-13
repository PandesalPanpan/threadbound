import { ITEM_EFFECTS } from '../domain/ItemGenerator.js';
import { itemRarity } from '../domain/ItemRarityPolicy.js';
import { normalizeArcEquipmentTemplate } from '../domain/ArcEquipmentTemplatePolicy.js';
import { townById } from './TownCatalog.js';

const STOCK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const SKU_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function titleCase(value) {
  const label = String(value || '').replaceAll('_', ' ');
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : label;
}

function serializableEffect(definition, equipmentTemplate) {
  return {
    code: definition.code,
    name: definition.name,
    description: definition.description,
    mechanics: definition.mechanics.map((mechanic) => ({
      ...mechanic,
      ...(mechanic.effect ? { effect: { ...mechanic.effect } } : {}),
    })),
    upgradeLevel: 0,
    attunementCode: null,
    equipmentTemplate: {
      effectCodes: [...equipmentTemplate.effects],
      requiredLevel: equipmentTemplate.requiredLevel,
      areaNumber: equipmentTemplate.areaNumber,
      stats: { ...equipmentTemplate.stats },
      budget: { ...equipmentTemplate.budget },
    },
  };
}

function templateIndex(manifest) {
  const index = new Map();
  for (const pool of manifest?.itemPools || []) {
    for (const template of pool?.items || []) index.set(template.id, template);
  }
  return index;
}

export function validateArcTownShopStocks(manifest) {
  const errors = [];
  const stocks = manifest?.shopStocks;
  if (stocks === undefined) return { valid: true, errors };
  if (!Array.isArray(stocks)) return { valid: false, errors: [{ path: 'shopStocks', code: 'array_required', message: 'shopStocks must be an array when supplied.' }] };

  const templates = templateIndex(manifest);
  const stockIds = new Set();
  const runtimeSkus = new Set();

  stocks.forEach((stock, stockIndex) => {
    const path = `shopStocks[${stockIndex}]`;
    if (!stock || typeof stock !== 'object' || Array.isArray(stock)) {
      errors.push({ path, code: 'invalid_shop_stock', message: 'Shop stock must be an object.' });
      return;
    }
    if (!STOCK_ID_PATTERN.test(String(stock.id || ''))) errors.push({ path: `${path}.id`, code: 'invalid_shop_stock_id', message: 'Shop stock id must be a stable lowercase id.' });
    else if (stockIds.has(stock.id)) errors.push({ path: `${path}.id`, code: 'duplicate_shop_stock_id', message: `Duplicate Shop stock id "${stock.id}".` });
    else stockIds.add(stock.id);

    if (!text(stock.townId)) errors.push({ path: `${path}.townId`, code: 'town_required', message: 'Shop stock must reference a Town.' });
    const town = townById(stock.townId);
    if (!town) errors.push({ path: `${path}.townId`, code: 'unknown_town_reference', message: `Unknown Town "${stock.townId}".` });
    if (!Number.isInteger(stock.areaNumber) || stock.areaNumber < 1) errors.push({ path: `${path}.areaNumber`, code: 'invalid_area_number', message: 'Shop stock Area must be a positive integer.' });
    else if (town && town.areaNumber !== stock.areaNumber) errors.push({ path: `${path}.areaNumber`, code: 'town_area_mismatch', message: 'Shop stock Area must match its Town.' });

    if (!Array.isArray(stock.offers) || stock.offers.length < 1) {
      errors.push({ path: `${path}.offers`, code: 'shop_offers_required', message: 'Shop stock must contain at least one offer.' });
      return;
    }

    stock.offers.forEach((offer, offerIndex) => {
      const offerPath = `${path}.offers[${offerIndex}]`;
      if (!offer || typeof offer !== 'object' || Array.isArray(offer)) {
        errors.push({ path: offerPath, code: 'invalid_shop_offer', message: 'Shop offer must be an object.' });
        return;
      }
      if (!SKU_PATTERN.test(String(offer.sku || ''))) errors.push({ path: `${offerPath}.sku`, code: 'invalid_shop_sku', message: 'Shop SKU must be a stable lowercase id.' });
      const runtimeSku = `${stock.id}:${offer.sku}`;
      if (runtimeSkus.has(runtimeSku)) errors.push({ path: `${offerPath}.sku`, code: 'duplicate_shop_sku', message: `Duplicate Shop SKU "${offer.sku}" in stock "${stock.id}".` });
      else runtimeSkus.add(runtimeSku);
      if (!Number.isInteger(offer.cost) || offer.cost < 1 || offer.cost > 1_000_000) errors.push({ path: `${offerPath}.cost`, code: 'invalid_shop_cost', message: 'Shop cost must be an integer between 1 and 1,000,000 Gold.' });
      const template = templates.get(offer.itemTemplateId);
      if (!template) {
        errors.push({ path: `${offerPath}.itemTemplateId`, code: 'unknown_item_template_reference', message: `Unknown equipment template "${offer.itemTemplateId}".` });
        return;
      }
      const normalized = normalizeArcEquipmentTemplate(template);
      if (Number.isInteger(stock.areaNumber) && normalized.areaNumber > stock.areaNumber) errors.push({ path: `${offerPath}.itemTemplateId`, code: 'future_area_shop_item', message: 'A Town Shop cannot stock equipment authored for a later Area.' });
    });
  });

  return { valid: errors.length === 0, errors };
}

export function arcTownShopOffers(publishedRecords, { areaNumber }) {
  const offers = [];
  for (const record of publishedRecords || []) {
    const manifest = record?.manifest;
    const validation = validateArcTownShopStocks(manifest);
    if (!validation.valid) continue;
    const templates = templateIndex(manifest);
    for (const stock of manifest.shopStocks || []) {
      if (stock.areaNumber !== areaNumber) continue;
      for (const definition of stock.offers) {
        const source = templates.get(definition.itemTemplateId);
        const equipmentTemplate = normalizeArcEquipmentTemplate(source);
        const effectCodes = equipmentTemplate.effects.length ? [...equipmentTemplate.effects] : ['none'];
        const effectCode = effectCodes[0] || 'none';
        const effectDefinition = ITEM_EFFECTS[effectCode] || ITEM_EFFECTS.none;
        const rarity = itemRarity(equipmentTemplate.rarity);
        const name = source.namePattern.replaceAll('{suffix}', 'the Market').replaceAll('{arc}', manifest.arc.title);
        const statSummary = Object.entries(equipmentTemplate.stats)
          .filter(([, value]) => Number(value) > 0)
          .map(([key, value]) => `+${value}${key === 'critChanceBonus' ? '%' : ''} ${titleCase(key.replace('Bonus', ''))}`)
          .join(' · ');
        offers.push(Object.freeze({
          sku: `${record.arcId}:${stock.id}:${definition.sku}`,
          kind: 'equipment',
          name,
          description: `${titleCase(equipmentTemplate.rarity)} ${titleCase(equipmentTemplate.slot)}${statSummary ? ` · ${statSummary}` : ''}`,
          visualAssetId: source.visualAssetId,
          cost: definition.cost,
          quantity: 1,
          itemTemplate: Object.freeze({
            definitionId: source.id,
            name,
            slot: equipmentTemplate.slot,
            rarity: equipmentTemplate.rarity,
            rarityTier: rarity.tier,
            ...equipmentTemplate.stats,
            effectCode,
            effectCodes,
            effect: serializableEffect(effectDefinition, equipmentTemplate),
            requiredLevel: equipmentTemplate.requiredLevel,
            areaNumber: equipmentTemplate.areaNumber,
            equipmentBudget: { ...equipmentTemplate.budget },
            visualAssetId: source.visualAssetId,
          }),
        }));
      }
    }
  }
  return Object.freeze(offers);
}
