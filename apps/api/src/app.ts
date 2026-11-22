import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { logger } from './lib/logger.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { commandCenterRouter } from './routes/command-center.routes.js';
import { biaRouter } from './routes/bia.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(requestIdMiddleware);
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        requestId: res.getHeader('x-request-id'),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
      },
      'HTTP request completed',
    );
  });
  next();
});

app.get('/', (_req, res) => {
  res.status(200).json({
    data: {
      name: 'ContinuityGrid API',
      version: '0.1.0',
      docs: 'API documentation will be introduced with the API contract milestone.',
    },
  });
});

app.use(`${env.API_BASE_PATH}/health`, healthRouter);
app.use(`${env.API_BASE_PATH}/auth`, authRouter);
app.use(`${env.API_BASE_PATH}/command-center`, commandCenterRouter);
app.use(`${env.API_BASE_PATH}/bia`, biaRouter);
app.use(notFoundHandler);
app.use(errorHandler);
