import { SLA_ACTIVE_STATUSES } from '@flowdesk/shared';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { emitToOrg } from '../realtime/index.js';

const BATCH_SIZE = 500;

export interface SlaSweepResult {
  breached: number;
  scannedAt: string;
}

/**
 * Marks tickets whose first-response deadline has passed without any agent
 * reply. `slaDeadline` is materialised on the row (and recomputed whenever
 * priority changes), so this is a single indexed range scan rather than a
 * per-priority sweep.
 *
 * Idempotent: a ticket that is already flagged is excluded by
 * `slaBreached: false`, so re-running the sweep changes nothing.
 */
export async function runSlaSweep(now: Date = new Date()): Promise<SlaSweepResult> {
  const candidates = await prisma.ticket.findMany({
    where: {
      slaBreached: false,
      firstResponseAt: null,
      status: { in: [...SLA_ACTIVE_STATUSES] },
      slaDeadline: { lte: now },
    },
    select: { id: true, orgId: true, number: true },
    take: BATCH_SIZE,
  });

  if (candidates.length === 0) return { breached: 0, scannedAt: now.toISOString() };

  const ids = candidates.map((ticket) => ticket.id);

  await prisma.$transaction([
    prisma.ticket.updateMany({
      where: { id: { in: ids }, slaBreached: false },
      data: { slaBreached: true, slaBreachedAt: now },
    }),
    prisma.auditLog.createMany({
      data: candidates.map((ticket) => ({
        orgId: ticket.orgId,
        actorId: null,
        action: 'SLA_BREACHED',
        entityType: 'Ticket',
        entityId: ticket.id,
        metadata: { number: ticket.number, breachedAt: now.toISOString() },
      })),
    }),
  ]);

  for (const ticket of candidates) {
    emitToOrg(ticket.orgId, 'ticket:sla_breached', {
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      breachedAt: now.toISOString(),
    });
  }

  logger.info({ breached: candidates.length }, 'sla sweep flagged breached tickets');
  return { breached: candidates.length, scannedAt: now.toISOString() };
}

export interface StoppableJob {
  stop: () => void;
}

export function startSlaJob(): StoppableJob {
  if (!env.SLA_JOB_ENABLED) {
    logger.warn('SLA job disabled by configuration');
    return { stop: () => undefined };
  }

  let running = false;
  const tick = () => {
    if (running) return; // never overlap sweeps
    running = true;
    runSlaSweep()
      .catch((error: unknown) => {
        logger.error({ error }, 'sla sweep failed');
      })
      .finally(() => {
        running = false;
      });
  };

  const timer = setInterval(tick, env.SLA_JOB_INTERVAL_MS);
  timer.unref();
  setTimeout(tick, 2_000).unref(); // one sweep shortly after boot

  logger.info({ intervalMs: env.SLA_JOB_INTERVAL_MS }, 'sla job started');
  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
