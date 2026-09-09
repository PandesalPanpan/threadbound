import { randomUUID } from 'node:crypto';
import { DUNGEONS, RUN_UPGRADES } from '../domain/DungeonRun.js';
import { ITEM_EFFECTS } from '../domain/ItemGenerator.js';
import { selectEncounterSequence } from '../domain/RunVariationPolicy.js';
import { allCanonicalNarrativeEntries } from '../content/CanonicalContent.js';
import { BUNDLED_ARC_MANIFESTS } from '../content/BundledArcManifests.js';
import { ALLOWED_ENEMY_ABILITIES, BALANCE_BUDGETS, ArcManifestValidator, MANIFEST_VERSION } from './ArcManifestValidator.js';
import { ArcManifestReplayabilityValidator } from './ArcManifestReplayabilityValidator.js';

export class ArcManifestService {
  constructor({ gameRepository, codexRepository, manifestRepository, validator = new ArcManifestValidator(), replayabilityValidator = new ArcManifestReplayabilityValidator(), bundledManifests = BUNDLED_ARC_MANIFESTS, idFactory = randomUUID, rng = Math.random }) {
    this.gameRepository = gameRepository;
    this.codexRepository = codexRepository;
    this.manifestRepository = manifestRepository;
    this.validator = validator;
    this.replayabilityValidator = replayabilityValidator;
    this.bundledManifests = [...bundledManifests];
    this.idFactory = idFactory;
    this.rng = rng;
    this.bundledContentEnsured = false;
  }

  worldContext() {
    return {
      contextVersion: 1,
      manifestVersion: MANIFEST_VERSION,
      exportedAt: new Date().toISOString(),
      currentWorld: this.gameRepository.getWorldState(),
      canonicalNarrative: allCanonicalNarrativeEntries(),
      canonicalDungeons: structuredClone(DUNGEONS),
      allowedMechanics: {
        enemyAbilities: [...ALLOWED_ENEMY_ABILITIES],
        itemEffects: Object.values(ITEM_EFFECTS).map((effect) => ({ ...effect })),
        runUpgrades: Object.values(RUN_UPGRADES).map((upgrade) => ({ ...upgrade })),
        replayability: {
          intentCadence: { min: 1, max: 6 },
          encounterVariants: true,
          manifestRunEvents: true,
        },
      },
      balanceBudgets: structuredClone(BALANCE_BUDGETS),
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
        'Do not invent executable code or mechanics outside this context.',
        'Keep all numeric values inside the supplied balance budgets.',
        'Encounter variants must reference enemies from the same manifest.',
        'Run event schedules may only reference runEvents from the same manifest.',
        'All dungeon encounter, boss, and reward-pool references must resolve within the same manifest.',
        'Return JSON only when generating an Arc Manifest for upload.',
      ],
    };
  }

  validate(manifest) {
    const base = this.validator.validate(manifest);
    const replayability = this.replayabilityValidator.validate(manifest);
    return {
      valid: base.valid && replayability.valid,
      errors: [...base.errors, ...replayability.errors],
      warnings: [...base.warnings, ...replayability.warnings],
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
      const effectCode = template.effects[0] || 'none';
      const effect = ITEM_EFFECTS[effectCode] || ITEM_EFFECTS.none;
      return {
        id: this.idFactory(),
        definitionId: template.id,
        name: template.namePattern.replaceAll('{suffix}', 'the Loom').replaceAll('{arc}', record.manifest.arc.title),
        slot: 'weapon',
        rarity: template.rarity,
        attackBonus: template.attackBonus,
        effectCode,
        effect,
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
