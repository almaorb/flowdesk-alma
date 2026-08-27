import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { disconnectPrisma } from './db/prisma.js';
import { startSlaJob } from './jobs/sla.js';
import { logger } from './lib/logger.js';
import { closeRealtimeServer, createRealtimeServer } from './realtime/index.js';

const app = createApp();
const httpServer = createServer(app);

createRealtimeServer(httpServer);
const slaJob = startSlaJob();

httpServer.listen(env.PORT, env.HOST, () => {
  logger.info(
    { port: env.PORT, host: env.HOST, env: env.NODE_ENV },
    `FlowDesk API listening on http://localhost:${env.PORT} (docs at /api/docs)`,
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  slaJob.stop();
  await closeRealtimeServer();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await disconnectPrisma();

  process.exit(0);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});
