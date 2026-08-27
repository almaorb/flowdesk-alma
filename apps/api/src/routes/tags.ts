import { Router } from 'express';
import { z } from 'zod';
import { createTagSchema } from '@flowdesk/shared';
import { auditData } from '../lib/audit.js';
import { conflict, notFound } from '../lib/errors.js';
import { asyncHandler, clientIp } from '../lib/http.js';
import { tagSelect, toTagDto } from '../lib/serializers.js';
import { parseBody, parseParams } from '../lib/validate.js';
import { auth, db as tenant, requireAuth, requireRole } from '../middleware/auth.js';

const idParams = z.object({ id: z.string().min(1).max(64) });

export const tagsRouter = Router();
tagsRouter.use(requireAuth);

tagsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = tenant(req);
    const tags = await db.tag.findMany({ orderBy: { name: 'asc' }, select: tagSelect });
    res.json({ data: tags.map(toTagDto) });
  }),
);

tagsRouter.post(
  '/',
  requireRole('ADMIN', 'AGENT'),
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const input = parseBody(createTagSchema, req);

    const existing = await db.tag.findFirst({ where: { name: input.name }, select: { id: true } });
    if (existing) throw conflict('A tag with that name already exists.');

    const tag = await db.$transaction(async (tx) => {
      const created = await tx.tag.create({
        data: { orgId: actor.orgId, name: input.name, color: input.color },
        select: tagSelect,
      });
      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'TAG_CREATED',
          entityType: 'Tag',
          entityId: created.id,
          metadata: { name: created.name },
          ip: clientIp(req),
        }),
      });
      return created;
    });

    res.status(201).json(toTagDto(tag));
  }),
);

tagsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);

    const tag = await db.tag.findFirst({ where: { id }, select: tagSelect });
    if (!tag) throw notFound('Tag');

    await db.$transaction(async (tx) => {
      await tx.tag.delete({ where: { id } });
      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'TAG_DELETED',
          entityType: 'Tag',
          entityId: id,
          metadata: { name: tag.name },
          ip: clientIp(req),
        }),
      });
    });

    res.status(204).end();
  }),
);
