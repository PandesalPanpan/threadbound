import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCommand } from '../frontend/src/shell/presentation.js';

test('short command aliases canonicalize before the shell dispatches them', () => {
  assert.deepEqual(normalizeCommand('bj 250'), { raw: 'bj 250', name: 'blackjack', args: ['250'], token: 'bj' });
  assert.deepEqual(normalizeCommand('/bj 250'), { raw: '/bj 250', name: 'blackjack', args: ['250'], token: '/bj' });
  assert.deepEqual(normalizeCommand('blackjack 250'), { raw: 'blackjack 250', name: 'blackjack', args: ['250'], token: 'blackjack' });
  assert.deepEqual(normalizeCommand('/blackjack 250'), { raw: '/blackjack 250', name: 'blackjack', args: ['250'], token: '/blackjack' });
  assert.deepEqual(normalizeCommand('cf 100 heads').name, 'coinflip');
  assert.deepEqual(normalizeCommand('sl 50').name, 'slots');
  assert.deepEqual(normalizeCommand('dg').name, 'dungeon');
  assert.deepEqual(normalizeCommand('inv').name, 'inventory');
  assert.deepEqual(normalizeCommand('sh').name, 'shop');
  assert.deepEqual(normalizeCommand('pot greater'), { raw: 'pot greater', name: 'heal', args: ['greater'], token: 'pot' });
});

test('profile remains a searchable compatibility command while bare profile opens status', () => {
  assert.equal(normalizeCommand('profile').name, 'status');
  assert.deepEqual(normalizeCommand('profile Mira').args, ['Mira']);
  assert.equal(normalizeCommand('/profile Mira').name, 'profile');
});
