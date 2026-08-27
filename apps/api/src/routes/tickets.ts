import { Router } from 'express';
import { z } from 'zod';
import {
  checkTransition,
  createAttachmentSchema,
  createCommentSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  transitionTicketSchema,
  updateTicketSchema,
} from '@flowdesk/shared';
import type { TicketStatus } from '@flowdesk/shared';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { asyncHandler, clientIp, paginate } from '../lib/http.js';
import { auditData } from '../lib/audit.js';
import {
  attachmentSelect,
  commentSelect,
  ticketSelect,
  toAttachmentDto,
  toCommentDto,
  toTicketDetailDto,
  toTicketDto,
} from '../lib/serializers.js';
import { parseBody, parseParams, parseQuery } from '../lib/validate.js';
import { auth, db as tenant, requireAuth, requireRole } from '../middleware/auth.js';
import { emitToOrg } from '../realtime/index.js';
import {
  assertAssignable,
  assertCustomer,
  buildTicketOrderBy,
  buildTicketWhere,
  loadTicketForActor,
  loadTicketThread,
  resolveTagIds,
  slaFields,
} from '../services/tickets.js';

const idParams = z.object({ id: z.string().min(1).max(64) });
const nestedParams = z.object({
  id: z.string().min(1).max(64),
  childId: z.string().min(1).max(64),
});

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

/* ------------------------------------------------------------------ list -- */

ticketsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const query = parseQuery(listTicketsQuerySchema, req);

    const where = buildTicketWhere(query, actor);
    const [rows, total] = await Promise.all([
      db.ticket.findMany({
        where,
        orderBy: buildTicketOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: ticketSelect,
      }),
      db.ticket.count({ where }),
    ]);

    res.json(paginate(rows.map(toTicketDto), total, query.page, query.pageSize));
  }),
);

/* -------------------------------------------------------------- retrieve -- */

ticketsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);

    const ticket = await loadTicketForActor(db, id, actor);
    const { comments, attachments } = await loadTicketThread(db, ticket.id, actor);

    res.json(toTicketDetailDto(ticket, comments, attachments));
  }),
);

/* ---------------------------------------------------------------- create -- */

ticketsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const input = parseBody(createTicketSchema, req);

    // Customers may only ever file tickets for themselves.
    const customerId =
      actor.role === 'CUSTOMER' ? actor.userId : (input.customerId ?? actor.userId);
    if (customerId !== actor.userId) await assertCustomer(db, customerId);

    if (input.assigneeId) {
      if (actor.role === 'CUSTOMER') throw forbidden('Customers cannot assign tickets.');
      await assertAssignable(db, input.assigneeId);
    }
    const tagIds = await resolveTagIds(db, input.tagIds ?? []);

    const createdAt = new Date();
    const sla = slaFields({ createdAt, priority: input.priority, firstResponseAt: null });

    const ticket = await db.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: actor.orgId },
        data: { ticketSeq: { increment: 1 } },
        select: { ticketSeq: true },
      });

      const created = await tx.ticket.create({
        data: {
          // `tenantDb` injects orgId anyway; passing it explicitly keeps the
          // create type-checked and the intent obvious at the call site.
          orgId: actor.orgId,
          number: org.ticketSeq,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: 'OPEN',
          customerId,
          assigneeId: input.assigneeId ?? null,
          createdAt,
          slaDeadline: sla.slaDeadline,
          slaBreached: false,
          ...(tagIds.length > 0
            ? { tags: { createMany: { data: tagIds.map((tagId) => ({ tagId })) } } }
            : {}),
        },
        select: ticketSelect,
      });

      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'TICKET_CREATED',
          entityType: 'Ticket',
          entityId: created.id,
          metadata: { number: created.number, priority: created.priority, title: created.title },
          ip: clientIp(req),
        }),
      });

      return created;
    });

    const dto = toTicketDto(ticket);
    emitToOrg(actor.orgId, 'ticket:created', { ticket: dto, actorId: actor.userId });
    res.status(201).json(dto);
  }),
);

/* ---------------------------------------------------------------- update -- */

ticketsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);
    const input = parseBody(updateTicketSchema, req);

    const existing = await loadTicketForActor(db, id, actor);

    if (actor.role === 'CUSTOMER') {
      const forbiddenKeys = (['priority', 'assigneeId', 'tagIds'] as const).filter(
        (key) => input[key] !== undefined,
      );
      if (forbiddenKeys.length > 0) {
        throw forbidden(`Customers cannot change: ${forbiddenKeys.join(', ')}.`);
      }
    }

    if (input.assigneeId) await assertAssignable(db, input.assigneeId);
    const tagIds = input.tagIds ? await resolveTagIds(db, input.tagIds) : null;

    const changed: string[] = [];
    if (input.title !== undefined && input.title !== existing.title) changed.push('title');
    if (input.description !== undefined && input.description !== existing.description) {
      changed.push('description');
    }
    if (input.priority !== undefined && input.priority !== existing.priority) changed.push('priority');
    if (input.assigneeId !== undefined && (input.assigneeId ?? null) !== (existing.assignee?.id ?? null)) {
      changed.push('assigneeId');
    }
    if (tagIds) {
      const before = existing.tags.map((t) => t.tag.id).sort().join(',');
      if (before !== [...tagIds].sort().join(',')) changed.push('tags');
    }

    if (changed.length === 0) {
      res.json(toTicketDto(existing));
      return;
    }

    // Changing priority moves the SLA deadline, so breach state is recomputed.
    const nextPriority = input.priority ?? existing.priority;
    const sla = slaFields({
      createdAt: existing.createdAt,
      priority: nextPriority,
      firstResponseAt: existing.firstResponseAt,
    });

    const ticket = await db.$transaction(async (tx) => {
      if (tagIds) {
        await tx.ticketTag.deleteMany({ where: { ticketId: id } });
        if (tagIds.length > 0) {
          await tx.ticketTag.createMany({ data: tagIds.map((tagId) => ({ ticketId: id, tagId })) });
        }
      }

      const updated = await tx.ticket.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId ?? null } : {}),
          slaDeadline: sla.slaDeadline,
          slaBreached: sla.slaBreached,
          slaBreachedAt: sla.slaBreachedAt,
        },
        select: ticketSelect,
      });

      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: changed.includes('assigneeId') && changed.length === 1 ? 'TICKET_ASSIGNED' : 'TICKET_UPDATED',
          entityType: 'Ticket',
          entityId: id,
          metadata: {
            changed,
            ...(changed.includes('assigneeId')
              ? { from: existing.assignee?.id ?? null, to: input.assigneeId ?? null }
              : {}),
            ...(changed.includes('priority')
              ? { priorityFrom: existing.priority, priorityTo: nextPriority }
              : {}),
          },
          ip: clientIp(req),
        }),
      });

      return updated;
    });

    const dto = toTicketDto(ticket);
    emitToOrg(actor.orgId, 'ticket:updated', { ticket: dto, actorId: actor.userId, changed });
    res.json(dto);
  }),
);

/* ------------------------------------------------------------ transition -- */

ticketsRouter.post(
  '/:id/transition',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);
    const input = parseBody(transitionTicketSchema, req);

    const existing = await loadTicketForActor(db, id, actor);

    const verdict = checkTransition(
      {
        status: existing.status,
        customerId: existing.customer?.id ?? '',
        assigneeId: existing.assignee?.id ?? null,
      },
      input.status,
      { id: actor.userId, role: actor.role },
    );

    if (!verdict.ok) throw new AppError(verdict.status, verdict.code, verdict.message);

    const now = new Date();
    const nextStatus: TicketStatus = input.status;

    const ticket = await db.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          status: nextStatus,
          resolvedAt: nextStatus === 'RESOLVED' ? now : nextStatus === 'REOPENED' ? null : existing.resolvedAt,
          closedAt: nextStatus === 'CLOSED' ? now : nextStatus === 'REOPENED' ? null : existing.closedAt,
        },
        select: ticketSelect,
      });

      if (input.note) {
        await tx.comment.create({
          data: {
            orgId: actor.orgId,
            ticketId: id,
            authorId: actor.userId,
            body: input.note,
            isInternal: actor.role !== 'CUSTOMER',
          },
        });
      }

      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'TICKET_STATUS_CHANGED',
          entityType: 'Ticket',
          entityId: id,
          metadata: { from: existing.status, to: nextStatus, ...(input.note ? { note: input.note } : {}) },
          ip: clientIp(req),
        }),
      });

      return updated;
    });

    const dto = toTicketDto(ticket);
    emitToOrg(actor.orgId, 'ticket:updated', {
      ticket: dto,
      actorId: actor.userId,
      changed: ['status'],
    });
    res.json(dto);
  }),
);

/* ---------------------------------------------------------------- delete -- */

ticketsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);

    const existing = await db.ticket.findFirst({ where: { id }, select: { id: true, number: true } });
    if (!existing) throw notFound('Ticket');

    await db.$transaction(async (tx) => {
      await tx.ticket.delete({ where: { id } });
      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'TICKET_DELETED',
          entityType: 'Ticket',
          entityId: id,
          metadata: { number: existing.number },
          ip: clientIp(req),
        }),
      });
    });

    emitToOrg(actor.orgId, 'ticket:deleted', { ticketId: id, actorId: actor.userId });
    res.status(204).end();
  }),
);

