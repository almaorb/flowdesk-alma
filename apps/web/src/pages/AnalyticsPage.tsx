import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Priority } from '@flowdesk/shared';
import { useAnalytics } from '../hooks/queries';
import { formatMinutes, formatPercent } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { PRIORITY_LABELS } from '../components/Badges';
import { Spinner } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';

const RANGES = [7, 30, 90] as const;

const PRIORITY_FILL: Record<Priority, string> = {
  LOW: '#94a3b8',
  MEDIUM: '#38bdf8',
  HIGH: '#f59e0b',
  URGENT: '#e11d48',
};

/** Every number here is computed by Postgres — the client only draws it. */
export default function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const { overview, perDay, firstResponse, breachRate } = useAnalytics(days);

  if (overview.isError) {
    return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Analytics"
        description="Aggregated in SQL over your organization's tickets."
        actions={
          <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  days === range ? 'bg-accent-600 text-white' : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                {range}d
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Tickets created"
          value={overview.data?.totalTickets}
          loading={overview.isLoading}
          hint={`in the last ${days} days`}
        />
        <Stat
          label="Currently open"
          value={overview.data?.openTickets}
          loading={overview.isLoading}
          hint="not resolved or closed"
        />
        <Stat
          label="Avg first response"
          value={overview.data ? formatMinutes(overview.data.avgFirstResponseMinutes) : undefined}
          loading={overview.isLoading}
          hint="across every answered ticket"
        />
        <Stat
          label="SLA breach rate"
          value={overview.data ? formatPercent(overview.data.breachRate) : undefined}
          loading={overview.isLoading}
          hint={`${overview.data?.breachedTickets ?? 0} breached`}
          tone={overview.data && overview.data.breachRate > 0.25 ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card p-4">
          <h2 className="text-sm font-semibold tracking-tight text-ink-900">Created vs resolved</h2>
          <p className="mb-3 text-xs text-ink-500">Per UTC day over the selected window.</p>
          <div className="h-64">
            {perDay.isLoading ? (
              <Centered>
                <Spinner className="h-5 w-5 text-ink-300" />
              </Centered>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={perDay.data ?? []} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="created" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="resolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eceef2" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#8592aa' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: string) => value.slice(5)}
                    minTickGap={18}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8592aa' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #d5d9e2',
                      fontSize: 12,
                      boxShadow: '0 10px 30px -12px rgba(22,26,34,.25)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="created"
                    name="Created"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#created)"
                  />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    name="Resolved"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#resolved)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-ink-500">
            <Legend color="#6366f1" label="Created" />
            <Legend color="#10b981" label="Resolved" />
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold tracking-tight text-ink-900">Breach rate by priority</h2>
          <p className="mb-3 text-xs text-ink-500">Share of tickets that missed first response.</p>
          <div className="h-64">
            {breachRate.isLoading ? (
              <Centered>
                <Spinner className="h-5 w-5 text-ink-300" />
              </Centered>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(breachRate.data ?? []).map((row) => ({
                    ...row,
                    label: PRIORITY_LABELS[row.priority],
                    pct: Number((row.breachRate * 100).toFixed(1)),
                  }))}
                  margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
                >
                  <CartesianGrid stroke="#eceef2" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8592aa' }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8592aa' }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: '#f6f7f9' }}
                    formatter={(value: number, _name, item) => [
                      `${value}% (${(item.payload as { breached: number }).breached}/${
                        (item.payload as { total: number }).total
                      })`,
                      'Breached',
                    ]}
                    contentStyle={{ borderRadius: 10, border: '1px solid #d5d9e2', fontSize: 12 }}
                  />
                  <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {(breachRate.data ?? []).map((row) => (
                      <Cell key={row.priority} fill={PRIORITY_FILL[row.priority]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <section className="card mt-5">
        <div className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-ink-900">First response by agent</h2>
          <p className="text-xs text-ink-500">
            Average and median time from ticket creation to that agent&rsquo;s first public reply.
          </p>
        </div>
        {firstResponse.isLoading ? (
          <div className="px-4 py-10">
            <Centered>
              <Spinner className="h-5 w-5 text-ink-300" />
            </Centered>
          </div>
        ) : (firstResponse.data?.length ?? 0) === 0 ? (
          <EmptyState title="No first responses recorded yet" />
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Agent</th>
                <th className="table-head w-32 text-right">Tickets</th>
                <th className="table-head w-36 text-right">Average</th>
                <th className="table-head w-36 text-right">Median</th>
                <th className="table-head w-1/3">Relative speed</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows = firstResponse.data ?? [];
                const slowest = Math.max(...rows.map((row) => row.avgFirstResponseMinutes), 1);
                return rows.map((row) => (
                  <tr key={row.agentId} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium text-ink-800">{row.agentName}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink-600">
                      {row.ticketsAnswered}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink-800">
                      {formatMinutes(row.avgFirstResponseMinutes)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-ink-600">
                      {formatMinutes(row.medianFirstResponseMinutes)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-accent-500"
                          style={{ width: `${(row.avgFirstResponseMinutes / slowest) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  loading,
  tone = 'default',
}: {
  label: string;
  value: number | string | undefined;
  hint?: string;
  loading?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${
          tone === 'danger' ? 'text-rose-600' : 'text-ink-900'
        }`}
      >
        {loading ? <span className="inline-block h-7 w-16 animate-pulse-soft rounded bg-ink-100" /> : (value ?? '—')}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center">{children}</div>;
}
