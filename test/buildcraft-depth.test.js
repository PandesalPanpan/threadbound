import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';
import { deriveRunBuild } from '../src/domain/RunBuildPolicy.js';
import { criticalStrike } from '../src/domain/CriticalStrikePolicy.js';

function dungeonWith(enemy) {
  return {
    id: 'buildcraft-lab',
    name: 'Buildcraft Lab',
    minPlayers: 1,
    maxPlayers: 4,
    encounters: [{ ...enemy }],
    boss: { id: 'lab-boss', name: 'Lab Boss', hp: 40, retaliation: 4, abilities: ['basic_retaliation'], intentCadence: 3 },
  };
}

function startRun({ id, enemy }) {
  return DungeonRun.start({
    id,
    ownerType: 'player',
    ownerId: 'p1',
    startedByPlayerId: 'p1',
    participants: [{ playerId: 'p1', maxHealth: 40 }],
    dungeonId: 'buildcraft-lab',
    dungeonDefinition: dungeonWith(enemy),
    now: '2026-09-09T00:00:00.000Z',
  });
}

test('RunBuildPolicy composes three mechanical build paths from durable selected power IDs', () => {
  const guard = deriveRunBuild(['silk-ward', 'riposte']);
  assert.equal(guard.modifiers.guardFocusBonus, 1);
  assert.equal(guard.modifiers.guardCounterBonus, 2);
  assert.ok(guard.archetypes.some((entry) => entry.id === 'guard' && entry.count === 2));
  assert.ok(guard.synergies.some((entry) => entry.id === 'guard-riposte'));

  const control = deriveRunBuild(['disrupt', 'breaker-knot']);
  assert.equal(control.modifiers.interruptFocusBonus, 2);
  assert.equal(control.modifiers.interruptCounterBonus, 3);
  assert.ok(control.archetypes.some((entry) => entry.id === 'control' && entry.count === 2));
  assert.ok(control.synergies.some((entry) => entry.id === 'interrupt-control'));

  const expose = deriveRunBuild(['sharpen', 'needle-rush', 'tempered-edge']);
  assert.equal(expose.modifiers.exposedDamageBonus, 2);
  assert.equal(expose.modifiers.exposedCritChanceBonus, 0.2);
  assert.equal(expose.modifiers.skillFocusRefund, 1);
  assert.ok(expose.synergies.some((entry) => entry.id === 'expose-crit'));
  assert.ok(expose.synergies.some((entry) => entry.id === 'focus-skills'));
});

test('Guard/Riposte build makes answering heavy pressure strictly better than blind Attack', () => {
  const run = startRun({
    id: 'guard-build',
    enemy: { id: 'heavy', name: 'Heavy', hp: 30, retaliation: 2, abilities: ['heavy_pressure'], intentCadence: 1 },
  });
  const opened = run.attack({ playerId: 'p1', attackPower: 2, now: '2026-09-09T00:00:01.000Z' });
  assert.equal(opened.state.enemyIntent?.reaction, 'guard');

  const state = structuredClone(opened.state);
  state.selectedUpgrades = ['silk-ward', 'riposte'];
  state.reactionStyle = 'guard';

  const ignored = new DungeonRun(state).attack({ playerId: 'p1', attackPower: 2, now: '2026-09-09T00:00:02.000Z' });
  const guarded = new DungeonRun(state).guard({ playerId: 'p1', now: '2026-09-09T00:00:02.000Z' });

  const ignoredPlayer = ignored.state.participants[0];
  const guardedPlayer = guarded.state.participants[0];
  assert.ok(guardedPlayer.hp > ignoredPlayer.hp, 'Guard should preserve more HP than ignoring a heavy intent.');
  assert.ok(guardedPlayer.focus > ignoredPlayer.focus, 'The Guard build should convert the correct reaction into extra Focus.');
  assert.equal(guardedPlayer.reactionDamageBonus, 5, 'Base riposte plus selected power bonus should prime a stronger counter.');
  assert.ok(guarded.events.some((event) => event.type === 'RunPowerTriggered' && event.trigger === 'guard-riposte'));
});

test('Interrupt/Control build cancels self-mend and converts the reaction into Focus plus counter tempo', () => {
  const run = startRun({
    id: 'control-build',
    enemy: { id: 'mender', name: 'Mender', hp: 30, retaliation: 2, abilities: ['self_mend'], intentCadence: 1 },
  });
  const opened = run.attack({ playerId: 'p1', attackPower: 2, now: '2026-09-09T00:00:01.000Z' });
  assert.equal(opened.state.enemyIntent?.reaction, 'interrupt');

  const state = structuredClone(opened.state);
  state.selectedUpgrades = ['disrupt', 'breaker-knot'];
  state.reactionStyle = 'interrupt';

  const ignored = new DungeonRun(state).attack({ playerId: 'p1', attackPower: 2, now: '2026-09-09T00:00:02.000Z' });
  const interrupted = new DungeonRun(state).interrupt({ playerId: 'p1' });

  assert.ok(interrupted.state.enemy.hp < ignored.state.enemy.hp, 'Interrupt should prevent the mender from undoing progress.');
  assert.equal(interrupted.state.participants[0].focus, 4, 'Control powers should accelerate Focus generation up to the cap.');
  assert.equal(interrupted.state.participants[0].reactionDamageBonus, 7, 'Interrupt build should prime a large next-hit counter.');
  assert.ok(interrupted.events.some((event) => event.type === 'RunPowerTriggered' && event.trigger === 'interrupt-control'));

  const followUp = new DungeonRun(interrupted.state).attack({ playerId: 'p1', attackPower: 2, now: '2026-09-09T00:00:03.000Z' });
  assert.ok(followUp.damage >= 9, 'The control counter should materially improve the next strike.');
});

test('Expose/Crit/Focus build improves exposed damage, crit chance, and damage-skill Focus economy', () => {
  const build = deriveRunBuild(['sharpen', 'needle-rush', 'tempered-edge']);
  const crit = criticalStrike({
    runId: 'expose-build',
    runVersion: 1,
    playerId: 'p1',
    enemyId: 'dummy',
    actionKey: 'attack',
    baseDamage: 4,
    exposed: true,
    chanceBonus: build.modifiers.exposedCritChanceBonus,
  });
  assert.equal(crit.chance, 0.5);

  const run = startRun({
    id: 'expose-build',
    enemy: { id: 'dummy', name: 'Dummy', hp: 60, retaliation: 1, abilities: ['basic_retaliation'], intentCadence: 5 },
  });
  run.state.selectedUpgrades = ['sharpen', 'needle-rush', 'tempered-edge'];
  run.state.enemy.statuses.exposed = 1;
  run.state.participants[0].focus = 4;

  const skill = run.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 2, now: '2026-09-09T00:00:01.000Z' });
  assert.ok(skill.damage >= 6, 'Exposed damage bonus should apply through the authoritative damage-skill path.');
  assert.equal(skill.state.participants[0].focus, 3, 'Tempered Edge should refund 1 Focus after the damage skill connects.');
  assert.ok(skill.events.some((event) => event.type === 'RunPowerTriggered' && event.trigger === 'exposed-damage'));
  assert.ok(skill.events.some((event) => event.type === 'RunPowerTriggered' && event.trigger === 'skill-focus-refund'));
});
