import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isTest } from './config/env.js';
import { prisma } from './db/prisma.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { analyticsRouter } from './routes/analytics.js';
import { auditRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import { docsRouter } from './routes/docs.js';
import { invitesRouter, publicInvitesRouter } from './routes/invites.js';
import { tagsRouter } from './routes/tags.js';
import { ticketsRouter } from './routes/tickets.js';
import { usersRouter } from './routes/users.js';

export function createApp(): Express {
  const app = express();

  // Behind the compose/nginx proxy, one hop, so req.ip is the real client.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as { id?: string }).id ?? '',
        autoLogging: { ignore: (req) => req.url === '/api/health' },
      }),
    );
  }

  // Mounted before the global helmet so the docs page keeps its own, looser CSP.
  app.use('/api/docs', docsRouter);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => {
    void prisma.$queryRaw`SELECT 1`
      .then(() => {
        res.json({
          status: 'ok',
          service: 'flowdesk-api',
          database: 'up',
          time: new Date().toISOString(),
        });
      })
      .catch(() => {
        res.status(503).json({
          error: { code: 'INTERNAL_ERROR', message: 'Database is unreachable.' },
        });
      });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/public/invites', publicInvitesRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/audit-logs', auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
