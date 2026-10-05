// Experimental, deterministic sandbox. Never used by live combat or persistence.
export const ARENA_SIZE = 8;
export const ARENA_TICK_SECONDS = 0.25;
export const ARENA_ROSTER = Object.freeze([
  { id: 'guard', name: 'Tower Guard', role: 'Frontline', team: 'allies', visualAssetId: 'character.tower-guard.v1', maxHp: 150, damage: 11, range: 1.45, cooldown: 4, x: 3, y: 5, skill: 'Shield pulse', behavior: 'Closes in · shields nearby allies' },
  { id: 'archer', name: 'Camp Ranger', role: 'Ranged', team: 'allies', visualAssetId: 'character.camp-ranger.v1', maxHp: 78, damage: 14, range: 3.2, cooldown: 5, x: 2, y: 7, skill: 'Power shot', behavior: 'Keeps distance · targets the weakest enemy' },
  { id: 'healer', name: 'Wayfarer Healer', role: 'Support', team: 'allies', visualAssetId: 'character.wayfarer-healer.v1', maxHp: 85, damage: 7, range: 3.2, cooldown: 6, x: 5, y: 7, skill: 'Restore', behavior: 'Follows injured allies · heals before attacking' },
  { id: 'brawler', name: 'Chain Brawler', role: 'Frontline', team: 'enemies', visualAssetId: 'character.chain-brawler.v1', maxHp: 155, damage: 13, range: 1.45, cooldown: 4, x: 3, y: 2, skill: 'Heavy blow', behavior: 'Chases the nearest enemy' },
  { id: 'hunter', name: 'Bog Hunter', role: 'Ranged', team: 'enemies', visualAssetId: 'character.bog-hunter.v1', maxHp: 90, damage: 12, range: 3.2, cooldown: 5, x: 5, y: 0, skill: 'Power shot', behavior: 'Keeps distance · targets the weakest enemy' },
  { id: 'mystic', name: 'Herb Mystic', role: 'Support', team: 'enemies', visualAssetId: 'character.herb-mystic.v1', maxHp: 80, damage: 6, range: 3.2, cooldown: 6, x: 1, y: 0, skill: 'Restore', behavior: 'Follows injured allies · heals before attacking' },
]);

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const snapshot = (units) => units.map((unit) => ({ ...unit }));
const living = (units, team) => units.filter((unit) => unit.hp > 0 && unit.team === team);

export function createArenaUnits(placement = {}) {
  const claimed = new Set();
  return ARENA_ROSTER.map((definition) => {
    const position = placement[definition.id] || definition;
    const { x, y } = position;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= ARENA_SIZE || y < 0 || y >= ARENA_SIZE
      || (definition.team === 'allies' && y < 5) || (definition.team === 'enemies' && (x !== definition.x || y !== definition.y))) {
      throw new Error('Place your team in the bottom three rows.');
    }
    const key = `${x},${y}`;
    if (claimed.has(key)) throw new Error('Each unit needs its own tile.');
    claimed.add(key);
    return { ...definition, x, y, hp: definition.maxHp, mana: 0, shield: 0, readyAt: 0, moveAt: 0, targetId: null, intent: 'Ready', facing: definition.team === 'allies' ? 1 : -1 };
  });
}

// Breadth-first path search around occupied tiles. Return the first step to an
// attack/heal position, rather than walking through another living unit.
function approach(unit, target, units, range) {
  const occupied = new Set(units.filter((other) => other.hp > 0 && other.id !== unit.id).map((other) => `${other.x},${other.y}`));
  const queue = [{ x: unit.x, y: unit.y, first: null }];
  const visited = new Set([`${unit.x},${unit.y}`]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor];
    if (cell.first && distance(cell, target) <= range) return cell.first;
    const candidates = [[0, -1], [-1, 0], [1, 0], [0, 1]].map(([dx, dy]) => ({ x: cell.x + dx, y: cell.y + dy }));
    candidates.sort((a, b) => distance(a, target) - distance(b, target));
    for (const next of candidates) {
      const key = `${next.x},${next.y}`;
      if (next.x < 0 || next.x >= ARENA_SIZE || next.y < 0 || next.y >= ARENA_SIZE || occupied.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push({ ...next, first: cell.first || next });
    }
  }
  return null;
}

function retreat(unit, threats, units) {
  const occupied = new Set(units.filter((other) => other.hp > 0 && other.id !== unit.id).map((other) => `${other.x},${other.y}`));
  const safety = (cell) => Math.min(...threats.map((threat) => distance(cell, threat)));
  return [[0, -1], [-1, 0], [1, 0], [0, 1]].map(([dx, dy]) => ({ x: unit.x + dx, y: unit.y + dy }))
    .filter((cell) => cell.x >= 0 && cell.x < ARENA_SIZE && cell.y >= 0 && cell.y < ARENA_SIZE && !occupied.has(`${cell.x},${cell.y}`) && safety(cell) > safety(unit) + 0.1)
    .sort((a, b) => safety(b) - safety(a))[0];
}

