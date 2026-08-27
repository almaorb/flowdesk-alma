import type { ApiErrorBody, ErrorCode, FieldError } from '@flowdesk/shared';

/**
 * Every failure the API deliberately produces is an AppError. The error
 * middleware turns it into the `{ error: { code, message, fields? } }`
 * envelope; anything that is not an AppError becomes a 500 INTERNAL_ERROR with
 * its details logged but never leaked.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: FieldError[];
  readonly expose: boolean;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { fields?: FieldError[]; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (options.fields) this.fields = options.fields;
    this.expose = status < 500;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };
  }
}

export const badRequest = (message: string, fields?: FieldError[]) =>
  new AppError(400, 'VALIDATION_ERROR', message, fields ? { fields } : {});

export const unauthenticated = (message = 'Authentication required.') =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const invalidCredentials = (message = 'Email or password is incorrect.') =>
  new AppError(401, 'INVALID_CREDENTIALS', message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'FORBIDDEN', message);

/**
 * Used for anything a caller is not entitled to see. Cross-tenant reads
 * deliberately return 404 rather than 403 so the API never confirms that an id
 * exists in another organization.
 */
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);

export const conflict = (message: string, code: ErrorCode = 'CONFLICT') =>
  new AppError(409, code, message);

export const internalError = (cause?: unknown) =>
  new AppError(500, 'INTERNAL_ERROR', 'Something went wrong.', { cause });

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
