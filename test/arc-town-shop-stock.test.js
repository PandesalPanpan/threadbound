import test from 'node:test';
import assert from 'node:assert/strict';
import { ShopService } from '../src/application/ShopService.js';
import { ArcManifestService } from '../src/application/ArcManifestService.js';
import { arcTownShopOffers, validateArcTownShopStocks } from '../src/content/ArcTownShopCatalog.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteArcManifestRepository } from '../src/infrastructure/SQLiteArcManifestRepository.js';

function manifest(overrides = {}) {
  return {
    arc: { id: 'market-arc', title: 'Market Arc' },
    itemPools: [{
      id: 'market-items',
      items: [{
        id: 'ember-needle-template',
        namePattern: 'Ember Needle of {suffix}',
        slot: 'weapon',
        rarity: 'rare',
        attackBonus: 3,
        stats: { attackBonus: 3, defenseBonus: 0, maxHpBonus: 0, speedBonus: 0, critChanceBonus: 0 },
        effects: ['boss_bane'],
        requiredLevel: 1,
        areaNumber: 1,
        visualAssetId: 'item.fire-dagger.v1',
      }],
    }],
    shopStocks: [{
      id: 'market-stock',
      townId: 'area-1-town',
      areaNumber: 1,
      offers: [{ sku: 'ember-needle', itemTemplateId: 'ember-needle-template', cost: 14 }],
    }],
    ...overrides,
  };
}

function passingValidator() {
  return { validate: () => ({ valid: true, errors: [], warnings: [] }) };
}

test('Arc Town Shop stock validates Town, Area, Gold price, and equipment-template references', () => {
  assert.deepEqual(validateArcTownShopStocks(manifest()), { valid: true, errors: [] });

  const invalid = manifest({
    shopStocks: [{
      id: 'market-stock',
      townId: 'area-1-town',
      areaNumber: 2,
      offers: [{ sku: 'bad', itemTemplateId: 'missing-template', cost: 0 }],
    }],
  });
  const result = validateArcTownShopStocks(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'town_area_mismatch'));
  assert.ok(result.errors.some((error) => error.code === 'invalid_shop_cost'));
  assert.ok(result.errors.some((error) => error.code === 'unknown_item_template_reference'));
});

test('ArcManifestService publication validation includes authoritative Town Shop stock validation', () => {
  const service = new ArcManifestService({
    gameRepository: {},
    codexRepository: {},
    manifestRepository: {},
    validator: passingValidator(),
    equipmentTemplateValidator: {
      ...passingValidator(),
      projectForLegacyValidator: (candidate) => candidate,
    },
    replayabilityValidator: passingValidator(),
    bundledManifests: [],
  });
  const invalid = manifest({
    shopStocks: [{
      id: 'market-stock',
      townId: 'area-1-town',
      areaNumber: 2,
      offers: [{ sku: 'ember-needle', itemTemplateId: 'ember-needle-template', cost: 14 }],
    }],
  });

  const validation = service.validate(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === 'town_area_mismatch'));
});

test('Arc Town Shop projection keeps item construction private until authoritative purchase', () => {
  const offers = arcTownShopOffers([{ arcId: 'market-arc', manifest: manifest() }], { areaNumber: 1 });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].sku, 'market-arc:market-stock:ember-needle');
  assert.equal(offers[0].cost, 14);
  assert.equal(offers[0].itemTemplate.slot, 'weapon');
  assert.equal(offers[0].itemTemplate.attackBonus, 3);
});

test('ShopService consumes only published validated Arc Town stock for the current Area', () => {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'player-1' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'shop-arc-user', displayName: 'Arc Shopper' });
  repository.addThreadDust(player.id, 20);

  const manifests = new SQLiteArcManifestRepository({ database: repository.db });
  const draft = manifests.saveDraft({
    id: 'market-draft',
    arcId: 'market-arc',
    revision: 1,
    source: 'test',
    manifest: manifest(),
    validation: { valid: true, errors: [], warnings: [] },
  });
  manifests.publish(draft.id, { valid: true, errors: [], warnings: [] });

  const events = [];
  const service = new ShopService({
    repository,
    eventBus: { publish: (event) => events.push(event) },
    idFactory: () => 'arc-shop-item-1',
  });

  const browse = service.browse(player.id);
  const offer = browse.offers.find((candidate) => candidate.sku === 'market-arc:market-stock:ember-needle');
  assert.ok(offer);
  assert.equal(offer.name, 'Ember Needle of the Market');
  assert.equal(offer.cost, 14);
  assert.equal(offer.affordable, true);
  assert.equal('itemTemplate' in offer, false, 'private generated equipment construction data must not reach the browser');

  const purchase = service.purchase(player.id, offer.sku);
  assert.equal(purchase.gold, 6);
  assert.equal(purchase.item.id, 'arc-shop-item-1');
  assert.equal(purchase.item.definitionId, 'ember-needle-template');
  assert.equal(purchase.item.attackBonus, 3);
  assert.equal(repository.listItems(player.id)[0].source, `shop:${offer.sku}`);
  assert.equal(events.at(-2).type, 'ShopEquipmentPurchased');
  assert.equal(events.at(-1).type, 'ItemGenerated');
});

test('invalid published stock is fail-closed and never reaches the Shop catalog', () => {
  const badManifest = manifest({
    shopStocks: [{
      id: 'market-stock',
      townId: 'not-a-town',
      areaNumber: 1,
      offers: [{ sku: 'ember-needle', itemTemplateId: 'ember-needle-template', cost: 14 }],
    }],
  });
  const offers = arcTownShopOffers([{ arcId: 'market-arc', manifest: badManifest }], { areaNumber: 1 });
  assert.deepEqual(offers, []);
});
