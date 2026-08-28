import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../src/db/prisma.js';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';
import {
  consumeRefreshToken,
  hashToken,
  issueRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/lib/tokens.js';
import { AppError } from '../../src/lib/errors.js';
import { resetDatabase } from '../helpers/fixtures.js';

let userId: string;
let orgId: string;

beforeAll(async () => {
  await resetDatabase();
  const org = await prisma.organization.create({ data: { name: 'Unit Co', slug: 'unit-co' } });
  orgId = org.id;
  const user = await prisma.user.create({
    data: {
      orgId,
      email: 'unit@unit-co.test',
      name: 'Unit User',
      role: 'ADMIN',
      passwordHash: await hashPassword('CorrectHorse123!'),
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('password hashing', () => {
  it('produces a bcrypt hash that is not the plaintext', async () => {
    const hash = await hashPassword('CorrectHorse123!');
    expect(hash).not.toBe('CorrectHorse123!');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('accepts the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('CorrectHorse123!');
    expect(await verifyPassword('CorrectHorse123!', hash)).toBe(true);
    expect(await verifyPassword('correcthorse123!', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('returns false rather than throwing when no hash exists (unknown email)', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips the tenant and role claims', () => {
    const token = signAccessToken({
      sub: userId,
      orgId,
      role: 'AGENT',
      email: 'unit@unit-co.test',
    });
    const claims = verifyAccessToken(token);
    expect(claims).toEqual({ sub: userId, orgId, role: 'AGENT', email: 'unit@unit-co.test' });
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ orgId, role: 'ADMIN', email: 'x@y.z' }, 'not-the-real-secret', {
      subject: userId,
      issuer: 'flowdesk',
      audience: 'flowdesk-api',
      expiresIn: 600,
    });
    expect(() => verifyAccessToken(forged)).toThrowError(AppError);
    try {
      verifyAccessToken(forged);
    } catch (error) {
      expect((error as AppError).code).toBe('UNAUTHENTICATED');
    }
  });

  it('reports an expired token distinctly so the client knows to refresh', () => {
    const expired = jwt.sign(
      { orgId, role: 'ADMIN', email: 'x@y.z' },
      process.env.JWT_ACCESS_SECRET!,
      {
        subject: userId,
        issuer: 'flowdesk',
        audience: 'flowdesk-api',
        expiresIn: -10,
      },
    );
    try {
      verifyAccessToken(expired);
      throw new Error('expected verifyAccessToken to throw');
    } catch (error) {
      expect((error as AppError).code).toBe('TOKEN_EXPIRED');
      expect((error as AppError).status).toBe(401);
    }
  });

  it('refuses a refresh token presented as an access token (audience is checked)', async () => {
    const refreshToken = await issueRefreshToken(userId);
    expect(() => verifyAccessToken(refreshToken)).toThrowError(AppError);
  });

  it('refuses a token with no subject', () => {
    const anonymous = jwt.sign(
      { orgId, role: 'ADMIN', email: 'x@y.z' },
      process.env.JWT_ACCESS_SECRET!,
      {
        issuer: 'flowdesk',
        audience: 'flowdesk-api',
        expiresIn: 600,
      },
    );
    expect(() => verifyAccessToken(anonymous)).toThrowError(AppError);
  });
});

describe('refresh tokens', () => {
  it('persists only a hash of the token', async () => {
    const token = await issueRefreshToken(userId);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
    expect(stored).not.toBeNull();
    const anyMatchingRaw = await prisma.refreshToken.findFirst({ where: { tokenHash: token } });
    expect(anyMatchingRaw).toBeNull();
  });

  it('is single-use: consuming it revokes it', async () => {
    const token = await issueRefreshToken(userId);
    const consumed = await consumeRefreshToken(token);
    expect(consumed.userId).toBe(userId);
    await expect(consumeRefreshToken(token)).rejects.toThrowError(AppError);
  });

  it('treats re-use as a compromise and revokes every live session', async () => {
    await revokeAllRefreshTokens(userId);
    const compromised = await issueRefreshToken(userId);
    const sibling = await issueRefreshToken(userId);

    await consumeRefreshToken(compromised);
    await expect(consumeRefreshToken(compromised)).rejects.toThrowError(AppError);

    // The sibling session is collateral damage, by design.
    await expect(consumeRefreshToken(sibling)).rejects.toThrowError(AppError);
  });

  it('rejects a token whose signature does not match', async () => {
    const forged = jwt.sign({ jti: 'abc', type: 'refresh' }, 'wrong-secret', {
      subject: userId,
      issuer: 'flowdesk',
      audience: 'flowdesk-refresh',
      expiresIn: '7d',
    });
    await expect(consumeRefreshToken(forged)).rejects.toThrowError(AppError);
  });

  it('rejects a well-signed token that was never issued', async () => {
    const unissued = jwt.sign(
      { jti: 'never-stored', type: 'refresh' },
      process.env.JWT_REFRESH_SECRET!,
      {
        subject: userId,
        issuer: 'flowdesk',
        audience: 'flowdesk-refresh',
        expiresIn: '7d',
      },
    );
    await expect(consumeRefreshToken(unissued)).rejects.toThrowError(AppError);
  });

  it('revokeRefreshToken makes a live token unusable', async () => {
    const token = await issueRefreshToken(userId);
    await revokeRefreshToken(token);
    await expect(consumeRefreshToken(token)).rejects.toThrowError(AppError);
  });
});
