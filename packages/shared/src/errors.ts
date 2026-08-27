/** Machine-readable error codes returned in `{ error: { code, message } }`. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'FORBIDDEN',
  'FORBIDDEN_TRANSITION',
  'NOT_FOUND',
  'CONFLICT',
  'EMAIL_TAKEN',
  'INVALID_TRANSITION',
  'INVITE_INVALID',
  'INVITE_EXPIRED',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldError {
  path: string;
  message: string;
}

/** Every non-2xx response from the API has exactly this shape. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Present on VALIDATION_ERROR responses. */
    fields?: FieldError[];
  };
}
