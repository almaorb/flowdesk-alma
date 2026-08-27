import { PrismaClient } from '@prisma/client';
import { env, isProduction, isTest } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * The unscoped client. Application code should almost always go through
 * `tenantDb(orgId)` instead — this is reserved for cross-tenant concerns
 * (login by email, refresh-token lookup, organization creation) and for the
 * seed/test harness.
 */
export const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  log: isProduction || isTest ? ['error'] : ['warn', 'error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect().catch((error: unknown) => {
    logger.warn({ error }, 'failed to disconnect prisma cleanly');
  });
}

export type { Prisma } from '@prisma/client';
