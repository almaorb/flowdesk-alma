import type { AuthSessionDto } from '@flowdesk/shared';

const ACCESS_KEY = 'flowdesk.accessToken';
const REFRESH_KEY = 'flowdesk.refreshToken';

/**
 * Token storage.
 *
 * Tokens live in localStorage because the Socket.IO handshake needs the access
 * token in JS, and because it keeps the demo runnable from any origin. The
 * trade-off (XSS can read them) is called out in the README; the production
 * shape would be an httpOnly refresh cookie plus an in-memory access token.
 * The API already sets an httpOnly `fd_refresh` cookie alongside the JSON
 * response, so that migration is a client-side change only.
 */
export const tokenStore = {
  get access(): string | null {
    try {
      return localStorage.getItem(ACCESS_KEY);
    } catch {
      return null;
    }
  },
  get refresh(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  save(session: Pick<AuthSessionDto, 'accessToken' | 'refreshToken'>): void {
    try {
      localStorage.setItem(ACCESS_KEY, session.accessToken);
      localStorage.setItem(REFRESH_KEY, session.refreshToken);
    } catch {
      /* private mode — the session simply will not survive a reload */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
};
