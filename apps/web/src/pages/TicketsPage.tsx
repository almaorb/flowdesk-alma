import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PRIORITIES, TICKET_STATUSES } from '@flowdesk/shared';
import type { TicketDto } from '@flowdesk/shared';
import { useAuth } from '../auth/AuthContext';
import { useTags, useTickets, useUsers } from '../hooks/queries';
import { formatRelative } from '../lib/format';
import { PageHeader } from '../components/Layout';
import {
  PRIORITY_LABELS,
  PriorityBadge,
  SlaBadge,
  STATUS_LABELS,
  StatusBadge,
  TagChip,
} from '../components/Badges';
import { UserCell } from '../components/Avatar';
import { Button } from '../components/Button';
import { Pagination } from '../components/Pagination';
import { SkeletonRows } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import { NewTicketModal } from './NewTicketModal';

const SORTABLE = [
  { key: 'createdAt', label: 'Created' },
  { key: 'updatedAt', label: 'Updated' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'slaDeadline', label: 'SLA due' },
] as const;

/**
 * Filter state lives in the URL, so a filtered queue is shareable and survives
 * a reload. Every parameter is passed straight to the API — nothing is
 * filtered or sorted in the browser.
 */
export default function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const { hasRole } = useAuth();
  const [creating, setCreating] = useState(false);

  const filters = useMemo(
    () => ({
      page: Number(params.get('page') ?? '1'),
      pageSize: Number(params.get('pageSize') ?? '20'),
      status: params.get('status') ?? undefined,
      priority: params.get('priority') ?? undefined,
      assigneeId: params.get('assigneeId') ?? undefined,
      tagId: params.get('tagId') ?? undefined,
      q: params.get('q') ?? undefined,
      slaBreached: params.get('slaBreached') ?? undefined,
      sort: params.get('sort') ?? 'createdAt',
      order: params.get('order') ?? 'desc',
    }),
    [params],
  );

  const tickets = useTickets(filters);
  const agents = useUsers();
  const tags = useTags();

  const agentOptions = (agents.data?.data ?? []).filter((user) => user.role !== 'CUSTOMER');
  const activeFilterCount = [
    'status',
    'priority',
    'assigneeId',
    'tagId',
    'q',
    'slaBreached',
  ].filter((key) => params.get(key)).length;

  function update(next: Record<string, string | undefined>, resetPage = true) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (!value) merged.delete(key);
      else merged.set(key, value);
    }
    if (resetPage) merged.delete('page');
    setParams(merged, { replace: true });
  }

  function toggleSort(key: string) {
    const isCurrent = filters.sort === key;
    update({ sort: key, order: isCurrent && filters.order === 'desc' ? 'asc' : 'desc' }, false);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Tickets"
        description="Everything in your organization's queue, filtered and paginated by the API."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New ticket
          </Button>
        }
      />

      {/* ------------------------------------------------------- filters -- */}
      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-[16rem] flex-1">
            <label className="field-label" htmlFor="ticket-search">
              Search
            </label>
            <input
              id="ticket-search"
              className="field"
              placeholder="Search titles and descriptions…"
              defaultValue={filters.q ?? ''}
              onKeyDown={(event) => {
                if (event.key === 'Enter')
                  update({ q: event.currentTarget.value.trim() || undefined });
              }}
              onBlur={(event) => update({ q: event.currentTarget.value.trim() || undefined })}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="filter-status">
              Status
            </label>
            <select
              id="filter-status"
              className="field w-44"
              value={filters.status ?? ''}
              onChange={(event) => update({ status: event.target.value || undefined })}
            >
              <option value="">All statuses</option>
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="filter-priority">
              Priority
            </label>
            <select
              id="filter-priority"
              className="field w-36"
              value={filters.priority ?? ''}
              onChange={(event) => update({ priority: event.target.value || undefined })}
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </div>

          {hasRole('ADMIN', 'AGENT') ? (
            <div>
              <label className="field-label" htmlFor="filter-assignee">
                Assignee
              </label>
              <select
                id="filter-assignee"
                className="field w-44"
                value={filters.assigneeId ?? ''}
                onChange={(event) => update({ assigneeId: event.target.value || undefined })}
              >
                <option value="">Anyone</option>
                <option value="unassigned">Unassigned</option>
                {agentOptions.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="field-label" htmlFor="filter-tag">
              Tag
            </label>
            <select
              id="filter-tag"
              className="field w-36"
              value={filters.tagId ?? ''}
              onChange={(event) => update({ tagId: event.target.value || undefined })}
            >
              <option value="">All tags</option>
              {(tags.data ?? []).map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="filter-sla">
              SLA
            </label>
            <select
              id="filter-sla"
              className="field w-32"
              value={filters.slaBreached ?? ''}
              onChange={(event) => update({ slaBreached: event.target.value || undefined })}
            >
              <option value="">Any</option>
              <option value="true">Breached</option>
              <option value="false">Within SLA</option>
            </select>
          </div>

          {activeFilterCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
              Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </Button>
          ) : null}
        </div>
      </div>

      {/* --------------------------------------------------------- table -- */}
      <div className="card overflow-hidden">
        <div className="max-h-[calc(100vh-19rem)] overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="table-head w-20">#</th>
                <th className="table-head">Subject</th>
                <th className="table-head w-40">
                  <SortButton
                    column="status"
                    filters={filters}
                    onSort={toggleSort}
                    label="Status"
                  />
                </th>
                <th className="table-head w-28">
                  <SortButton
                    column="priority"
                    filters={filters}
                    onSort={toggleSort}
                    label="Priority"
                  />
                </th>
                <th className="table-head w-44">Assignee</th>
                <th className="table-head w-40">SLA</th>
                <th className="table-head w-32">
                  <SortButton
                    column="createdAt"
                    filters={filters}
                    onSort={toggleSort}
                    label="Created"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {tickets.isLoading ? (
                <SkeletonRows cols={7} />
              ) : tickets.isError ? (
                <tr>
                  <td colSpan={7}>
                    <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} />
                  </td>
                </tr>
              ) : (tickets.data?.data.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="No tickets match these filters"
                      description="Try widening the search, or clear the filters to see the whole queue."
                      action={
                        activeFilterCount > 0 ? (
                          <Button onClick={() => setParams({}, { replace: true })}>
                            Clear filters
                          </Button>
                        ) : (
                          <Button variant="primary" onClick={() => setCreating(true)}>
                            Create the first ticket
                          </Button>
                        )
                      }
                    />
                  </td>
                </tr>
              ) : (
                tickets.data?.data.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
              )}
            </tbody>
          </table>
        </div>

        {tickets.data ? (
          <Pagination
            meta={tickets.data.meta}
            label="tickets"
            onPageChange={(page) => update({ page: String(page) }, false)}
          />
        ) : null}
      </div>

      <NewTicketModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function SortButton({
  column,
  label,
  filters,
  onSort,
}: {
  column: string;
  label: string;
  filters: { sort: string; order: string };
  onSort: (key: string) => void;
}) {
  const active = filters.sort === column;
  const known = SORTABLE.some((entry) => entry.key === column);
  if (!known) return <>{label}</>;

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink-800"
    >
      {label}
      <span className={active ? 'text-accent-600' : 'text-ink-300'}>
        {active && filters.order === 'asc' ? '▲' : '▼'}
      </span>
    </button>
  );
}

function TicketRow({ ticket }: { ticket: TicketDto }) {
  return (
    <tr className="group border-b border-ink-100 transition last:border-0 hover:bg-accent-50/40">
      <td className="px-4 py-2.5 align-middle">
        <Link
          to={`/tickets/${ticket.id}`}
          className="font-mono text-xs font-medium text-ink-400 group-hover:text-accent-700"
        >
          #{ticket.number}
        </Link>
      </td>
      <td className="max-w-0 px-4 py-2.5 align-middle">
        <Link to={`/tickets/${ticket.id}`} className="block">
          <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-accent-800">
            {ticket.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate text-xs text-ink-500">
              {ticket.customer?.name ?? 'Unknown customer'}
            </span>
            {ticket.commentCount > 0 ? (
              <span className="text-xs text-ink-400">· {ticket.commentCount} replies</span>
            ) : null}
            {ticket.tags.slice(0, 2).map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
            {ticket.tags.length > 2 ? (
              <span className="text-[11px] text-ink-400">+{ticket.tags.length - 2}</span>
            ) : null}
          </span>
        </Link>
      </td>
      <td className="px-4 py-2.5 align-middle">
        <StatusBadge status={ticket.status} />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <PriorityBadge priority={ticket.priority} />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <UserCell user={ticket.assignee} />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <SlaBadge
          slaBreached={ticket.slaBreached}
          slaDeadline={ticket.slaDeadline}
          firstResponseAt={ticket.firstResponseAt}
          status={ticket.status}
          compact
        />
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 align-middle text-xs text-ink-500">
        {formatRelative(ticket.createdAt)}
      </td>
    </tr>
  );
}
