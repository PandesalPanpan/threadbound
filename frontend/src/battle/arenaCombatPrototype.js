// Experimental, deterministic sandbox. Never used by live combat or persistence.
export const ARENA_SIZE = 8;
export const ARENA_TICK_SECONDS = 0.05;
export const ARENA_ROSTER = Object.freeze([
  { id: 'guard', name: 'Tower Guard', role: 'Frontline', team: 'allies', visualAssetId: 'character.tower-guard.v1', maxHp: 150, damage: 11, range: 1.45, attackSpeed: 0.9, moveSpeed: 1.65, x: 3, y: 5, skill: 'Shield pulse', behavior: 'Closes in · shields nearby allies' },
  { id: 'archer', name: 'Camp Ranger', role: 'Ranged', team: 'allies', visualAssetId: 'character.camp-ranger.v1', maxHp: 78, damage: 14, range: 3.2, attackSpeed: 1.2, moveSpeed: 2.6, x: 2, y: 7, skill: 'Power shot', behavior: 'Keeps distance · targets the weakest enemy' },
  { id: 'healer', name: 'Wayfarer Healer', role: 'Support', team: 'allies', visualAssetId: 'character.wayfarer-healer.v1', maxHp: 85, damage: 7, range: 3.2, attackSpeed: 0.65, moveSpeed: 1.9, x: 5, y: 7, skill: 'Restore', behavior: 'Follows injured allies · heals before attacking' },
  { id: 'brawler', name: 'Chain Brawler', role: 'Frontline', team: 'enemies', visualAssetId: 'character.chain-brawler.v1', maxHp: 155, damage: 13, range: 1.45, attackSpeed: 0.85, moveSpeed: 1.8, x: 3, y: 2, skill: 'Heavy blow', behavior: 'Chases the nearest enemy' },
  { id: 'hunter', name: 'Bog Hunter', role: 'Ranged', team: 'enemies', visualAssetId: 'character.bog-hunter.v1', maxHp: 90, damage: 12, range: 3.2, attackSpeed: 1.05, moveSpeed: 2.3, x: 5, y: 0, skill: 'Power shot', behavior: 'Keeps distance · targets the weakest enemy' },
  { id: 'mystic', name: 'Herb Mystic', role: 'Support', team: 'enemies', visualAssetId: 'character.herb-mystic.v1', maxHp: 80, damage: 6, range: 3.2, attackSpeed: 0.7, moveSpeed: 2.05, x: 1, y: 0, skill: 'Restore', behavior: 'Follows injured allies · heals before attacking' },
]);

const distance = (a, b) => Math.hypot((a.renderX ?? a.x) - (b.renderX ?? b.x), (a.renderY ?? a.y) - (b.renderY ?? b.y));
const snapshot = (units) => units.map((unit) => ({ ...unit, motion: unit.motion ? { ...unit.motion } : null }));
const living = (units, team) => units.filter((unit) => unit.hp > 0 && unit.team === team);

function occupiedTiles(units, exceptId) {
  return new Set(units.filter((unit) => unit.hp > 0 && unit.id !== exceptId).flatMap((unit) => [
    `${unit.x},${unit.y}`, ...(unit.motion ? [`${unit.motion.x},${unit.motion.y}`] : []),
  ]));
}

function advanceMotion(unit, timeMs) {
  if (!unit.motion || unit.hp <= 0) return;
  const progress = Math.min(1, (timeMs - unit.motion.startMs) / unit.motion.durationMs);
  unit.renderX = unit.x + (unit.motion.x - unit.x) * progress;
  unit.renderY = unit.y + (unit.motion.y - unit.y) * progress;
  if (progress === 1) {
    unit.x = unit.motion.x; unit.y = unit.motion.y;
    unit.motion = null;
  }
}

function beginMove(unit, step, timeMs, events) {
  const durationMs = 1000 / unit.moveSpeed;
  unit.motion = { ...step, startMs: timeMs, durationMs };
  events.push({ type: 'move', actor: unit.id, target: unit.id, durationMs, fromX: unit.x, fromY: unit.y, toX: step.x, toY: step.y });
}

