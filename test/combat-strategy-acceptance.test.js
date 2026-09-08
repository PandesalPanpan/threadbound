import test from 'node:test';
import assert from 'node:assert/strict';
import { DungeonRun } from '../src/domain/DungeonRun.js';

const comparisonDungeon = Object.freeze({
  id: 'combo-lab',
  name: 'Combo Lab',
  recommendedPlayers: 2,
  minPlayers: 1,
  maxPlayers: 4,
  encounters: Object.freeze([
    Object.freeze({ id: 'training-weave', name: 'Training Weave', hp: 100, retaliation: 1 }),
  ]),
  boss: Object.freeze({ id: 'training-knot', name: 'Training Knot', hp: 100, retaliation: 1 }),
});

function preparedRun(id) {
  const run = DungeonRun.start({
    id,
    ownerType: 'party',
    ownerId: 'party-1',
    startedByPlayerId: 'p1',
    participants: [
      { playerId: 'p1', maxHealth: 80 },
      { playerId: 'p2', maxHealth: 80 },
    ],
    dungeonId: comparisonDungeon.id,
    dungeonDefinition: comparisonDungeon,
  });
  const state = run.toJSON();
  state.participants[0].focus = 2;
  state.participants[1].focus = 3;
  return new DungeonRun(state);
}

test('with earned Focus available, a coordinated setup-finisher window materially beats two plain Attacks', () => {
  const basic = preparedRun('basic-window');
  const basicStartHp = basic.toJSON().enemy.hp;
  basic.attack({ playerId: 'p1', attackPower: 6 });
  basic.attack({ playerId: 'p2', attackPower: 6 });
  const basicDamage = basicStartHp - basic.toJSON().enemy.hp;

  const combo = preparedRun('combo-window');
  const comboStartHp = combo.toJSON().enemy.hp;
  combo.useSkill({ playerId: 'p1', skillId: 'piercing-stitch', attackPower: 6 });
  const finisher = combo.useSkill({ playerId: 'p2', skillId: 'severing-knot', attackPower: 6 });
  const comboDamage = comboStartHp - combo.toJSON().enemy.hp;

  assert.equal(basicDamage, 12);
  assert.equal(comboDamage, 22);
  assert.ok(comboDamage >= basicDamage * 1.5, `expected combo ${comboDamage} to materially beat basic ${basicDamage}`);
  assert.ok(finisher.events.some((event) => event.type === 'SkillComboTriggered' && event.combo === 'exposed'));
});
