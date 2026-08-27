import { Router } from 'express';
import { z } from 'zod';
import { createInviteSchema } from '@flowdesk/shared';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { auditData, recordAudit } from '../lib/audit.js';
import { AppError, conflict, notFound } from '../lib/errors.js';
import { asyncHandler, clientIp } from '../lib/http.js';
import { toInviteDto, toPublicInviteDto, userRefSelect } from '../lib/serializers.js';
import { generateInviteToken } from '../lib/tokens.js';
import { parseBody, parseParams } from '../lib/validate.js';
import { auth, db as tenant, requireAuth, requireRole } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const INVITE_TTL_DAYS = 7;
const idParams = z.object({ id: z.string().min(1).max(64) });
const tokenParams = z.object({ token: z.string().min(10).max(200) });

const inviteSelect = {
  id: true,
  email: true,
  role: true,
  token: true,
  acceptedAt: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: userRefSelect },
} as const;

export const inviteLink = (token: string) => `${env.WEB_BASE_URL}/invite/${token}`;

/** Unauthenticated lookup used by the invite-acceptance page. */
export const publicInvitesRouter = Router();

publicInvitesRouter.get(
  '/:token',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token } = parseParams(tokenParams, req);

    const invite = await prisma.invite.findUnique({
      where: { token },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        organization: { select: { name: true } },
      },
    });

    if (!invite || invite.revokedAt) {
      throw new AppError(404, 'INVITE_INVALID', 'This invite link is not valid.');
    }
    if (invite.acceptedAt) {
      throw new AppError(400, 'INVITE_INVALID', 'This invite has already been used.');
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new AppError(400, 'INVITE_EXPIRED', 'This invite link has expired.');
    }

    res.json(toPublicInviteDto(invite));
  }),
);

/** Admin-only invite management. */
export const invitesRouter = Router();
invitesRouter.use(requireAuth, requireRole('ADMIN'));

invitesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = tenant(req);
    const invites = await db.invite.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: inviteSelect,
    });
    res.json({
      data: invites.map((invite) => ({ ...toInviteDto(invite), url: inviteLink(invite.token) })),
    });
  }),
);

invitesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const input = parseBody(createInviteSchema, req);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingUser) throw conflict('That email address is already registered.', 'EMAIL_TAKEN');

    const pending = await db.invite.findFirst({
      where: { email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pending) throw conflict('An invite for that address is already pending.');

    const invite = await db.$transaction(async (tx) => {
      const created = await tx.invite.create({
        data: {
          orgId: actor.orgId,
          email: input.email,
          role: input.role,
          token: generateInviteToken(),
          invitedById: actor.userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
        select: inviteSelect,
      });
      await tx.auditLog.create({
        data: auditData({
          orgId: actor.orgId,
          actorId: actor.userId,
          action: 'INVITE_CREATED',
          entityType: 'Invite',
          entityId: created.id,
          metadata: { email: created.email, role: created.role },
          ip: clientIp(req),
        }),
      });
      return created;
    });

    res.status(201).json({ ...toInviteDto(invite), url: inviteLink(invite.token) });
  }),
);

invitesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const actor = auth(req);
    const db = tenant(req);
    const { id } = parseParams(idParams, req);

    const revoked = await db.invite.updateMany({
      where: { id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw notFound('Invite');

    await recordAudit({
      orgId: actor.orgId,
      actorId: actor.userId,
      action: 'INVITE_REVOKED',
      entityType: 'Invite',
      entityId: id,
      ip: clientIp(req),
    });

    res.status(204).end();
  }),
);
