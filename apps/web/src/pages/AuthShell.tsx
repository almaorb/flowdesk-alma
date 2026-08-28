import type { ReactNode } from 'react';

/**
 * Shell for the unauthenticated pages. The right-hand panel doubles as
 * documentation: reviewers get the seeded demo logins without leaving the app.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white">
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
            <span className="text-lg font-semibold tracking-tight">FlowDesk</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p> : null}

          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-ink-500">{footer}</div> : null}
        </div>
      </div>

      <aside className="hidden flex-col justify-center gap-6 border-l border-ink-200 bg-white px-10 lg:flex">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-400">
            Demo tenants
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            The seed script creates two isolated organizations. Sign in as either to see that
            neither can read the other&rsquo;s tickets.
          </p>
        </div>

        {[
          {
            org: 'Northwind Support',
            rows: [
              ['Admin', 'ada.lovelace@northwind.test'],
              ['Agent', 'grace.hopper@northwind.test'],
              ['Customer', 'bruno.silva@northwind.test'],
            ],
          },
          {
            org: 'Contoso Care',
            rows: [
              ['Admin', 'marie.curie@contoso.test'],
              ['Agent', 'katherine.johnson@contoso.test'],
            ],
          },
        ].map((tenant) => (
          <div key={tenant.org} className="card p-4">
            <p className="text-sm font-semibold text-ink-900">{tenant.org}</p>
            <dl className="mt-2.5 space-y-1.5">
              {tenant.rows.map(([role, email]) => (
                <div key={email} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                    {role}
                  </dt>
                  <dd className="font-mono text-[12px] text-ink-700">{email}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        <p className="text-xs text-ink-500">
          Password for every seeded account:{' '}
          <code className="font-mono text-ink-800">Password123!</code>
        </p>
      </aside>
    </div>
  );
}
