import { Router } from 'express';
import {
  acceptInviteSchema,
  loginSchema,
  refreshSchema,
  signupSchema,
  type AuthSessionDto,
} from '@flowdesk/shared';
import { env, isProduction } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { auditData, recordAuditSafe } from '../lib/audit.js';
import { AppError, conflict, invalidCredentials, unauthenticated } from '../lib/errors.js';
import { asyncHandler, clientIp } from '../lib/http.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { toOrganizationDto, toUserDto, userSelect } from '../lib/serializers.js';
import { slugCandidate } from '../lib/slug.js';
import {
  consumeRefreshToken,
  issueRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
} from '../lib/tokens.js';
import { parseBody } from '../lib/validate.js';
import { auth, requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const REFRESH_COOKIE = 'fd_refresh';

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

async function buildSession(userId: string, userAgent?: string): Promise<AuthSessionDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...userSelect,
      organization: { select: { id: true, name: true, slug: true, createdAt: true } },
    },
  });
  if (!user) throw unauthenticated('Account no longer exists.');

  const accessToken = signAccessToken({
    sub: user.id,
    orgId: user.orgId,
    role: user.role,
    email: user.email,
  });
  const refreshToken = await issueRefreshToken(user.id, userAgent);

  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    user: toUserDto(user),
    organization: toOrganizationDto(user.organization),
  };
}

export const authRouter = Router();

/**
 * Signup bootstraps a tenant: it creates the organization and its first ADMIN
 * in one transaction, so a half-created org can never exist.
 */
authRouter.post(
  '/signup',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(signupSchema, req);

    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw conflict('That email address is already registered.', 'EMAIL_TAKEN');

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      let organization = null;
      for (let attempt = 0; attempt < 5 && !organization; attempt += 1) {
        const slug = slugCandidate(input.organizationName, attempt);
        const taken = await tx.organization.findUnique({ where: { slug }, select: { id: true } });
        if (taken) continue;
        organization = await tx.organization.create({
          data: { name: input.organizationName, slug },
        });
      }
      if (!organization)
        throw conflict('Could not allocate an organization slug. Try another name.');

      const created = await tx.user.create({
        data: {
          orgId: organization.id,
          email: input.email,
          name: input.name,
          passwordHash,
          role: 'ADMIN',
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: auditData({
          orgId: organization.id,
          actorId: created.id,
          action: 'ORG_CREATED',
          entityType: 'Organization',
          entityId: organization.id,
          metadata: { name: organization.name, slug: organization.slug },
          ip: clientIp(req),
        }),
      });
      await tx.auditLog.create({
        data: auditData({
          orgId: organization.id,
          actorId: created.id,
          action: 'USER_SIGNED_UP',
          entityType: 'User',
          entityId: created.id,
          metadata: { email: input.email, role: 'ADMIN' },
          ip: clientIp(req),
        }),
      });

      return created;
    });

    const session = await buildSession(user.id, req.header('user-agent'));
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);
    res.status(201).json(session);
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req);

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, orgId: true, passwordHash: true, isActive: true },
    });

    const ok = await verifyPassword(input.password, user?.passwordHash ?? null);
    if (!user || !ok) throw invalidCredentials();
    if (!user.isActive) throw new AppError(403, 'FORBIDDEN', 'This account has been deactivated.');

    const session = await buildSession(user.id, req.header('user-agent'));

    recordAuditSafe({
      orgId: user.orgId,
      actorId: user.id,
      action: 'USER_LOGGED_IN',
      entityType: 'User',
      entityId: user.id,
      ip: clientIp(req),
    });

    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);
    res.json(session);
  }),
);

/** Refresh tokens are single-use: consuming one revokes it and mints a new pair. */
authRouter.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(refreshSchema, req);
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = body.refreshToken ?? cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthenticated('No refresh token supplied.');

    const { userId } = await consumeRefreshToken(token);
    const session = await buildSession(userId, req.header('user-agent'));

    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);
    res.json(session);
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const body = parseBody(refreshSchema, req);
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = body.refreshToken ?? cookies?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);

    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
    res.status(204).end();
  }),
);

/** Revokes every session for the caller (useful after a password compromise). */
authRouter.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId, orgId } = auth(req);
    await revokeAllRefreshTokens(userId);
    recordAuditSafe({
      orgId,
      actorId: userId,
      action: 'USER_LOGGED_OUT',
      entityType: 'User',
      entityId: userId,
      metadata: { scope: 'all-sessions' },
      ip: clientIp(req),
    });
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = auth(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...userSelect,
        organization: { select: { id: true, name: true, slug: true, createdAt: true } },
      },
    });
    if (!user) throw unauthenticated();
    res.json({ user: toUserDto(user), organization: toOrganizationDto(user.organization) });
  }),
);

/** Accepting an invite creates the user inside the inviting organization. */
authRouter.post(
  '/accept-invite',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(acceptInviteSchema, req);

    const invite = await prisma.invite.findUnique({
      where: { token: input.token },
      select: {
        id: true,
        orgId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });

    if (!invite || invite.revokedAt)
      throw new AppError(400, 'INVITE_INVALID', 'This invite link is not valid.');
    if (invite.acceptedAt)
      throw new AppError(400, 'INVITE_INVALID', 'This invite has already been used.');
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new AppError(400, 'INVITE_EXPIRED', 'This invite link has expired.');
    }

    const existing = await prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });
    if (existing) throw conflict('That email address is already registered.', 'EMAIL_TAKEN');

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new AppError(400, 'INVITE_INVALID', 'This invite has already been used.');
      }

      const created = await tx.user.create({
        data: {
          orgId: invite.orgId,
          email: invite.email,
          name: input.name,
          passwordHash,
          role: invite.role,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: auditData({
          orgId: invite.orgId,
          actorId: created.id,
          action: 'INVITE_ACCEPTED',
          entityType: 'User',
          entityId: created.id,
          metadata: { email: invite.email, role: invite.role, inviteId: invite.id },
          ip: clientIp(req),
        }),
      });

      return created;
    });

    const session = await buildSession(user.id, req.header('user-agent'));
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);
    res.status(201).json(session);
  }),
);