export function createArenaUnits(placement = {}, tuning = {}) {
  if (Object.keys(tuning).some((id) => !ARENA_ROSTER.some((unit) => unit.id === id))) throw new Error('Unknown unit speed configuration.');
  const claimed = new Set();
  return ARENA_ROSTER.map((definition, index) => {
    const adjusted = tuning[definition.id] || {};
    if (Object.keys(adjusted).some((key) => !['attackSpeed', 'moveSpeed'].includes(key))) throw new Error('Only attack and movement speeds can be tuned.');
    const attackSpeed = adjusted.attackSpeed ?? definition.attackSpeed;
    const moveSpeed = adjusted.moveSpeed ?? definition.moveSpeed;
    if (!Number.isFinite(attackSpeed) || attackSpeed < 0.4 || attackSpeed > 3 || !Number.isFinite(moveSpeed) || moveSpeed < 1 || moveSpeed > 4) throw new Error('Invalid unit speed.');
    const position = placement[definition.id] || definition;
    const { x, y } = position;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= ARENA_SIZE || y < 0 || y >= ARENA_SIZE
      || (definition.team === 'allies' && y < 5) || (definition.team === 'enemies' && (x !== definition.x || y !== definition.y))) {
      throw new Error('Place your team in the bottom three rows.');
    }
    const key = `${x},${y}`;
    if (claimed.has(key)) throw new Error('Each unit needs its own tile.');
    claimed.add(key);
    return { ...definition, attackSpeed, moveSpeed, x, y, renderX: x, renderY: y, motion: null, hp: definition.maxHp, mana: 0, shield: 0, readyAt: index * 65, moveAt: index * 45, targetId: null, intent: 'Ready', facing: definition.team === 'allies' ? 1 : -1 };
  });
}

// Breadth-first path search around occupied tiles. Return the first step to an
// attack/heal position, rather than walking through another living unit.
function approach(unit, target, units, range) {
  const occupied = occupiedTiles(units, unit.id);
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
  const occupied = occupiedTiles(units, unit.id);
  const safety = (cell) => Math.min(...threats.map((threat) => distance(cell, threat)));
  return [[0, -1], [-1, 0], [1, 0], [0, 1]].map(([dx, dy]) => ({ x: unit.x + dx, y: unit.y + dy }))
    .filter((cell) => cell.x >= 0 && cell.x < ARENA_SIZE && cell.y >= 0 && cell.y < ARENA_SIZE && !occupied.has(`${cell.x},${cell.y}`) && safety(cell) > safety(unit) + 0.1)
    .sort((a, b) => safety(b) - safety(a))[0];
}

export function simulateArena(placement = {}, { maxTicks = 1200, tuning = {} } = {}) {
  if (!Number.isInteger(maxTicks) || maxTicks < 1 || maxTicks > 1200) throw new Error('Invalid simulation duration.');
  const units = createArenaUnits(placement, tuning);
  const frames = [{ tick: 0, units: snapshot(units), events: [] }];
  let outcome = 'draw';
  const totals = { damage: 0, healing: 0, skills: 0 };
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    const timeMs = tick * ARENA_TICK_SECONDS * 1000;
    const events = [];
    for (const unit of units) advanceMotion(unit, timeMs);
    // Alternate team initiative to avoid permanent first-team priority.
    const order = tick % 2 ? units : [...units].reverse();
    for (const unit of order) {
      if (unit.hp <= 0) continue;
      if (unit.motion) continue;
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
      if (unit.role !== 'Frontline' && threats.length && timeMs >= unit.moveAt && timeMs < unit.readyAt) {
        const step = retreat(unit, threats, units);
        if (step) { beginMove(unit, step, timeMs, events); unit.intent = 'Keeping distance'; continue; }
      }
      if (distance(unit, target) > unit.range) {
        unit.intent = healing ? 'Following injured ally' : 'Closing in';
        if (timeMs >= unit.moveAt) {
          const step = approach(unit, target, units, unit.range);
          if (step) beginMove(unit, step, timeMs, events);
        }
        continue;
      }
      if (timeMs < unit.readyAt) { unit.intent = healing ? 'Preparing heal' : 'Preparing attack'; continue; }
      unit.readyAt = timeMs + 1000 / unit.attackSpeed;
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
    frames.push({ tick, units: snapshot(units), events: events.map((event) => {
      const actor = units.find((unit) => unit.id === event.actor);
      const target = units.find((unit) => unit.id === event.target);
      return { ...event, timeMs, sourceX: actor.renderX, sourceY: actor.renderY, targetX: target.renderX, targetY: target.renderY };
    }) });
    const alliesAlive = living(units, 'allies').length > 0;
    const enemiesAlive = living(units, 'enemies').length > 0;
    if (!alliesAlive || !enemiesAlive) { outcome = alliesAlive ? 'victory' : enemiesAlive ? 'defeat' : 'draw'; break; }
  }
  return { frames, outcome, totals, duration: (frames.length - 1) * ARENA_TICK_SECONDS };
}
