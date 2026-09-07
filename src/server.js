import { config } from './config.js';
import { createApp } from './app.js';
import { SQLiteGameRepository } from './infrastructure/SQLiteGameRepository.js';
import { SQLiteCodexRepository } from './infrastructure/SQLiteCodexRepository.js';
import { SQLiteArcManifestRepository } from './infrastructure/SQLiteArcManifestRepository.js';
import { ThreadedGateway } from './threaded/ThreadedGateway.js';

const repository = new SQLiteGameRepository({ filename: config.databasePath });
const codexRepository = new SQLiteCodexRepository({ database: repository.db });
const manifestRepository = new SQLiteArcManifestRepository({ database: repository.db });
const threadedGateway = config.authMode === 'threaded' ? new ThreadedGateway(config.threaded) : null;
const app = createApp({ config, threadedGateway, repository, codexRepository, manifestRepository });

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Threadbound listening on http://127.0.0.1:${config.port} (${config.authMode} auth)`);
});
app.locals.realtimeHub.attachWebSocketServer(server);

function shutdown() {
  app.locals.realtimeHub.close();
  server.close(() => {
    repository.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
