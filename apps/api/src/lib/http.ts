import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Paginated } from '@flowdesk/shared';

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export function paginate<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
    },
  };
}

export function clientIp(req: Request): string | null {
  return req.ip ?? req.socket.remoteAddress ?? null;
}
