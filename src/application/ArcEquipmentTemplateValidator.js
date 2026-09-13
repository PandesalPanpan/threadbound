import { visualAsset } from '../content/VisualAssetCatalog.js';
import { normalizeArcEquipmentTemplate, isExtendedArcEquipmentTemplate } from '../domain/ArcEquipmentTemplatePolicy.js';

export class ArcEquipmentTemplateValidator {
  validate(manifest) {
    const errors = [];
    const warnings = [];
    if (!Array.isArray(manifest?.itemPools)) return { valid: true, errors, warnings };

    manifest.itemPools.forEach((pool, poolIndex) => {
      if (!Array.isArray(pool?.items)) return;
      pool.items.forEach((template, itemIndex) => {
        const path = `itemPools[${poolIndex}].items[${itemIndex}]`;
        const extended = isExtendedArcEquipmentTemplate(template);
        try {
          normalizeArcEquipmentTemplate(template);
        } catch (error) {
          errors.push({ path, code: 'invalid_equipment_template', message: error.message });
        }

        if (extended) {
          if (!template?.visualAssetId) {
            errors.push({ path: `${path}.visualAssetId`, code: 'equipment_visual_asset_required', message: 'Extended equipment templates require an allowlisted item visualAssetId.' });
          } else if (!visualAsset(template.visualAssetId, 'item')) {
            errors.push({ path: `${path}.visualAssetId`, code: 'unknown_visual_asset', message: 'visualAssetId must reference an allowlisted item asset.' });
          }
        } else {
          warnings.push({ path, code: 'legacy_equipment_template', message: 'Legacy weapon-only equipment template accepted for migration compatibility; new Arc equipment should use slot, stats, requiredLevel, areaNumber, and visualAssetId.' });
        }
      });
    });
    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * ArcManifestValidator owns the legacy v1 structural/reference checks. Project
   * extended equipment into that older shape so the new domain policy can own
   * slot/stat/rarity/progression budgets without duplicating the entire validator.
   */
  projectForLegacyValidator(manifest) {
    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.itemPools)) return manifest;
    const projected = structuredClone(manifest);
    projected.itemPools = projected.itemPools.map((pool) => ({
      ...pool,
      items: Array.isArray(pool.items) ? pool.items.map((template) => {
        if (!isExtendedArcEquipmentTemplate(template)) return template;
        const next = { ...template };
        try {
          const normalized = normalizeArcEquipmentTemplate(template);
          next.attackBonus = Math.min(10, normalized.stats.attackBonus);
          if (normalized.rarity === 'mythic') next.rarity = 'legendary';
        } catch {
          if (!Number.isInteger(next.attackBonus)) next.attackBonus = 0;
          if (String(next.rarity || '').toLowerCase() === 'mythic') next.rarity = 'legendary';
        }
        return next;
      }) : pool.items,
    }));
    return projected;
  }
}
