import type { ApiErrorBody, ErrorCode, FieldError } from '@flowdesk/shared';
import { tokenStore } from './tokens';

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly fields: FieldError[];

  constructor(status: number, code: ApiError['code'], message: string, fields: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** Field-level messages keyed by path, for inline form errors. */
  get fieldMap(): Record<string, string> {
    return Object.fromEntries(this.fields.map((f) => [f.path, f.message]));
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Skip the Authorization header (used by the auth endpoints themselves). */
  anonymous?: boolean;
}

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

let refreshInFlight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

/** Notifies the auth context when a refresh finally fails and we are logged out. */
export function onSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announceExpiry(): void {
  tokenStore.clear();
  for (const listener of listeners) listener();
}

/**
 * Refreshes the token pair at most once at a time; concurrent 401s all await
 * the same in-flight request instead of racing to rotate the refresh token
 * (which is single-use server side and would revoke the whole family).
 */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refreshToken = tokenStore.refresh;
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const session = (await response.json()) as { accessToken: string; refreshToken: string };
      tokenStore.save(session);
      return true;
    } catch {
      return false;
    } finally {
      // Release the lock on the next tick so awaiting callers see the result.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const error = body?.error;
  return new ApiError(
    response.status,
    error?.code ?? 'INTERNAL_ERROR',
    error?.message ?? `Request failed with status ${response.status}`,
    error?.fields ?? [],
  );
}

async function send(path: string, options: RequestOptions, retry: boolean): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const token = tokenStore.access;
  if (token && !options.anonymous) headers.authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (cause) {
    if ((cause as Error).name === 'AbortError') throw cause;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the FlowDesk API.');
  }

  if (response.status === 401 && retry && !options.anonymous) {
    const refreshed = await refreshSession();
    if (refreshed) return send(path, options, false);
    announceExpiry();
  }

  return response;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options, true);

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options: RequestOptions = {}) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
