export class WorldHistoryProjector {
  constructor({ gameRepository, codexRepository }) {
    this.gameRepository = gameRepository;
    this.codexRepository = codexRepository;
  }

  handle(event) {
    if (event.type === 'DungeonCompleted') {
      const participantNames = (event.participantIds || [])
        .map((playerId) => this.gameRepository.getPlayer(playerId)?.displayName)
        .filter(Boolean);
      const partyText = participantNames.length > 0 ? participantNames.join(', ') : 'Unknown Weavers';
      const run = event.runId ? this.gameRepository.getRun(event.runId) : null;
      const dungeon = run?.dungeonDefinition || null;
      const dungeonName = dungeon?.name || (event.dungeonId === 'frayed-hollow' ? 'Frayed Hollow' : event.dungeonId);
      const bossName = dungeon?.boss?.name || (event.dungeonId === 'frayed-hollow' ? 'The First Needle' : 'its recorded boss');
      const arcTitle = dungeon?.arcTitle || (event.dungeonId === 'frayed-hollow' ? 'The First Unraveling' : 'an evolving world arc');
      this.codexRepository.recordWorldHistory({
        id: `run:${event.runId}:completed`,
        eventType: 'DungeonCompleted',
        title: `${dungeonName} cleared`,
        summary: `${partyText} defeated ${bossName} and recorded a clear of ${dungeonName}.`,
        body: `This victory was recorded during ${arcTitle}. Participant snapshot: ${partyText}.`,
        entityType: 'dungeon',
        entityId: event.dungeonId,
        createdAt: new Date().toISOString(),
      });
    }

    if (event.type === 'ItemGenerated') {
      const item = this.gameRepository.getItem(event.itemId);
      if (!item) return;
      const player = this.gameRepository.getPlayer(event.playerId);
      this.codexRepository.recordWorldHistory({
        id: `item:${item.id}:discovered`,
        eventType: 'ItemGenerated',
        title: `Relic discovered: ${item.name}`,
        summary: `${player?.displayName || 'A Weaver'} recovered ${item.name} from ${item.source}.`,
        body: `${item.name} entered the known Threadbound record with the effect ${item.effect.name}. ${item.effect.description}`,
        entityType: 'item',
        entityId: item.id,
        createdAt: item.createdAt || new Date().toISOString(),
      });
    }
  }
}
