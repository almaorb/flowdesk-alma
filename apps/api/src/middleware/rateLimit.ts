import type { Request } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import type { ApiErrorBody } from '@flowdesk/shared';
import { env, isTest } from '../config/env.js';

const body: ApiErrorBody = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
};

/**
 * IPv6 clients get a whole /64 to themselves, so bucketing on the full address
 * would let one client trivially rotate around the limit.
 */
function ipKey(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (!ip.includes(':')) return ip;
  return `${ip.split(':').slice(0, 4).join(':')}::/64`;
}

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // We supply our own IPv6-aware key generator, so the library's key checks
  // (which assume the default generator) are not useful here.
  validate: false,
  // Rate limiting would make the integration suite order-dependent and flaky.
  skip: () => isTest,
  handler: (_req, res) => {
    res.status(429).json(body);
  },
};

/**
 * Auth endpoints are keyed on IP *and* the submitted email, so one attacker
 * cannot lock every account from a single address while a distributed attack
 * still hits a per-account ceiling.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === 'string' ? `${ipKey(req)}:${email.toLowerCase()}` : ipKey(req);
  },
});

/** Coarser ceiling applied to the whole API surface. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: env.API_RATE_LIMIT_WINDOW_MS,
  limit: env.API_RATE_LIMIT_MAX,
  keyGenerator: (req) => req.auth?.userId ?? ipKey(req),
});
