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

test('streamlined runs reject obsolete temporary run choices instead of silently applying them', () => {
  const run = startStreamlinedRun();
  assert.throws(() => run.chooseUpgrade('sharpen'), /do not use temporary run powers/i);
  assert.throws(() => run.chooseRunEvent('anything'), /do not use random run events/i);
});
