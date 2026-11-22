import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const server = app.listen(env.API_PORT, env.API_HOST, () => {
  logger.info(
    { host: env.API_HOST, port: env.API_PORT, environment: env.NODE_ENV },
    'ContinuityGrid API listening',
  );
});

let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  server.close(async (serverError) => {
    try {
      await prisma.$disconnect();
      if (serverError) {
        logger.error({ err: serverError }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      }
    } catch (error) {
      logger.error({ err: error }, 'Database disconnect failed');
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
