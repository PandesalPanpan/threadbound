import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateArenaCombat } from '../src/domain/ArenaCombatEngine.js';

const WEAPONS = Object.freeze({
  frontline: Object.freeze({ name: 'Bronze Sword', slot: 'weapon', weaponFamily: 'sword', combatProfileCode: 'frontline' }),
  ranged: Object.freeze({ name: 'Ashstring Bow', slot: 'weapon', weaponFamily: 'bow', combatProfileCode: 'ranged' }),
  healer: Object.freeze({ name: 'Copper Sparkstaff', slot: 'weapon', weaponFamily: 'staff', combatProfileCode: 'healer' }),
});

function attackAgainst(profile) {
  const weapon = WEAPONS[profile];
  return simulateArenaCombat({
    players: [{
      id: 'player', name: 'Player', hp: 100, maxHp: 100, attack: 10, defense: 1,
      speed: 10, critChance: 0, mana: 0, maxMana: 100, manaGain: 0,
      equipment: { weapon }, equippedItem: weapon,
    }],
    enemies: [{
      id: 'target', name: 'Target', hp: 500, maxHp: 500, attack: 1, defense: 0,
      speed: 1, critChance: 0, mana: 0, maxMana: 100, manaGain: 0,
    }],
    context: { activity: 'loadout-test', battleId: `basic-${profile}` },
    durationMs: 20_000,
  });
}

function playerAttackEvents(result, playerId) {
  return result.replay.events.filter((event) => event.kind === 'action' && event.actorId === playerId && event.damageEvents.length);
}

test('Weapon profiles make basic strikes trade damage for ranged reach and healing', () => {
  const frontline = attackAgainst('frontline');
  const ranged = attackAgainst('ranged');
  const healer = attackAgainst('healer');
  const firstBasicDamage = (result) => result.turns.find((turn) => (
    turn.actorId === 'player' && turn.metadata.actionType === 'basic-attack'
  ))?.targetDamage;

  assert.equal(firstBasicDamage(frontline), 10);
  assert.equal(firstBasicDamage(ranged), 8);
  assert.equal(firstBasicDamage(healer), 7);
  assert.equal(ranged.turns.find((turn) => turn.actorId === 'player' && turn.metadata.actionType === 'basic-attack')
    .metadata.basicAttackDamageMultiplier, 0.8);
  assert.equal(healer.turns.find((turn) => turn.actorId === 'player' && turn.metadata.actionType === 'basic-attack')
    .metadata.basicAttackDamageMultiplier, 0.7);
});

test('healer ordinary actions restore the most injured ally and build Mana', () => {
  const weapon = WEAPONS.healer;
  const result = simulateArenaCombat({
    players: [
      { id: 'healer', name: 'Healer', hp: 40, maxHp: 40, attack: 6, defense: 2, speed: 10, mana: 0, equipment: { weapon }, equippedItem: weapon },
      { id: 'ally', name: 'Ally', hp: 50, maxHp: 100, attack: 6, defense: 2, speed: 10, mana: 0 },
    ],
    enemies: [{ id: 'target', name: 'Target', hp: 500, maxHp: 500, attack: 1, defense: 0, speed: 1, mana: 0 }],
    context: { activity: 'loadout-test', battleId: 'basic-heal' },
    durationMs: 500,
  });
  const heal = result.turns.find((turn) => turn.actorId === 'healer' && turn.metadata.healingEvents?.length);

  assert.ok(heal, 'the healer uses a regular action for healing without waiting for its signature skill');
  assert.deepEqual(heal.metadata.healingEvents.map(({ targetId, healing }) => ({ targetId, healing })), [
    { targetId: 'ally', healing: 7 },
  ]);
  assert.ok(heal.metadata.manaAfter > heal.metadata.manaBefore, 'a basic heal builds Mana');
});

