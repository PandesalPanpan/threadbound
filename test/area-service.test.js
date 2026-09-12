import test from 'node:test';
import assert from 'node:assert/strict';
import { AreaService } from '../src/application/AreaService.js';
import { AreaProgression } from '../src/domain/AreaProgression.js';
import { SQLiteAreaRepository } from '../src/infrastructure/SQLiteAreaRepository.js';
import { SQLiteGameRepository } from '../src/infrastructure/SQLiteGameRepository.js';

function fixture() {
  const repository = new SQLiteGameRepository({ filename: ':memory:', idFactory: () => 'area-service-player' });
  const player = repository.getOrCreatePlayer({ threadedUserId: 'area-service-user', displayName: 'Area Service Adventurer' });
  const events = [];
  const eventBus = { publish: (event) => events.push(event) };
  const areaRepository = new SQLiteAreaRepository({ database: repository.db });
  const service = new AreaService({ repository, eventBus, areaRepository });
  return { repository, player, events, areaRepository, service };
}

test('AreaService browse projects authoritative current/highest state and only unlocked travel choices', () => {
  const { repository, player, areaRepository, service } = fixture();
  try {
    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(3).withCurrentArea(2));
    const result = service.browse(player.id);

    assert.equal(result.currentArea.id, 'area-2');
    assert.equal(result.highestUnlockedArea.id, 'area-3');
    assert.deepEqual(result.areas.map(({ id, current, unlocked }) => ({ id, current, unlocked })), [
      { id: 'area-1', current: false, unlocked: true },
      { id: 'area-2', current: true, unlocked: true },
      { id: 'area-3', current: false, unlocked: true },
    ]);
  } finally {
    repository.close();
  }
});

test('AreaService travel persists through the Area repository and publishes one public domain event', () => {
  const { repository, player, events, areaRepository, service } = fixture();
  try {
    areaRepository.save(player.id, new AreaProgression().withHighestUnlockedArea(2));
    const result = service.travel(player.id, 2);

    assert.equal(result.currentAreaNumber, 2);
    assert.equal(areaRepository.get(player.id).currentAreaNumber, 2);
    assert.deepEqual(events, [{
      type: 'AreaTraveled',
      playerId: player.id,
      fromArea: { id: 'area-1', number: 1, name: 'Area 1' },
      toArea: { id: 'area-2', number: 2, name: 'Area 2' },
      highestUnlockedArea: { id: 'area-2', number: 2, name: 'Area 2' },
    }]);
  } finally {
    repository.close();
  }
});

test('AreaService rejects travel past the unlocked frontier and does not publish misleading receipts', () => {
  const { repository, player, events, service } = fixture();
  try {
    assert.throws(
      () => service.travel(player.id, 2),
      (error) => error.code === 'area_locked' && /not unlocked/i.test(error.message),
    );
    assert.equal(service.browse(player.id).currentAreaNumber, 1);
    assert.deepEqual(events, []);
  } finally {
    repository.close();
  }
});

test('traveling to the already-current Area is idempotent and does not create duplicate stream events', () => {
  const { repository, player, events, service } = fixture();
  try {
    const result = service.travel(player.id, 1);
    assert.equal(result.currentAreaNumber, 1);
    assert.deepEqual(events, []);
  } finally {
    repository.close();
  }
});
