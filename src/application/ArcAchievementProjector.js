import { randomUUID } from 'node:crypto';

function projectionsFor(event) {
  if (event.type === 'EnemyDefeated') {
    const projections = [{ name: 'enemy_defeated', target: event.enemyId || null }];
    if (event.isBoss) projections.push({ name: 'boss_defeated', target: event.enemyId || null });
    return projections;
  }
  if (event.type === 'DungeonCompleted') return [{ name: 'dungeon_completed', target: event.dungeonId || null }];
  if (event.type === 'ItemGenerated') return [{ name: 'item_generated', target: event.source || null }];
  if (event.type === 'PlayerRevived') return [{ name: 'player_revived', target: null }];
  return [];
}

function eventIdentity(event, eventName) {
  if (eventName === 'enemy_defeated') return `${event.runId}:${eventName}:${event.enemyId}:${randomUUID()}`;
  if (eventName === 'boss_defeated') return `${event.runId}:${eventName}:${event.enemyId}`;
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
    for (const projection of projectionsFor(event)) {
      const baseIdentity = eventIdentity(event, projection.name);
      if (!baseIdentity) continue;
      for (const achievement of this.arcManifestService.publishedAchievements()) {
        if (achievement.event !== projection.name) continue;
        if (achievement.targetId && achievement.targetId !== projection.target) continue;
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
}
