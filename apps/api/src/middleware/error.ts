import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, isAppError, notFound } from '../lib/errors.js';
import { toFieldErrors } from '../lib/validate.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.path}`));
};

function normalise(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return new AppError(400, 'VALIDATION_ERROR', 'Invalid request.', {
      fields: toFieldErrors(error),
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | string | undefined) ?? 'field';
        const fields = Array.isArray(target) ? target.join(', ') : String(target);
        return new AppError(409, 'CONFLICT', `A record with that ${fields} already exists.`);
      }
      case 'P2025':
        return new AppError(404, 'NOT_FOUND', 'Resource not found.');
      case 'P2003':
        return new AppError(400, 'VALIDATION_ERROR', 'Referenced record does not exist.');
      default:
        break;
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(400, 'VALIDATION_ERROR', 'Invalid query.');
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    (error as SyntaxError & { status?: number }).status === 400
  ) {
    return new AppError(400, 'VALIDATION_ERROR', 'Request body is not valid JSON.');
  }

  if (typeof error === 'object' && error !== null && 'type' in error) {
    if ((error as { type?: string }).type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong.', { cause: error });
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = normalise(error);

  if (appError.status >= 500) {
    logger.error(
      { err: error, requestId: req.id, method: req.method, path: req.path },
      'unhandled request error',
    );
  } else {
    logger.debug(
      { code: appError.code, requestId: req.id, method: req.method, path: req.path },
      appError.message,
    );
  }

  if (res.headersSent) return;
  res.status(appError.status).json(appError.toBody());
};
