const EVENT_NAMES = Object.freeze({
  EnemyDefeated: 'enemy_defeated',
  BossDefeated: 'boss_defeated',
  DungeonCompleted: 'dungeon_completed',
  ItemGenerated: 'item_generated',
  PlayerRevived: 'player_revived',
});

function targetFor(event, eventName) {
  if (eventName === 'enemy_defeated') return event.enemyId || null;
  if (eventName === 'boss_defeated') return event.bossId || null;
  if (eventName === 'dungeon_completed') return event.dungeonId || null;
  if (eventName === 'item_generated') return event.source || null;
  return null;
}

function eventIdentity(event, eventName) {
  if (eventName === 'enemy_defeated') return `${event.runId}:${eventName}:${event.enemyId}:${event.encounterIndex ?? 'unknown'}`;
  if (eventName === 'boss_defeated') return `${event.runId}:${eventName}:${event.bossId || event.dungeonId}`;
  if (eventName === 'dungeon_completed') return `${event.runId}:${eventName}:${event.playerId}`;
  if (eventName === 'item_generated') return `${event.itemId}:${eventName}`;
  if (eventName === 'player_revived') return `${event.runId}:${eventName}:${event.playerId}:${event.targetPlayerId}`;
  return null;
}

export class ArcAchievementProjector {
  constructor({ gameRepository, manifestRepository, arcManifestService }) {
    this.gameRepository = gameRepository;
    this.manifestRepository = manifestRepository;
    this.arcManifestService = arcManifestService;
  }

  handle(event) {
    if (!event?.playerId) return;
    const eventName = EVENT_NAMES[event.type];
    if (!eventName) return;
    const target = targetFor(event, eventName);
    const baseIdentity = eventIdentity(event, eventName);
    if (!baseIdentity) return;

    for (const achievement of this.arcManifestService.publishedAchievements()) {
      if (achievement.event !== eventName) continue;
      if (achievement.targetId && achievement.targetId !== target) continue;
      const progress = this.manifestRepository.recordAchievementEvent({
        eventId: `${baseIdentity}:${achievement.id}`,
        playerId: event.playerId,
        achievementId: achievement.id,
      });
      if (progress.amount >= achievement.threshold) {
        this.gameRepository.unlockAchievement(event.playerId, {
          id: achievement.id,
          name: achievement.title,
          description: achievement.description,
        });
      }
    }
  }
}
