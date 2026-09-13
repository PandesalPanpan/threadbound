import { randomUUID } from 'node:crypto';
import { DUNGEONS, RUN_UPGRADES } from '../domain/DungeonRun.js';
import { ITEM_EFFECTS } from '../domain/ItemGenerator.js';
import { itemRarity } from '../domain/ItemRarityPolicy.js';
import { normalizeArcEquipmentTemplate, publicArcEquipmentTemplateContract } from '../domain/ArcEquipmentTemplatePolicy.js';
import { selectEncounterSequence } from '../domain/RunVariationPolicy.js';
import { allCanonicalNarrativeEntries } from '../content/CanonicalContent.js';
import { BUNDLED_ARC_MANIFESTS } from '../content/BundledArcManifests.js';
import { compactVisualAssetCatalog, VISUAL_ASSET_CATALOG_VERSION } from '../content/VisualAssetCatalog.js';
import { validateArcTownShopStocks } from '../content/ArcTownShopCatalog.js';
import { ALLOWED_ENEMY_ABILITIES, ALLOWED_QUEST_OBJECTIVES, BALANCE_BUDGETS, ArcManifestValidator, MANIFEST_VERSION } from './ArcManifestValidator.js';
import { ArcEquipmentTemplateValidator } from './ArcEquipmentTemplateValidator.js';
import { ArcManifestReplayabilityValidator } from './ArcManifestReplayabilityValidator.js';

