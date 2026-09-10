import test from 'node:test';
import assert from 'node:assert/strict';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';
import { SQLiteCodexRepository } from '../src/infrastructure/SQLiteCodexRepository.js';
import { CodexService } from '../src/application/CodexService.js';
import { WorldHistoryProjector } from '../src/application/WorldHistoryProjector.js';
import { DUNGEONS } from '../src/domain/DungeonRun.js';
import { HUNT_ENEMIES } from '../src/domain/HuntEncounter.js';
import { prepareSimpleDungeon } from '../src/domain/SimpleDungeonPolicy.js';

function setup() {
  let id = 0;
  const gameRepository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => `player-${++id}` });
  const codexRepository = new SQLiteCodexRepository({ database: gameRepository.db });
  const player = gameRepository.getOrCreatePlayer({ threadedUserId: 'local:codex', displayName: 'Codex Weaver' });
  const service = new CodexService({ gameRepository, codexRepository });
  return { gameRepository, codexRepository, player, service };
}

test('codex documents Hunt enemies plus the actual hardened dungeon values', () => {
  const { gameRepository, service, player } = setup();
  const enemies = service.browse(player.id, { category: 'enemies' });
  const bosses = service.browse(player.id, { category: 'bosses' });
  const hardened = prepareSimpleDungeon(DUNGEONS['frayed-hollow']);

  assert.equal(enemies.entries.length, HUNT_ENEMIES.length + hardened.encounters.length);
  assert.ok(enemies.entries.some((entry) => entry.id === 'thread-wolf' && entry.tags.includes('hunt')));
  assert.equal(bosses.entries.length, 1);
  assert.equal(bosses.entries[0].mechanics.hp, hardened.boss.hp);
  assert.equal(bosses.entries[0].mechanics.retaliation, hardened.boss.retaliation);
  assert.equal(bosses.entries[0].mechanics.recommendedAttack, 9);
  gameRepository.close();
});

test('generated item instances appear automatically without hand-written codex records', () => {
  const { gameRepository, codexRepository, service, player } = setup();
  gameRepository.addItem(player.id, {
    id: 'generated-relic-1',
    definitionId: 'generated-weapon',
    name: 'Bound Needle of Echoes',
    slot: 'weapon',
    rarity: 'rare',
    attackBonus: 3,
    effectCode: 'boss_bane',
    effect: { code: 'boss_bane', name: 'Severing', description: '+2 damage against bosses.' },
    source: 'frayed-hollow',
  });

  const items = service.browse(player.id, { category: 'items' });
  assert.equal(items.entries.length, 1);
  assert.equal(items.entries[0].id, 'generated-relic-1');
  assert.match(items.entries[0].body, /recovered from frayed-hollow/i);
  assert.equal(codexRepository.getContentEntry('generated-relic-1'), null);
  gameRepository.close();
});

test('generated lore is hidden as draft and auto-published into the lore browser after approval', () => {
  const { gameRepository, codexRepository, service, player } = setup();
  codexRepository.saveDraftContentEntry({
    id: 'generated-lore-1',
    title: 'Whispers Beneath the Hollow',
    summary: 'A generated rumor awaiting publication.',
    body: 'The draft should never leak into player-facing Codex results.',
    source: 'story-generator',
    version: 1,
    tags: ['arc-1', 'generated'],
  });
  assert.equal(service.browse(player.id, { category: 'lore', query: 'Whispers' }).total, 0);

  codexRepository.publishContentEntry({
    id: 'generated-lore-1',
    title: 'Whispers Beneath the Hollow',
    summary: 'A newly confirmed account from the Hollow.',
    body: 'The Loom carried a voice from beneath the broken stone.',
    source: 'story-generator',
    version: 2,
    tags: ['arc-1', 'generated'],
  });
  const published = service.browse(player.id, { category: 'lore', query: 'Whispers' });
  assert.equal(published.total, 1);
  assert.equal(published.entries[0].revision, 2);
  assert.equal(published.entries[0].source, 'story-generator');
  gameRepository.close();
});

test('canonical lore wins generated id collisions and world arc shows live progress', () => {
  const { gameRepository, codexRepository, service, player } = setup();
  codexRepository.publishContentEntry({
    id: 'arc-1',
    title: 'Fake Override',
    summary: 'Generated content should not replace the canonical arc.',
    body: 'This must never become the canonical player-facing arc entry.',
    source: 'story-generator',
    version: 99,
  });
  gameRepository.incrementWorldProgress('arc-1-frayed-hollow-clears', 7);

  const lore = service.browse(player.id, { category: 'lore' });
  const arc = lore.entries.find((entry) => entry.id === 'arc-1');
  assert.equal(arc.title, 'The First Unraveling');
  assert.equal(arc.source, 'canonical');
  assert.equal(arc.mechanics.currentClears, 7);
  assert.equal(arc.mechanics.targetClears, 1000);
  gameRepository.close();
});

test('world history projection is retry-safe and records generated relic discovery', () => {
  const { gameRepository, codexRepository, service, player } = setup();
  const projector = new WorldHistoryProjector({ gameRepository, codexRepository });
  gameRepository.addItem(player.id, {
    id: 'history-item-1',
    definitionId: 'generated-weapon',
    name: 'Gleaming Spindle of Dawn',
    slot: 'weapon',
    rarity: 'common',
    attackBonus: 2,
    effectCode: 'none',
    effect: { code: 'none', name: 'Plain Weave', description: 'No special combat effect.' },
    source: 'frayed-hollow',
  });

  const completion = { type: 'DungeonCompleted', playerId: player.id, participantIds: [player.id], runId: 'run-history-1', dungeonId: 'frayed-hollow' };
  projector.handle(completion);
  projector.handle(completion);
  projector.handle({ type: 'ItemGenerated', playerId: player.id, itemId: 'history-item-1' });

  const history = service.browse(player.id, { category: 'history' });
  assert.equal(history.entries.filter((entry) => entry.id === 'run:run-history-1:completed').length, 1);
  assert.equal(history.entries.filter((entry) => entry.id === 'item:history-item-1:discovered').length, 1);
  assert.match(history.entries.find((entry) => entry.id === 'item:history-item-1:discovered').title, /Gleaming Spindle of Dawn/);
  gameRepository.close();
});

test('achievement codex shows locked definitions and player-specific unlocked status', () => {
  const { gameRepository, service, player } = setup();
  let achievements = service.browse(player.id, { category: 'achievements' });
  assert.equal(achievements.total, 3);
  assert.ok(achievements.entries.every((entry) => entry.unlocked === false));

  gameRepository.unlockAchievement(player.id, { id: 'first_blood', name: 'First Blood', description: 'Defeat your first enemy.' });
  achievements = service.browse(player.id, { category: 'achievements' });
  assert.equal(achievements.entries.find((entry) => entry.id === 'first_blood').unlocked, true);
  gameRepository.close();
});
