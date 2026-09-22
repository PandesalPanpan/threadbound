import test from 'node:test';
import assert from 'node:assert/strict';
import { battleViewModel, phaseFromRun, projectCombatOutcome, resolveVisualAsset, selectSkill } from '../frontend/src/battle/presentation.js';
import { presentBattleTeams, presentBattleUnit } from '../frontend/src/battle/visuals.js';

const run = {
  id: 'run-1',
  phase: 'combat',
  version: 4,
  encounterIndex: 0,
  viewer: { playerId: 'player-1', displayName: 'Rune Bard', hp: 18, maxHp: 24, focus: 2, maxFocus: 4, skillCooldowns: {} },
  participants: [{ playerId: 'player-1', displayName: 'Rune Bard', hp: 18, maxHp: 24, focus: 2, maxFocus: 4 }],
  enemy: { id: 'rot-toad', name: 'Rot Toad', hp: 10, maxHp: 14, isBoss: false },
};

test('phase projection follows the authoritative run state', () => {
  assert.equal(phaseFromRun(null), 'preBattle');
  assert.equal(phaseFromRun(run), 'live');
  assert.equal(phaseFromRun({ ...run, phase: 'upgrade' }), 'decision');
  assert.equal(phaseFromRun({ ...run, phase: 'complete' }), 'result');
});

test('battle view model keeps arbitrary attacker and target data intact', () => {
  const assets = [
    { id: 'character.road-sellsword.v1', kind: 'character', src: '/wizard.webp', provenance: { sourceCollection: 'figma-character-library-v1' } },
    { id: 'mob.frost-blob.v1', kind: 'mob', src: '/toad.webp', provenance: { sourceCollection: 'figma-character-library-v1' } },
  ];
  const model = battleViewModel({ dashboard: { character: { id: 'player-1', displayName: 'Rune Bard' } }, assets, outcome: { state: run } });
  assert.equal(model.attacker.name, 'Rune Bard');
  assert.equal(model.target.name, 'Rot Toad');
  assert.equal(model.target.asset.id, 'mob.frost-blob.v1');
});

test('combat outcome projection reads damage and critical facts without recalculating them', () => {
  const projected = projectCombatOutcome({
    damage: 7,
    retaliation: 2,
    critical: true,
    events: [{ type: 'EnemyDamaged', damage: 7 }, { type: 'CriticalStrikeLanded' }],
    state: { ...run, enemy: { ...run.enemy, hp: 3 }, participants: [{ ...run.participants[0], hp: 16 }] },
  }, { action: 'attack', previousRun: run });
  assert.deepEqual(projected, {
    action: 'attack',
    skillId: null,
    damage: 7,
    retaliation: 2,
    critical: true,
    defeated: false,
    targetHpBefore: 10,
    targetHpAfter: 3,
    actorHpBefore: 18,
    actorHpAfter: 16,
    eventTypes: ['EnemyDamaged', 'CriticalStrikeLanded'],
  });
});

test('skill selection only exposes a server-provided affordable off-cooldown skill', () => {
  const skills = [{ id: 'piercing-stitch', kind: 'damage', cost: 2 }, { id: 'slow', kind: 'damage', cost: 3 }];
  assert.equal(selectSkill(skills, run).id, 'piercing-stitch');
  assert.equal(selectSkill(skills, { ...run, viewer: { ...run.viewer, focus: 1 } }), null);
  assert.equal(resolveVisualAsset({ id: 'rot-toad' }, 'mob', [{ id: 'mob.frost-blob.v1', kind: 'mob', src: '/toad.webp', provenance: { sourceCollection: 'figma-character-library-v1' } }]).id, 'mob.frost-blob.v1');
});

test('battle presentation preserves arbitrary rosters and falls back cleanly for unknown visuals', () => {
  const teams = presentBattleTeams([
    { id: 'player-a', displayName: 'Aster', team: 'players', hp: 12, maxHp: 12, visualAssetId: 'character.road-sellsword.v1' },
    { id: 'enemy-a', displayName: 'Thread Wolf', team: 'enemies', hp: 9, maxHp: 9, visualAssetId: 'mob.not-yet-catalogued.v1' },
  ], [
    { id: 'character.road-sellsword.v1', kind: 'character', src: '/rune-bard.webp', provenance: { sourceCollection: 'figma-character-library-v1' } },
    { id: 'mob.frost-blob.v1', kind: 'mob', src: '/frost-blob.webp', provenance: { sourceCollection: 'figma-character-library-v1' } },
  ]);

  assert.deepEqual(teams.players.map((unit) => unit.label), ['Aster']);
  assert.deepEqual(teams.enemies.map((unit) => unit.label), ['Thread Wolf']);
  assert.equal(teams.players[0].asset.id, 'character.road-sellsword.v1');
  assert.equal(teams.enemies[0].visualAssetId, null);
  assert.equal(teams.enemies[0].asset, null);
  assert.equal(presentBattleUnit({ id: 'rot-toad', name: 'Rot Toad', team: 'enemies', visualAssetId: 'mob.rot-toad-figma.v1' }, [
    { id: 'mob.frost-blob.v1', kind: 'mob', src: '/frost-blob.webp', provenance: { sourceCollection: 'figma-character-library-v1' } },
  ]).asset.id, 'mob.frost-blob.v1');
});
