import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@flowdesk/shared';
import { prisma } from '../db/prisma.js';
import { tenantDb } from '../db/tenant.js';
import { forbidden, unauthenticated } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const cookie = (req.cookies as Record<string, string> | undefined)?.fd_access;
  return cookie ?? null;
}

/**
 * Verifies the access token, re-reads the user (so a deactivated or
 * role-changed account stops mattering immediately rather than at token
 * expiry), and attaches a tenant-scoped Prisma client for the org in the token.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  void (async () => {
    const token = bearerToken(req);
    if (!token) throw unauthenticated();

    const claims = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, orgId: true, role: true, email: true, name: true, isActive: true },
    });

    if (!user || !user.isActive) throw unauthenticated('Account is inactive or no longer exists.');
    // The token's org must still match the user's org.
    if (user.orgId !== claims.orgId) throw unauthenticated('Session is no longer valid.');

    req.auth = {
      userId: user.id,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
      name: user.name,
    };
    req.db = tenantDb(user.orgId);
    next();
  })().catch(next);
};

/** Route guard: `requireRole('ADMIN')`, `requireRole('ADMIN', 'AGENT')`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthenticated());
    if (!roles.includes(req.auth.role)) {
      return next(forbidden(`This action requires one of: ${roles.join(', ')}.`));
    }
    next();
  };
}

/** Narrowing helpers so handlers do not need non-null assertions. */
export function auth(req: Request) {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

export function db(req: Request) {
  if (!req.db) throw unauthenticated();
  return req.db;
}