export function simulateArena(placement = {}, { maxTicks = 240 } = {}) {
  if (!Number.isInteger(maxTicks) || maxTicks < 1 || maxTicks > 240) throw new Error('Invalid simulation duration.');
  const units = createArenaUnits(placement);
  const frames = [{ tick: 0, units: snapshot(units), events: [] }];
  let outcome = 'draw';
  const totals = { damage: 0, healing: 0, skills: 0 };
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    const events = [];
    // Alternate team initiative to avoid permanent first-team priority.
    const order = tick % 2 ? units : [...units].reverse();
    for (const unit of order) {
      if (unit.hp <= 0) continue;
      const opponents = living(units, unit.team === 'allies' ? 'enemies' : 'allies');
      if (!opponents.length) break;
      const friends = living(units, unit.team);
      const injured = friends.filter((friend) => friend.hp < friend.maxHp * 0.82).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || distance(unit, a) - distance(unit, b));
      const healing = unit.role === 'Support' && injured.length > 0;
      const targets = healing ? injured : [...opponents].sort((a, b) => unit.role === 'Ranged'
        ? a.hp - b.hp || distance(unit, a) - distance(unit, b)
        : distance(unit, a) - distance(unit, b));
      const target = targets[0];
      unit.targetId = target.id;
      if (target.x !== unit.x) unit.facing = target.x > unit.x ? 1 : -1;
      const threats = opponents.filter((other) => other.role === 'Frontline' && distance(unit, other) < 2);
      // Ranged/support reposition between actions, preserving attack cadence.
      if (unit.role !== 'Frontline' && threats.length && tick >= unit.moveAt && tick < unit.readyAt) {
        const step = retreat(unit, threats, units);
        if (step) { Object.assign(unit, step); unit.moveAt = tick + 2; unit.intent = 'Keeping distance'; continue; }
      }
      if (distance(unit, target) > unit.range) {
        unit.intent = healing ? 'Following injured ally' : 'Closing in';
        if (tick >= unit.moveAt) {
          const step = approach(unit, target, units, unit.range);
          if (step) { Object.assign(unit, step); unit.moveAt = tick + 2; }
        }
        continue;
      }
      if (tick < unit.readyAt) { unit.intent = healing ? 'Preparing heal' : 'Preparing attack'; continue; }
      unit.readyAt = tick + unit.cooldown;
      unit.mana = Math.min(100, unit.mana + 25);
      const skill = unit.mana === 100 && (unit.role !== 'Support' || healing);
      if (skill) { unit.mana = 0; totals.skills += 1; }
      if (healing) {
        const amount = Math.min(target.maxHp - target.hp, skill ? 38 : 17);
        target.hp += amount;
        totals.healing += amount;
        unit.intent = skill ? 'Restore' : 'Healing';
        events.push({ type: 'heal', actor: unit.id, target: target.id, amount, skill, label: skill ? 'Restore' : 'Heal' });
      } else {
        if (skill && unit.id === 'guard') {
          for (const friend of friends.filter((friend) => distance(unit, friend) <= 2.5)) {
            const amount = Math.min(35 - friend.shield, 22);
            friend.shield += amount;
            events.push({ type: 'shield', actor: unit.id, target: friend.id, amount, skill: true, label: 'Shield pulse' });
          }
        }
        const raw = Math.round(unit.damage * (skill && unit.id !== 'guard' ? 2 : 1));
        const blocked = Math.min(target.shield, raw);
        target.shield -= blocked;
        const amount = Math.min(target.hp, raw - blocked);
        target.hp -= amount;
        totals.damage += amount;
        unit.intent = skill ? unit.skill : 'Attacking';
        events.push({ type: 'hit', actor: unit.id, target: target.id, amount, blocked, skill, label: skill ? unit.skill : 'Attack', ranged: unit.role !== 'Frontline' });
        if (target.hp === 0) { target.intent = 'Defeated'; target.targetId = null; events.push({ type: 'down', actor: unit.id, target: target.id, label: 'Defeated' }); }
      }
    }
    frames.push({ tick, units: snapshot(units), events });
    const alliesAlive = living(units, 'allies').length > 0;
    const enemiesAlive = living(units, 'enemies').length > 0;
    if (!alliesAlive || !enemiesAlive) { outcome = alliesAlive ? 'victory' : enemiesAlive ? 'defeat' : 'draw'; break; }
  }
  return { frames, outcome, totals, duration: (frames.length - 1) * ARENA_TICK_SECONDS };
}
