import type { Prisma } from '@prisma/client';
import type { AuditAction } from '@flowdesk/shared';
import { prisma } from '../db/prisma.js';
import { logger } from './logger.js';

export interface AuditInput {
  orgId: string;
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

/**
 * Builds the row for an audit entry.
 *
 * Handlers that already run inside a transaction insert it themselves
 * (`tx.auditLog.create({ data: auditData(...) })`) so the audited change and
 * its log entry commit or roll back together.
 */
export function auditData(input: AuditInput): Prisma.AuditLogUncheckedCreateInput {
  return {
    orgId: input.orgId,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    ...(input.metadata != null ? { metadata: input.metadata } : {}),
    ip: input.ip ?? null,
  };
}

/** Standalone write, for events that are not part of a larger transaction. */
export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({ data: auditData(input) });
}

/**
 * For events (login, logout) where losing the request because the audit insert
 * failed would be worse than losing the audit row.
 */
export function recordAuditSafe(input: AuditInput): void {
  void recordAudit(input).catch((error: unknown) => {
    logger.error({ error, action: input.action }, 'failed to write audit log');
  });
}
