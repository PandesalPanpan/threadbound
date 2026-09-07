const ACHIEVEMENTS = Object.freeze({
  first_blood: { id: 'first_blood', name: 'First Blood', description: 'Defeat your first enemy.' },
  hollow_cleared: { id: 'hollow_cleared', name: 'Hollow Cleared', description: 'Complete Frayed Hollow.' },
  armed_and_threaded: { id: 'armed_and_threaded', name: 'Armed and Threaded', description: 'Equip your first Threadbound item.' },
});

export class AchievementProjector {
  constructor(repository) { this.repository = repository; }
  handle(event) {
    if (!event.playerId) return;
    if (event.type === 'EnemyDefeated') this.repository.unlockAchievement(event.playerId, ACHIEVEMENTS.first_blood);
    if (event.type === 'DungeonCompleted' && event.dungeonId === 'frayed-hollow') this.repository.unlockAchievement(event.playerId, ACHIEVEMENTS.hollow_cleared);
    if (event.type === 'ItemEquipped') this.repository.unlockAchievement(event.playerId, ACHIEVEMENTS.armed_and_threaded);
  }
}
