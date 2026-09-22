import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcManifestValidator } from '../src/application/ArcManifestValidator.js';
import { GLASSWAKE_ARC_MANIFEST } from '../src/content/BundledArcManifests.js';
import { prepareSimpleDungeon } from '../src/domain/SimpleDungeonPolicy.js';
import { selectEncounterSequence } from '../src/domain/RunVariationPolicy.js';

test('Arc manifests accept grouped encounter stages and keep flat compatibility sequences', () => {
  const manifest = structuredClone(GLASSWAKE_ARC_MANIFEST);
  manifest.dungeons[0].encounters = [
    ['glass-skulker', 'stitch-leech'],
    ['mirror-warden', 'glass-skulker', 'stitch-leech'],
  ];
  manifest.dungeons[0].encounterVariants = [[
    ['shard-choir', 'glass-skulker'],
    ['mirror-warden'],
  ]];
  assert.equal(new ArcManifestValidator().validate(manifest).valid, true);

  const dungeon = {
    id: 'grouped',
    encounters: [
      [{ id: 'a', hp: 10 }, { id: 'b', hp: 10 }],
      [{ id: 'c', hp: 10 }],
    ],
    encounterVariants: [[
      [{ id: 'd', hp: 10 }, { id: 'e', hp: 10 }],
      [{ id: 'f', hp: 10 }],
    ]],
    boss: { id: 'boss', hp: 20, retaliation: 2 },
  };
  const selection = selectEncounterSequence(dungeon, 0.9);
  assert.equal(selection.stages.length, 2);
  assert.equal(selection.stages[0].length, 2);
  assert.equal(selection.encounters.length, 2);
  const prepared = prepareSimpleDungeon(dungeon);
  assert.equal(prepared.simpleStages[0].length, 2);
  assert.equal(prepared.encounters.length, 2);
});

test('Arc stage validation rejects oversized groups, unknown IDs, and executable targeting fields', () => {
  const oversized = structuredClone(GLASSWAKE_ARC_MANIFEST);
  oversized.dungeons[0].encounters = [['glass-skulker', 'stitch-leech', 'mirror-warden', 'shard-choir']];
  let result = new ArcManifestValidator().validate(oversized);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'invalid_encounter_group'));

  const unknown = structuredClone(GLASSWAKE_ARC_MANIFEST);
  unknown.dungeons[0].encounters = [['glass-skulker', 'missing-enemy']];
  result = new ArcManifestValidator().validate(unknown);
  assert.ok(result.errors.some((error) => error.code === 'unknown_enemy_reference'));

  const executable = structuredClone(GLASSWAKE_ARC_MANIFEST);
  executable.enemies[0].targetingCode = 'return player.hp < 10';
  result = new ArcManifestValidator().validate(executable);
  assert.ok(result.errors.some((error) => error.code === 'unsupported_enemy_field'));
});
