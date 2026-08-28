import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuditActions, useAuditLogs } from '../hooks/queries';
import { formatDateTime, formatRelative } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Avatar } from '../components/Avatar';
import { Pagination } from '../components/Pagination';
import { SkeletonRows } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';

const ACTION_TONE: Record<string, string> = {
  TICKET_CREATED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  TICKET_STATUS_CHANGED: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  TICKET_UPDATED: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  TICKET_ASSIGNED: 'bg-teal-50 text-teal-700 ring-teal-600/20',
  TICKET_DELETED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  COMMENT_CREATED: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  SLA_BREACHED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  USER_LOGGED_IN: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  INVITE_CREATED: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  INVITE_ACCEPTED: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const logs = useAuditLogs({ page, pageSize: 25, ...(action ? { action } : {}) });
  const actions = useAuditActions();

  return (
    <div className="p-6">
      <PageHeader
        title="Audit log"
        description="Immutable record of every state change in your organization."
        actions={
          <select
            className="field w-56"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            {(actions.data ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        }
      />

      <div className="card overflow-hidden">
        <div className="max-h-[calc(100vh-15rem)] overflow-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head w-56">Action</th>
                <th className="table-head w-52">Actor</th>
                <th className="table-head">Entity</th>
                <th className="table-head">Detail</th>
                <th className="table-head w-44">When</th>
              </tr>
            </thead>
            <tbody>
              {logs.isLoading ? (
                <SkeletonRows cols={5} />
              ) : logs.isError ? (
                <tr>
                  <td colSpan={5}>
                    <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
                  </td>
                </tr>
              ) : (logs.data?.data.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="No audit entries" description="Nothing has been recorded for this filter." />
                  </td>
                </tr>
              ) : (
                logs.data?.data.map((entry) => (
                  <tr key={entry.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ring-1 ring-inset ${
                          ACTION_TONE[entry.action] ?? 'bg-ink-100 text-ink-600 ring-ink-500/20'
                        }`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.actor ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={entry.actor.name} id={entry.actor.id} size="sm" />
                          <span className="truncate text-sm text-ink-700">{entry.actor.name}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-ink-400">System</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-ink-600">
                      {entry.entityType === 'Ticket' && entry.entityId ? (
                        <Link className="link font-mono text-xs" to={`/tickets/${entry.entityId}`}>
                          {entry.metadata?.number === undefined
                            ? 'View ticket'
                            : `Ticket #${String(entry.metadata.number)}`}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-ink-500">{entry.entityType}</span>
                      )}
                    </td>
                    <td className="max-w-0 truncate px-4 py-2.5 font-mono text-[11px] text-ink-500">
                      {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500" title={formatDateTime(entry.createdAt)}>
                      {formatRelative(entry.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {logs.data ? <Pagination meta={logs.data.meta} label="entries" onPageChange={setPage} /> : null}
      </div>
    </div>
  );
}