/* -------------------------------------------------------------- comments -- */

ticketsRouter.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);

    await loadTicketForActor(db, id, actor);
    const comments = await db.comment.findMany({
      where: { ticketId: id, ...(actor.role === 'CUSTOMER' ? { isInternal: false } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: commentSelect,
    });

    res.json({ data: comments.map(toCommentDto) });
  }),
);

ticketsRouter.post(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);
    const input = parseBody(createCommentSchema, req);

    const ticket = await loadTicketForActor(db, id, actor);

    const isInternal = actor.role === 'CUSTOMER' ? false : input.isInternal;

    if (input.parentId) {
      const parent = await db.comment.findFirst({
        where: { id: input.parentId, ticketId: id },
        select: { id: true, isInternal: true },
      });
      if (!parent) {
        throw badRequest('Parent comment does not belong to this ticket.', [
          { path: 'parentId', message: 'Unknown comment' },
        ]);
      }
    }

    // The first public reply from an agent or admin stops the SLA clock.
    const stopsSlaClock =
      actor.role !== 'CUSTOMER' && !isInternal && ticket.firstResponseAt === null;
    const now = new Date();

    const { comment, updatedTicket } = await db.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          orgId: actor.orgId,
          ticketId: id,
          authorId: actor.userId,
          parentId: input.parentId ?? null,
          body: input.body,
          isInternal,
          createdAt: now,
        },
        select: commentSelect,
      });

      let refreshed = null;
      if (stopsSlaClock) {
        const sla = slaFields({
          createdAt: ticket.createdAt,
          priority: ticket.priority,
          firstResponseAt: now,
        });
        refreshed = await tx.ticket.update({
          where: { id },
          data: {
            firstResponseAt: now,
            firstResponderId: actor.userId,
            slaBreached: sla.slaBreached,
            slaBreachedAt: sla.slaBreachedAt,
          },
          select: ticketSelect,
        });
      } else {
        refreshed = await tx.ticket.update({
          where: { id },
          data: { updatedAt: now },
          select: ticketSelect,
        });
      }

      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'COMMENT_CREATED',
          entityType: 'Comment',
          entityId: created.id,
          metadata: { ticketId: id, isInternal, firstResponse: stopsSlaClock },
          ip: clientIp(req),
        }),
      });

      return { comment: created, updatedTicket: refreshed };
    });

    const commentDto = toCommentDto(comment);
    emitToOrg(actor.orgId, 'comment:created', {
      comment: commentDto,
      ticketId: id,
      actorId: actor.userId,
    });
    emitToOrg(actor.orgId, 'ticket:updated', {
      ticket: toTicketDto(updatedTicket),
      actorId: actor.userId,
      changed: stopsSlaClock ? ['firstResponseAt', 'commentCount'] : ['commentCount'],
    });

    res.status(201).json(commentDto);
  }),
);

/* ----------------------------------------------------------- attachments -- */

ticketsRouter.post(
  '/:id/attachments',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);
    const input = parseBody(createAttachmentSchema, req);

    await loadTicketForActor(db, id, actor);

    const attachment = await db.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          orgId: actor.orgId,
          ticketId: id,
          uploadedById: actor.userId,
          filename: input.filename,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          url: input.url ?? null,
        },
        select: attachmentSelect,
      });
      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'ATTACHMENT_ADDED',
          entityType: 'Attachment',
          entityId: created.id,
          metadata: { ticketId: id, filename: created.filename, sizeBytes: created.sizeBytes },
          ip: clientIp(req),
        }),
      });
      return created;
    });

    const ticket = await db.ticket.findFirst({ where: { id }, select: ticketSelect });
    if (ticket) {
      emitToOrg(actor.orgId, 'ticket:updated', {
        ticket: toTicketDto(ticket),
        actorId: actor.userId,
        changed: ['attachmentCount'],
      });
    }

    res.status(201).json(toAttachmentDto(attachment));
  }),
);

ticketsRouter.delete(
  '/:id/attachments/:childId',
  requireRole('ADMIN', 'AGENT'),
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id, childId } = parseParams(nestedParams, req);

    const deleted = await db.attachment.deleteMany({ where: { id: childId, ticketId: id } });
    if (deleted.count === 0) throw notFound('Attachment');

    const ticket = await db.ticket.findFirst({ where: { id }, select: ticketSelect });
    if (ticket) {
      emitToOrg(actor.orgId, 'ticket:updated', {
        ticket: toTicketDto(ticket),
        actorId: actor.userId,
        changed: ['attachmentCount'],
      });
    }

    res.status(204).end();
  }),
);

