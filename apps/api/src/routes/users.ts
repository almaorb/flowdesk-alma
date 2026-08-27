import { Router } from 'express';
import { z } from 'zod';
import { listUsersQuerySchema, updateUserSchema } from '@flowdesk/shared';
import { auditData } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { asyncHandler, clientIp, paginate } from '../lib/http.js';
import { toUserDto, userSelect } from '../lib/serializers.js';
import { parseBody, parseParams, parseQuery } from '../lib/validate.js';
import { auth, db as tenant, requireAuth, requireRole } from '../middleware/auth.js';
import { revokeAllRefreshTokens } from '../lib/tokens.js';

const idParams = z.object({ id: z.string().min(1).max(64) });

export const usersRouter = Router();
usersRouter.use(requireAuth);

/**
 * Directory of the caller's organization. Agents and admins see everyone (they
 * need the assignee/customer pickers); a customer only ever sees themselves.
 */
usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const query = parseQuery(listUsersQuerySchema, req);

    if (actor.role === 'CUSTOMER') {
      const self = await db.user.findFirst({ where: { id: actor.userId }, select: userSelect });
      res.json(paginate(self ? [toUserDto(self)] : [], self ? 1 : 0, 1, query.pageSize));
      return;
    }

    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: userSelect,
      }),
      db.user.count({ where }),
    ]);

    res.json(paginate(rows.map(toUserDto), total, query.page, query.pageSize));
  }),
);

usersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);

    if (actor.role === 'CUSTOMER' && id !== actor.userId) throw forbidden();

    const user = await db.user.findFirst({ where: { id }, select: userSelect });
    if (!user) throw notFound('User');
    res.json(toUserDto(user));
  }),
);

usersRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);
    const input = parseBody(updateUserSchema, req);

    const target = await db.user.findFirst({ where: { id }, select: userSelect });
    if (!target) throw notFound('User');

    // Guard against an org locking itself out of its own admin console.
    if (target.role === 'ADMIN' && (input.role === 'AGENT' || input.role === 'CUSTOMER' || input.isActive === false)) {
      const admins = await db.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (admins <= 1) {
        throw badRequest('An organization must keep at least one active admin.', [
          { path: 'role', message: 'Last active admin' },
        ]);
      }
    }
    if (target.id === actor.userId && input.isActive === false) {
      throw badRequest('You cannot deactivate your own account.', [
        { path: 'isActive', message: 'Cannot deactivate yourself' },
      ]);
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: userSelect,
      });
      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: id,
          metadata: {
            ...(input.role !== undefined ? { roleFrom: target.role, roleTo: input.role } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
          },
          ip: clientIp(req),
        }),
      });
      return next;
    });

    // A deactivated or demoted user should not keep a live session.
    if (input.isActive === false || (input.role !== undefined && input.role !== target.role)) {
      await revokeAllRefreshTokens(id);
    }

    res.json(toUserDto(updated));
  }),
);
