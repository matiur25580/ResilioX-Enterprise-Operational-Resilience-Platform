import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  res.status(200).json({
    data: {
      status: 'ok',
      service: 'continuitygrid-api',
      timestamp: new Date().toISOString(),
    },
  });
});

healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      data: {
        status: 'ready',
        checks: { database: 'ok' },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Readiness check failed');
    res.status(503).json({
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'A required dependency is unavailable.',
        checks: { database: 'error' },
        requestId: res.locals.requestId ?? null,
      },
    });
  }
});