test('solo healer clears a bounded encounter by attacking when healing is unnecessary', () => {
  const healer = WEAPONS.healer;
  const input = {
    players: [{
      id: 'healer', name: 'Healer', hp: 40, maxHp: 40, attack: 6, defense: 2, speed: 10,
      mana: 0, manaGain: 0, equipment: { weapon: healer }, equippedItem: healer,
    }],
    enemies: [{ id: 'slime', name: 'Slime', hp: 16, maxHp: 16, attack: 1, defense: 0, speed: 1, mana: 0, manaGain: 0 }],
    context: { activity: 'loadout-test', battleId: 'solo-healer' },
    durationMs: 60_000,
  };
  const result = simulateArenaCombat(input);

  assert.equal(result.outcome, 'victory');
  assert.ok(result.durationMs < 60_000, 'the healer finishes before the bounded encounter limit');
  assert.ok(result.turns.some((turn) => turn.actorId === 'healer' && turn.targetDamage > 0), 'the healer attacks when no one needs healing');
  assert.ok(result.turns.every((turn) => !turn.metadata.healingEvents?.length), 'combat does not create healing when the solo player is healthy');
});

test('starting formation changes the time to attack in the same deterministic encounter', () => {
  const weapon = WEAPONS.frontline;
  const input = {
    players: [{ id: 'fighter', name: 'Fighter', hp: 60, maxHp: 60, attack: 12, defense: 2, speed: 10, critChance: 0, mana: 0, manaGain: 0, equipment: { weapon }, equippedItem: weapon }],
    enemies: [{ id: 'boar', name: 'Boar', hp: 45, maxHp: 45, attack: 7, defense: 1, speed: 12, critChance: 0, mana: 0, manaGain: 0, targetingProfile: 'hunter' }],
    context: { activity: 'formation-test', battleId: 'same-fight' },
    durationMs: 20_000,
  };
  const near = simulateArenaCombat({ ...input, placements: { fighter: { x: 3, y: 5 }, boar: { x: 3, y: 2 } } });
  const far = simulateArenaCombat({ ...input, placements: { fighter: { x: 0, y: 7 }, boar: { x: 3, y: 2 } } });
  const firstAttackAt = (result) => playerAttackEvents(result, 'fighter')[0]?.atMs;

  assert.equal(near.outcome, 'victory');
  assert.equal(far.outcome, 'victory');
  assert.equal(firstAttackAt(near), 700);
  assert.equal(firstAttackAt(far), 2_000);
  assert.ok(near.durationMs < far.durationMs, 'the closer formation ends the same fight sooner');
});

test('ranged units reposition and keep attacking while movement reservations stay legal', () => {
  const weapon = WEAPONS.ranged;
  const result = simulateArenaCombat({
    players: [{ id: 'archer', name: 'Archer', hp: 100, maxHp: 100, attack: 10, defense: 0, speed: 10, critChance: 0, mana: 0, manaGain: 0, equipment: { weapon }, equippedItem: weapon }],
    enemies: [{ id: 'guard', name: 'Guard', hp: 90, maxHp: 90, attack: 7, defense: 0, speed: 10, critChance: 0, mana: 0, manaGain: 0, combatRole: 'frontline' }],
    context: { activity: 'kiting-test', battleId: 'bow-vs-guard' },
    durationMs: 20_000,
    includeFrames: true,
  });
  const moves = result.replay.events.filter((event) => event.kind === 'move' && event.unitId === 'archer');
  const attacks = playerAttackEvents(result, 'archer');
  const retreat = moves.find((move) => move.toY > move.fromY);

  assert.equal(result.outcome, 'victory');
  assert.ok(retreat, 'the archer backs away when a frontline threat closes in');
  assert.ok(attacks.some((attack) => attack.atMs > retreat.atMs), 'the archer resumes attacks after kiting');
  assert.ok(attacks.length > moves.length, 'repositioning does not consume every attack opportunity');
  for (const move of moves) {
    assert.ok([move.fromX, move.toX, move.fromY, move.toY].every((coordinate) => coordinate >= 0 && coordinate <= 7));
  }
  for (const frame of result.frames) {
    const reserved = new Set();
    for (const unit of frame.units.filter((candidate) => !candidate.defeated)) {
      for (const tile of [`${unit.x},${unit.y}`, ...(unit.motion ? [`${unit.motion.x},${unit.motion.y}`] : [])]) {
        assert.ok(!reserved.has(tile), `live units never share a reserved tile at ${frame.timeMs} ms`);
        reserved.add(tile);
      }
    }
  }
});
