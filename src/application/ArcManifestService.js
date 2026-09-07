import { randomUUID } from 'node:crypto';
import { DUNGEONS, RUN_UPGRADES } from '../domain/DungeonRun.js';
import { ITEM_EFFECTS } from '../domain/ItemGenerator.js';
import { allCanonicalNarrativeEntries } from '../content/CanonicalContent.js';
import { ALLOWED_ENEMY_ABILITIES, BALANCE_BUDGETS, ArcManifestValidator, MANIFEST_VERSION } from './ArcManifestValidator.js';

export class ArcManifestService {
  constructor({ gameRepository, codexRepository, manifestRepository, validator = new ArcManifestValidator(), idFactory = randomUUID, rng = Math.random }) {
    this.gameRepository = gameRepository;
    this.codexRepository = codexRepository;
    this.manifestRepository = manifestRepository;
    this.validator = validator;
    this.idFactory = idFactory;
    this.rng = rng;
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
        'All dungeon encounter, boss, and reward-pool references must resolve within the same manifest.',
        'Return JSON only when generating an Arc Manifest for upload.',
      ],
    };
  }

  validate(manifest) { return this.validator.validate(manifest); }

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
    const result = [];
    for (const record of this.manifestRepository.listPublished()) {
      const manifest = record.manifest;
      const enemies = new Map(manifest.enemies.map((enemy) => [enemy.id, enemy]));
      const bosses = new Map(manifest.bosses.map((boss) => [boss.id, boss]));
      for (const dungeon of manifest.dungeons) {
        const boss = bosses.get(dungeon.bossId);
        result.push({
          id: dungeon.id,
          name: dungeon.name,
          recommendedPlayers: dungeon.recommendedPlayers,
          minPlayers: 1,
          maxPlayers: 4,
          encounters: dungeon.encounters.map((enemyId) => {
            const enemy = enemies.get(enemyId);
            return { id: enemy.id, name: enemy.name, hp: enemy.baseHp, retaliation: enemy.retaliation, abilities: [...enemy.abilities] };
          }),
          boss: { id: boss.id, name: boss.name, hp: boss.baseHp, retaliation: boss.retaliation, abilities: [...boss.abilities] },
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
    return this.runtimeDungeons().find((dungeon) => dungeon.id === id) || null;
  }

  generateReward(dungeonId) {
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
