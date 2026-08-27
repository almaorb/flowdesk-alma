import type { Prisma } from '@prisma/client';
import type { ListTicketsQuery, Priority } from '@flowdesk/shared';
import { isSlaBreached, slaDeadline } from '@flowdesk/shared';
import type { TenantDb } from '../db/tenant.js';
import { badRequest, notFound } from '../lib/errors.js';
import { attachmentSelect, commentSelect, ticketSelect } from '../lib/serializers.js';
import type { AuthContext } from '../types/express.js';

/**
 * Row-level visibility inside a tenant. Tenant isolation itself is handled by
 * `tenantDb`; this narrows further so a CUSTOMER only ever sees their own
 * tickets, in SQL rather than in the UI.
 */
export function visibilityWhere(actor: AuthContext): Prisma.TicketWhereInput {
  return actor.role === 'CUSTOMER' ? { customerId: actor.userId } : {};
}

const SORT_COLUMNS: Record<ListTicketsQuery['sort'], keyof Prisma.TicketOrderByWithRelationInput> = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  priority: 'priority',
  status: 'status',
  title: 'title',
  slaDeadline: 'slaDeadline',
};

export function buildTicketWhere(
  query: ListTicketsQuery,
  actor: AuthContext,
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = { ...visibilityWhere(actor) };

  if (query.status) where.status = { in: query.status };
  if (query.priority) where.priority = { in: query.priority };
  if (query.customerId) where.customerId = query.customerId;
  if (query.tagId) where.tags = { some: { tagId: query.tagId } };
  if (query.slaBreached !== undefined) where.slaBreached = query.slaBreached;

  if (query.assigneeId) {
    where.assigneeId = query.assigneeId === 'unassigned' ? null : query.assigneeId;
  }

  // Free-text search stays in SQL (ILIKE via Prisma's insensitive mode).
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export function buildTicketOrderBy(
  query: ListTicketsQuery,
): Prisma.TicketOrderByWithRelationInput[] {
  const column = SORT_COLUMNS[query.sort];
  // `id` breaks ties so pagination is stable across pages.
  return [{ [column]: query.order }, { id: 'desc' }];
}

export async function loadTicketForActor(db: TenantDb, id: string, actor: AuthContext) {
  const ticket = await db.ticket.findFirst({
    where: { id, ...visibilityWhere(actor) },
    select: ticketSelect,
  });
  if (!ticket) throw notFound('Ticket');
  return ticket;
}

export async function loadTicketThread(db: TenantDb, ticketId: string, actor: AuthContext) {
  const [comments, attachments] = await Promise.all([
    db.comment.findMany({
      where: {
        ticketId,
        // Internal notes are filtered in SQL, not hidden in the client.
        ...(actor.role === 'CUSTOMER' ? { isInternal: false } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: commentSelect,
    }),
    db.attachment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      select: attachmentSelect,
    }),
  ]);
  return { comments, attachments };
}

/** Validates that an assignee exists in the tenant and can actually hold tickets. */
export async function assertAssignable(db: TenantDb, assigneeId: string): Promise<void> {
  const assignee = await db.user.findFirst({
    where: { id: assigneeId },
    select: { id: true, role: true, isActive: true },
  });
  if (!assignee) {
    throw badRequest('Assignee not found in this organization.', [
      { path: 'assigneeId', message: 'Unknown user' },
    ]);
  }
  if (!assignee.isActive) {
    throw badRequest('Assignee is deactivated.', [
      { path: 'assigneeId', message: 'User is deactivated' },
    ]);
  }
  if (assignee.role === 'CUSTOMER') {
    throw badRequest('Tickets can only be assigned to an agent or admin.', [
      { path: 'assigneeId', message: 'User is not an agent' },
    ]);
  }
}

export async function assertCustomer(db: TenantDb, customerId: string): Promise<void> {
  const customer = await db.user.findFirst({ where: { id: customerId }, select: { id: true } });
  if (!customer) {
    throw badRequest('Customer not found in this organization.', [
      { path: 'customerId', message: 'Unknown user' },
    ]);
  }
}

export async function resolveTagIds(db: TenantDb, tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const unique = [...new Set(tagIds)];
  const tags = await db.tag.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (tags.length !== unique.length) {
    const found = new Set(tags.map((tag) => tag.id));
    throw badRequest('One or more tags do not exist in this organization.', [
      {
        path: 'tagIds',
        message: `Unknown tag ids: ${unique.filter((id) => !found.has(id)).join(', ')}`,
      },
    ]);
  }
  return unique;
}

/**
 * SLA state for a ticket, recomputed whenever creation time or priority
 * changes. Shares `isSlaBreached` with the background job so the two can never
 * drift.
 */
export function slaFields(input: {
  createdAt: Date;
  priority: Priority;
  firstResponseAt: Date | null;
  now?: Date;
}): { slaDeadline: Date; slaBreached: boolean; slaBreachedAt: Date | null } {
  const deadline = slaDeadline(input.createdAt, input.priority);
  const breached = isSlaBreached(input);
  return {
    slaDeadline: deadline,
    slaBreached: breached,
    slaBreachedAt: breached ? (input.firstResponseAt ?? input.now ?? new Date()) : null,
  };
}
