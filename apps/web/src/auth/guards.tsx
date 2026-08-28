import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@flowdesk/shared';
import { useAuth } from './AuthContext';
import { FullPageSpinner } from '../components/Spinner';

/** Blocks a route until a session exists; remembers where the user was going. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Restoring your session…" />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children ?? <Outlet />}</>;
}

/**
 * Client-side role gate. It mirrors the API's guards so the UI never shows a
 * page the server would refuse — the API remains the enforcement point.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children?: ReactNode }) {
  const { status, user } = useAuth();

  if (status === 'loading') return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/tickets" replace />;
  return <>{children ?? <Outlet />}</>;
}

/** Sends an already-authenticated visitor away from login/signup. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/tickets" replace />;
  return <>{children}</>;
}
