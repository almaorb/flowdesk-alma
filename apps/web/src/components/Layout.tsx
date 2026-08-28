import clsx from 'clsx';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '@flowdesk/shared';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../realtime/RealtimeProvider';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { RoleBadge } from './Badges';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
}

const icon = (path: string) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NAV: NavItem[] = [
  { to: '/tickets', label: 'Tickets', icon: icon('M4 6h16M4 12h16M4 18h10') },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: icon('M4 19V5m0 14h16M8 15V9m4 6V6m4 9v-4'),
    roles: ['ADMIN'],
  },
  {
    to: '/team',
    label: 'Team',
    icon: icon('M16 19a4 4 0 00-8 0M12 11a3 3 0 100-6 3 3 0 000 6zM20 19a3 3 0 00-4-2.8'),
    roles: ['ADMIN'],
  },
  {
    to: '/audit',
    label: 'Audit log',
    icon: icon(
      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 104 0M9 12h6M9 16h4',
    ),
    roles: ['ADMIN'],
  },
];

function LiveIndicator() {
  const { connected } = useRealtime();
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-500"
      title={connected ? 'Receiving live updates' : 'Reconnecting to the live feed'}
    >
      <span
        className={clsx(
          'h-1.5 w-1.5 rounded-full',
          connected ? 'bg-emerald-500' : 'animate-pulse-soft bg-amber-500',
        )}
      />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}

export function Layout() {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();

  const items = NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-200 bg-white">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-white">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <path d="M5 7h14M5 12h9M5 17h11" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight tracking-tight text-ink-900">
              FlowDesk
            </p>
            <p className="truncate text-[11px] leading-tight text-ink-500">{organization?.name}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-accent-50 text-accent-800'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-100 p-3">
          <div className="flex items-center gap-2.5 px-1 pb-2.5">
            {user ? <Avatar name={user.name} id={user.id} /> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight text-ink-900">
                {user?.name}
              </p>
              <p className="truncate text-[11px] leading-tight text-ink-500">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-1">
            {user ? <RoleBadge role={user.role} /> : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void logout().then(() => navigate('/login', { replace: true }));
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-end gap-4 border-b border-ink-200 bg-white/80 px-6 backdrop-blur">
          <LiveIndicator />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
