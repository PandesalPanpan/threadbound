import { config } from './config.js';
import { createApp } from './app.js';
import { SQLiteGameRepository } from './infrastructure/SQLiteGameRepository.js';
import { ThreadedGateway } from './threaded/ThreadedGateway.js';

const repository = new SQLiteGameRepository({ filename: config.databasePath });
const threadedGateway = new ThreadedGateway(config.threaded);
const app = createApp({ config, threadedGateway, repository });

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Threadbound listening on http://127.0.0.1:${config.port}`);
});

function shutdown() {
  server.close(() => {
    repository.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
