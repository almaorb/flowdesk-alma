import type { Request } from 'express';
import type { ZodError, z } from 'zod';
import type { FieldError } from '@flowdesk/shared';
import { badRequest } from './errors.js';

export function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

function run<S extends z.ZodTypeAny>(schema: S, data: unknown, label: string): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(`Invalid request ${label}.`, toFieldErrors(result.error));
  }
  return result.data as z.output<S>;
}

/** Validates and returns a typed request body. Used by every mutating handler. */
export function parseBody<S extends z.ZodTypeAny>(schema: S, req: Request): z.output<S> {
  return run(schema, req.body, 'body');
}

export function parseQuery<S extends z.ZodTypeAny>(schema: S, req: Request): z.output<S> {
  return run(schema, req.query, 'query parameters');
}

export function parseParams<S extends z.ZodTypeAny>(schema: S, req: Request): z.output<S> {
  return run(schema, req.params, 'path parameters');
}