function serializableEquipmentEffect(definition, equipmentTemplate) {
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

export class ArcManifestService {
  constructor({ gameRepository, codexRepository, manifestRepository, validator = new ArcManifestValidator(), equipmentTemplateValidator = new ArcEquipmentTemplateValidator(), replayabilityValidator = new ArcManifestReplayabilityValidator(), bundledManifests = BUNDLED_ARC_MANIFESTS, idFactory = randomUUID, rng = Math.random }) {
    this.gameRepository = gameRepository;
    this.codexRepository = codexRepository;
    this.manifestRepository = manifestRepository;
    this.validator = validator;
    this.equipmentTemplateValidator = equipmentTemplateValidator;
    this.replayabilityValidator = replayabilityValidator;
    this.bundledManifests = [...bundledManifests];
    this.idFactory = idFactory;
    this.rng = rng;
    this.bundledContentEnsured = false;
  }

  worldContext() {
    const equipmentTemplates = publicArcEquipmentTemplateContract();
    return {
      contextVersion: 1,
      manifestVersion: MANIFEST_VERSION,
      exportedAt: new Date().toISOString(),
      currentWorld: this.gameRepository.getWorldState(),
      canonicalNarrative: allCanonicalNarrativeEntries(),
      canonicalDungeons: structuredClone(DUNGEONS),
      allowedMechanics: {
        enemyAbilities: [...ALLOWED_ENEMY_ABILITIES],
        questObjectives: [...ALLOWED_QUEST_OBJECTIVES],
        itemEffects: Object.values(ITEM_EFFECTS).map((effect) => ({ ...effect })),
        equipmentTemplates,
        runUpgrades: Object.values(RUN_UPGRADES).map((upgrade) => ({ ...upgrade })),
        replayability: {
          intentCadence: { min: 1, max: 6 },
          encounterVariants: true,
          manifestRunEvents: true,
        },
      },
      balanceBudgets: {
        ...structuredClone(BALANCE_BUDGETS),
        equipmentTemplates: structuredClone(equipmentTemplates.rules),
      },
      visualAssetCatalog: {
        version: VISUAL_ASSET_CATALOG_VERSION,
        selectionMode: 'exact-allowlisted-id',
        shortlist: compactVisualAssetCatalog({ tags: ['void', 'shadow', 'ice', 'fire', 'forest', 'knight', 'relic'], limit: 120 }),
        fullCatalogEndpoint: '/api/arc-workshop/visual-assets',
      },
      publishedGeneratedArcs: this.manifestRepository.listPublished().map((entry) => ({
        manifestId: entry.id,
        arcId: entry.arcId,
        revision: entry.revision,
        title: entry.manifest.arc.title,
        publishedAt: entry.publishedAt,
      })),
      generationRules: [
        'Preserve canonical content; never reuse canonical IDs.',
        'Use only allowed enemy ability IDs and item effect IDs.',
        'New equipment templates must use an exported canonical slot, rarity, stat field, effect code, requiredLevel, Area number, and exact item visualAssetId.',
        'Equipment weighted stats plus non-plain effects must fit the exported rarity/level/Area power budget; do not invent hidden stats or executable item mechanics.',
        'Story Quest objectives may use only the exported quest objective types and data fields; never embed scripts, formulas, or executable behavior.',
        'Optional Town Shop stock may reference only an established Town and equipment template from the same manifest, with a fixed positive Gold price.',
        'Do not invent executable code or mechanics outside this context.',
        'Keep all numeric values inside the supplied balance budgets.',
        'Encounter variants must reference enemies from the same manifest.',
        'Run event schedules may only reference runEvents from the same manifest.',
        'All dungeon encounter, boss, and reward-pool references must resolve within the same manifest.',
        'Choose an exact visualAssetId from the allowlisted catalog for every new enemy, boss, and item template.',
        'Return JSON only when generating an Arc Manifest for upload.',
      ],
    };
  }

  validate(manifest) {
    const equipmentTemplates = this.equipmentTemplateValidator.validate(manifest);
    const projected = this.equipmentTemplateValidator.projectForLegacyValidator(manifest);
    const base = this.validator.validate(projected);
    const replayability = this.replayabilityValidator.validate(manifest);
    const shopStocks = validateArcTownShopStocks(manifest);
    return {
      valid: base.valid && equipmentTemplates.valid && replayability.valid && shopStocks.valid,
      errors: [...base.errors, ...equipmentTemplates.errors, ...replayability.errors, ...shopStocks.errors],
      warnings: [...base.warnings, ...equipmentTemplates.warnings, ...replayability.warnings],
    };
  }

  saveDraft(manifest, { source = 'upload' } = {}) {
    const validation = this.validate(manifest);
    if (!validation.valid) {
      const error = new Error('Arc Manifest failed validation and was not saved.');
      error.code = 'arc_manifest_invalid';
      error.validation = validation;
      throw error;
    }
    const arcId = manifest.arc.id;
    return this.manifestRepository.saveDraft({
      id: this.idFactory(),
      arcId,
      revision: this.manifestRepository.nextRevision(arcId),
      source,
      manifest: structuredClone(manifest),
      validation,
    });
  }

  list() { return this.manifestRepository.list(); }
  get(id) { return this.manifestRepository.get(id); }

  publish(id) {
    const draft = this.manifestRepository.get(id);
    if (!draft) throw new Error('Arc Manifest draft not found.');
    const validation = this.validate(draft.manifest);
    if (!validation.valid) {
      const error = new Error('Arc Manifest no longer passes validation and cannot be published.');
      error.code = 'arc_manifest_invalid';
      error.validation = validation;
      throw error;
    }
    const published = this.manifestRepository.publish(id, validation);
    this.#projectCodex(published);
    this.codexRepository.recordWorldHistory({
      id: `arc-published:${published.arcId}:r${published.revision}`,
      eventType: 'arc_published',
      title: `${published.manifest.arc.title} published`,
      summary: `Arc ${published.manifest.arc.title} revision ${published.revision} entered the Threadbound content catalog.`,
      body: published.manifest.arc.premise,
      entityType: 'lore',
      entityId: `generated-arc:${published.arcId}`,
      createdAt: published.publishedAt,
    });
    for (const consequence of published.manifest.historicalConsequences.filter((entry) => entry.trigger === 'arc_started')) {
      this.codexRepository.recordWorldHistory({
        id: `manifest-history:${published.arcId}:r${published.revision}:${consequence.id}`,
        eventType: 'arc_started',
        title: consequence.title,
        summary: consequence.body,
        body: consequence.body,
        entityType: 'lore',
        entityId: `generated-arc:${published.arcId}`,
        createdAt: published.publishedAt,
      });
    }
    return published;
  }

  publishedAchievements() {
    const entries = [];
    for (const record of this.manifestRepository.listPublished()) {
      for (const achievement of record.manifest.achievements) entries.push({ ...achievement, arcId: record.arcId, manifestId: record.id, revision: record.revision });
    }
    return entries;
  }

  runtimeDungeons() {
    this.#ensureBundledContent();
    const result = [];
    for (const record of this.manifestRepository.listPublished()) {
      const manifest = record.manifest;
      const enemies = new Map(manifest.enemies.map((enemy) => [enemy.id, enemy]));
      const bosses = new Map(manifest.bosses.map((boss) => [boss.id, boss]));
      const runEvents = new Map((manifest.runEvents || []).map((event) => [event.id, event]));
      const materializeEnemy = (enemy) => ({
        id: enemy.id,
        name: enemy.name,
        hp: enemy.baseHp,
        retaliation: enemy.retaliation,
        abilities: [...enemy.abilities],
        ...(enemy.visualAssetId ? { visualAssetId: enemy.visualAssetId } : {}),
        ...(Number.isInteger(enemy.intentCadence) ? { intentCadence: enemy.intentCadence } : {}),
      });
      for (const dungeon of manifest.dungeons) {
        const boss = bosses.get(dungeon.bossId);
        const materializeSequence = (sequence) => sequence.map((enemyId) => materializeEnemy(enemies.get(enemyId)));
        const schedule = dungeon.runEventSchedule
          ? {
              afterEncounterIndex: dungeon.runEventSchedule.afterEncounterIndex,
              events: dungeon.runEventSchedule.eventIds.map((eventId) => structuredClone(runEvents.get(eventId))).filter(Boolean),
            }
          : null;
        result.push({
          id: dungeon.id,
          name: dungeon.name,
          recommendedPlayers: dungeon.recommendedPlayers,
          minPlayers: 1,
          maxPlayers: 4,
          encounters: materializeSequence(dungeon.encounters),
          encounterVariants: (dungeon.encounterVariants || []).map(materializeSequence),
          runEventSchedule: schedule,
          boss: materializeEnemy({ ...boss, intentCadence: boss.intentCadence }),
          arcId: manifest.arc.id,
          arcTitle: manifest.arc.title,
          rewardPoolId: dungeon.rewardPoolId,
          sourceManifestId: record.id,
          sourceManifestRevision: record.revision,
        });
      }
    }
    return result;
  }

  resolveDungeon(id) {
    if (DUNGEONS[id]) return structuredClone(DUNGEONS[id]);
    const dungeon = this.runtimeDungeons().find((candidate) => candidate.id === id);
    if (!dungeon) return null;
    const selection = selectEncounterSequence(dungeon, this.rng());
    return {
      ...structuredClone(dungeon),
      encounters: selection.encounters,
      encounterVariantIndex: selection.variantIndex,
    };
  }

  generateReward(dungeonId) {
    this.#ensureBundledContent();
    for (const record of this.manifestRepository.listPublished()) {
      const dungeon = record.manifest.dungeons.find((entry) => entry.id === dungeonId);
      if (!dungeon) continue;
      const pool = record.manifest.itemPools.find((entry) => entry.id === dungeon.rewardPoolId);
      if (!pool?.items?.length) return null;
      const template = pool.items[Math.floor(this.rng() * pool.items.length) % pool.items.length];
      const equipmentTemplate = normalizeArcEquipmentTemplate(template);
      const effectCodes = equipmentTemplate.effects.length > 0 ? [...equipmentTemplate.effects] : ['none'];
      const effectCode = effectCodes[0] || 'none';
      const effectDefinition = ITEM_EFFECTS[effectCode] || ITEM_EFFECTS.none;
      const rarity = itemRarity(equipmentTemplate.rarity);
      return {
        id: this.idFactory(),
        definitionId: template.id,
        name: template.namePattern.replaceAll('{suffix}', 'the Loom').replaceAll('{arc}', record.manifest.arc.title),
        slot: equipmentTemplate.slot,
        rarity: equipmentTemplate.rarity,
        rarityTier: rarity.tier,
        ...equipmentTemplate.stats,
        effectCode,
        effectCodes,
        effect: serializableEquipmentEffect(effectDefinition, equipmentTemplate),
        requiredLevel: equipmentTemplate.requiredLevel,
        areaNumber: equipmentTemplate.areaNumber,
        equipmentBudget: { ...equipmentTemplate.budget },
        ...(template.visualAssetId ? { visualAssetId: template.visualAssetId } : {}),
        source: dungeonId,
      };
    }
    return null;
  }

  #ensureBundledContent() {
    if (this.bundledContentEnsured) return;
    for (const manifest of this.bundledManifests) {
      const manifestJson = JSON.stringify(manifest);
      const existing = this.manifestRepository.list().find((record) => record.source === 'bundled' && record.arcId === manifest.arc.id && JSON.stringify(record.manifest) === manifestJson);
      if (existing) {
        if (existing.status !== 'published') this.publish(existing.id);
        continue;
      }
      const saved = this.saveDraft(structuredClone(manifest), { source: 'bundled' });
      this.publish(saved.id);
    }
    this.bundledContentEnsured = true;
  }

  #projectCodex(record) {
    const { manifest, revision } = record;
    this.codexRepository.publishContentEntry({
      id: `generated-arc:${manifest.arc.id}`,
      type: 'lore',
      title: manifest.arc.title,
      summary: manifest.arc.premise,
      body: `${manifest.arc.premise}\n\nProgression: ${manifest.arc.progression.metric} · target ${manifest.arc.progression.target}.`,
      arcId: manifest.arc.id,
      source: 'arc-manifest',
      version: revision,
      tags: ['world-arc', manifest.arc.id],
    });
    for (const lore of manifest.lore) {
      this.codexRepository.publishContentEntry({
        id: `generated-lore:${manifest.arc.id}:${lore.id}`,
        type: 'lore',
        title: lore.title,
        summary: lore.summary,
        body: lore.body,
        arcId: manifest.arc.id,
        source: 'arc-manifest',
        version: revision,
        tags: [...(lore.tags || []), manifest.arc.id],
      });
    }
  }
}