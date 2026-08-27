import type { Role } from '@flowdesk/shared';
import type { TenantDb } from '../db/tenant.js';

export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by `requireAuth` / `optionalAuth`. */
      auth?: AuthContext;
      /** Tenant-scoped Prisma client for the authenticated organization. */
      db?: TenantDb;
      /** Correlation id echoed back as `x-request-id`. */
      id?: string;
    }
  }
}

export {};
