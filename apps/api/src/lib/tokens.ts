import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@flowdesk/shared';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AppError, unauthenticated } from './errors.js';

export interface AccessTokenClaims {
  sub: string;
  orgId: string;
  role: Role;
  email: string;
}

interface RefreshClaims {
  sub: string;
  jti: string;
  type: 'refresh';
}

const ISSUER = 'flowdesk';

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign({ orgId: claims.orgId, role: claims.role, email: claims.email }, env.JWT_ACCESS_SECRET, {
    subject: claims.sub,
    issuer: ISSUER,
    audience: 'flowdesk-api',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: 'flowdesk-api',
    });
    if (typeof decoded === 'string') throw new Error('unexpected token payload');
    const { sub, orgId, role, email } = decoded as jwt.JwtPayload & Omit<AccessTokenClaims, 'sub'>;
    if (!sub || !orgId || !role || !email) throw new Error('incomplete token payload');
    return { sub, orgId, role, email };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired.');
    }
    throw unauthenticated('Access token is invalid.');
  }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Refresh tokens are JWTs (so they are self-describing and signed with a
 * separate secret) whose SHA-256 hash is also persisted, which is what makes
 * them revocable and single-use.
 */
export async function issueRefreshToken(userId: string, userAgent?: string): Promise<string> {
  const jti = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const token = jwt.sign({ jti, type: 'refresh' } satisfies Omit<RefreshClaims, 'sub'>, env.JWT_REFRESH_SECRET, {
    subject: userId,
    issuer: ISSUER,
    audience: 'flowdesk-refresh',
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: userAgent?.slice(0, 250) ?? null,
    },
  });

  return token;
}

export interface VerifiedRefreshToken {
  userId: string;
  tokenId: string;
}

export async function consumeRefreshToken(raw: string): Promise<VerifiedRefreshToken> {
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(raw, env.JWT_REFRESH_SECRET, {
      issuer: ISSUER,
      audience: 'flowdesk-refresh',
    });
    if (typeof decoded === 'string') throw new Error('unexpected token payload');
    payload = decoded;
  } catch {
    throw unauthenticated('Refresh token is invalid or has expired.');
  }

  const userId = payload.sub;
  if (!userId) throw unauthenticated('Refresh token is invalid or has expired.');

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!stored || stored.userId !== userId) {
    throw unauthenticated('Refresh token is invalid or has expired.');
  }
  if (stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
    // Re-use of an already-rotated token: drop every session for that user.
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthenticated('Refresh token is invalid or has expired.');
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return { userId, tokenId: stored.id };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}
