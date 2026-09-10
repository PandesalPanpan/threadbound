import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureRun } from '../src/domain/AdventureRun.js';

function startStreamlinedRun() {
  return AdventureRun.start({
    id: 'streamlined-run',
    ownerType: 'player',
    ownerId: 'p1',
    startedByPlayerId: 'p1',
    dungeonId: 'frayed-hollow',
    participants: [{ playerId: 'p1', maxHealth: 40 }],
  });
}

test('new AdventureRun skips random run events and temporary powers before the boss', () => {
  const run = startStreamlinedRun();
  assert.equal(run.toJSON().streamlinedLoop, true);
  assert.equal(run.toJSON().streamlinedSkills, true);
  assert.equal(run.toJSON().runEventSchedule, null);
  assert.equal(run.toJSON().runPowerDraftsEnabled, false);

  for (let encounter = 0; encounter < 3; encounter += 1) {
    const before = run.toJSON();
    assert.equal(before.phase, 'combat');
    const outcome = run.attack({ playerId: 'p1', attackPower: 100 });
    assert.equal(outcome.events.some((event) => event.type === 'RunEventDiscovered'), false);
    assert.equal(outcome.events.some((event) => event.type === 'RunUpgradeOffered'), false);
    assert.equal(outcome.events.some((event) => event.type === 'RunUpgradeChosen'), false);
  }

  const boss = run.toJSON();
  assert.equal(boss.phase, 'boss');
  assert.equal(boss.enemy?.isBoss, true);
  assert.equal(boss.enemy?.name, 'The First Needle');
  assert.equal(boss.runAttackBonus, 0);
  assert.equal(boss.selectedUpgrade, null);
  assert.deepEqual(boss.selectedUpgrades, []);
  assert.deepEqual(boss.runEventHistory, []);

  run.attack({ playerId: 'p1', attackPower: 100 });
  assert.equal(run.toJSON().phase, 'complete');
});

test('streamlined skills are immediately usable, cooldown-only, and do not leak Focus or Exposed', () => {
  const run = startStreamlinedRun();
  const before = run.toJSON();
  assert.equal(before.participants[0].focus, 0);
  assert.equal(before.enemy.statuses.exposed, 0);

  const skill = run.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 3 });
  assert.equal(skill.skillId, 'piercing-stitch');
  assert.equal(skill.state.participants[0].focus, 0);
  assert.equal(skill.state.enemy.statuses.exposed, 0);
  assert.equal(skill.state.participants[0].skillCooldowns['piercing-stitch'], 2);
  assert.equal(skill.events.some((event) => event.type === 'FocusChanged'), false);
  assert.equal(skill.events.some((event) => event.type === 'EnemyStatusApplied' && event.status === 'exposed'), false);
  assert.equal(skill.events.some((event) => event.type === 'SkillComboTriggered'), false);
  assert.equal(skill.events.find((event) => event.type === 'CombatSkillUsed')?.focusCost, 0);

  assert.throws(
    () => run.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 3 }),
    /cooldown/i,
  );

  const firstAttack = run.attack({ playerId: 'p1', attackPower: 1 });
  assert.equal(firstAttack.state.participants[0].focus, 0);
  assert.equal(firstAttack.state.participants[0].skillCooldowns['piercing-stitch'], 1);
  assert.equal(firstAttack.events.some((event) => event.type === 'FocusChanged'), false);

  const secondAttack = run.attack({ playerId: 'p1', attackPower: 1 });
  assert.equal(secondAttack.state.participants[0].focus, 0);
  assert.equal(secondAttack.state.participants[0].skillCooldowns['piercing-stitch'], 0);
});

test('streamlined runs reject obsolete temporary run choices instead of silently applying them', () => {
  const run = startStreamlinedRun();
  assert.throws(() => run.chooseUpgrade('sharpen'), /do not use temporary run powers/i);
  assert.throws(() => run.chooseRunEvent('anything'), /do not use random run events/i);
});
