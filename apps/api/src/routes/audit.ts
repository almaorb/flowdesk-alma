import { Router } from 'express';
import { listAuditQuerySchema } from '@flowdesk/shared';
import { asyncHandler, paginate } from '../lib/http.js';
import { toAuditLogDto, userRefSelect } from '../lib/serializers.js';
import { parseQuery } from '../lib/validate.js';
import { db as tenant, requireAuth, requireRole } from '../middleware/auth.js';

const auditSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ip: true,
  createdAt: true,
  actor: { select: userRefSelect },
} as const;

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('ADMIN'));

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = tenant(req);
    const query = parseQuery(listAuditQuerySchema, req);

    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
    };

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: auditSelect,
      }),
      db.auditLog.count({ where }),
    ]);

    res.json(paginate(rows.map(toAuditLogDto), total, query.page, query.pageSize));
  }),
);

/** Distinct action names, for the filter dropdown on the audit page. */
auditRouter.get(
  '/actions',
  asyncHandler(async (req, res) => {
    const db = tenant(req);
    const rows = await db.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } });
    res.json({ data: rows.map((row) => row.action) });
  }),
);
