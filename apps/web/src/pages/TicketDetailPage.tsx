import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PRIORITIES, transitionsFor } from '@flowdesk/shared';
import type { CommentDto, Priority, TicketStatus } from '@flowdesk/shared';
import { useAuth } from '../auth/AuthContext';
import {
  useCreateComment,
  useDeleteTicket,
  useTags,
  useTicket,
  useTransitionTicket,
  useUpdateTicket,
  useUsers,
} from '../hooks/queries';
import { formatDateTime, formatRelative } from '../lib/format';
import { Avatar } from '../components/Avatar';
import {
  PRIORITY_LABELS,
  PriorityBadge,
  SlaBadge,
  STATUS_LABELS,
  StatusBadge,
  TagChip,
} from '../components/Badges';
import { Button } from '../components/Button';
import { FullPageSpinner } from '../components/Spinner';
import { ErrorState, InlineError } from '../components/States';

export default function TicketDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();

  const ticketQuery = useTicket(id);
  const users = useUsers();
  const tags = useTags();

  const update = useUpdateTicket(id);
  const transition = useTransitionTicket(id);
  const comment = useCreateComment(id);
  const remove = useDeleteTicket();

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const ticket = ticketQuery.data;
  const isStaff = hasRole('ADMIN', 'AGENT');

  const available = useMemo<readonly TicketStatus[]>(() => {
    if (!ticket || !user) return [];
    return transitionsFor(
      {
        status: ticket.status,
        customerId: ticket.customer?.id ?? '',
        assigneeId: ticket.assignee?.id ?? null,
      },
      { id: user.id, role: user.role },
    );
  }, [ticket, user]);

  if (ticketQuery.isLoading) return <FullPageSpinner label="Loading ticket…" />;
  if (ticketQuery.isError || !ticket) {
    return <ErrorState error={ticketQuery.error} onRetry={() => void ticketQuery.refetch()} />;
  }

  const staff = (users.data?.data ?? []).filter((person) => person.role !== 'CUSTOMER');

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody('');
    try {
      await comment.mutateAsync({ body: text, isInternal: internal });
    } catch {
      setBody(text); // restore the draft so nothing is lost
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link to="/tickets" className="text-ink-500 hover:text-ink-800">
          Tickets
        </Link>
        <span className="text-ink-300">/</span>
        <span className="font-mono text-ink-400">#{ticket.number}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ------------------------------------------------------ thread -- */}
        <div className="min-w-0">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    update.mutate({ title: titleDraft });
                    setEditingTitle(false);
                  }}
                >
                  <input
                    className="field text-lg font-semibold"
                    value={titleDraft}
                    autoFocus
                    onChange={(event) => setTitleDraft(event.target.value)}
                  />
                  <Button type="submit" variant="primary" size="sm">
                    Save
                  </Button>
                  <Button size="sm" onClick={() => setEditingTitle(false)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <h1
                  className="text-xl font-semibold leading-snug tracking-tight text-ink-900"
                  onDoubleClick={() => {
                    if (!isStaff) return;
                    setTitleDraft(ticket.title);
                    setEditingTitle(true);
                  }}
                  title={isStaff ? 'Double-click to rename' : undefined}
                >
                  {ticket.title}
                </h1>
              )}
              <p className="mt-1.5 text-sm text-ink-500">
                Opened by <span className="font-medium text-ink-700">{ticket.customer?.name}</span>{' '}
                {formatRelative(ticket.createdAt)} · last activity{' '}
                {formatRelative(ticket.updatedAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={ticket.status} />
            </div>
          </div>

          <article className="card p-4">
            <header className="mb-3 flex items-center gap-2.5">
              {ticket.customer ? (
                <Avatar name={ticket.customer.name} id={ticket.customer.id} />
              ) : null}
              <div>
                <p className="text-sm font-medium text-ink-900">{ticket.customer?.name}</p>
                <p className="text-xs text-ink-400">{formatDateTime(ticket.createdAt)}</p>
              </div>
            </header>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">
              {ticket.description}
            </p>
          </article>

          {ticket.attachments.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {ticket.attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-600"
                  title={`${attachment.contentType} · ${(attachment.sizeBytes / 1024).toFixed(0)} KB`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-ink-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      d="M21 12.8l-8.2 8.2a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 114.7 4.7l-8.5 8.5a1.7 1.7 0 11-2.3-2.3l7.8-7.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  {attachment.filename}
                </span>
              ))}
            </div>
          ) : null}

          <ol className="mt-5 space-y-3">
            {ticket.comments.map((entry) => (
              <CommentCard key={entry.id} comment={entry} />
            ))}
          </ol>

          <form className="card mt-5 p-3" onSubmit={(event) => void submitComment(event)}>
            <textarea
              className="field min-h-[6rem] resize-y border-0 shadow-none focus:ring-0"
              placeholder={
                internal ? 'Internal note — customers will not see this…' : 'Write a reply…'
              }
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  void submitComment(event as unknown as FormEvent);
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-ink-100 pt-2.5">
              {isStaff ? (
                <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-ink-600">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-ink-300 text-accent-600 focus:ring-accent-500"
                    checked={internal}
                    onChange={(event) => setInternal(event.target.checked)}
                  />
                  Internal note
                </label>
              ) : (
                <span className="text-xs text-ink-400">⌘↵ to send</span>
              )}
              <Button type="submit" variant="primary" size="sm" disabled={body.trim().length === 0}>
                {internal ? 'Add note' : 'Reply'}
              </Button>
            </div>
            <InlineError error={comment.error} />
          </form>
        </div>

        {/* ---------------------------------------------------- sidebar -- */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Service level
            </h2>
            <SlaBadge
              slaBreached={ticket.slaBreached}
              slaDeadline={ticket.slaDeadline}
              firstResponseAt={ticket.firstResponseAt}
              status={ticket.status}
            />
            <dl className="mt-3 space-y-1.5 text-xs">
              <Row label="Response due" value={formatDateTime(ticket.slaDeadline)} />
              <Row
                label="First response"
                value={
                  ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : 'Awaiting agent'
                }
              />
              {ticket.resolvedAt ? (
                <Row label="Resolved" value={formatDateTime(ticket.resolvedAt)} />
              ) : null}
              {ticket.closedAt ? (
                <Row label="Closed" value={formatDateTime(ticket.closedAt)} />
              ) : null}
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Status
            </h2>
            {available.length === 0 ? (
              <p className="text-sm text-ink-500">No transitions available to you.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {available.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    loading={transition.isPending && transition.variables?.status === status}
                    onClick={() => transition.mutate({ status })}
                  >
                    {STATUS_LABELS[status]}
                  </Button>
                ))}
              </div>
            )}
            <InlineError error={transition.error} />
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Details
            </h2>
            <div className="space-y-3">
              <div>
                <span className="field-label">Priority</span>
                {isStaff ? (
                  <select
                    className="field"
                    value={ticket.priority}
                    onChange={(event) =>
                      update.mutate({ priority: event.target.value as Priority })
                    }
                  >
                    {PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {PRIORITY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <PriorityBadge priority={ticket.priority} />
                )}
              </div>

              <div>
                <span className="field-label">Assignee</span>
                {isStaff ? (
                  <select
                    className="field"
                    value={ticket.assignee?.id ?? ''}
                    onChange={(event) => update.mutate({ assigneeId: event.target.value || null })}
                  >
                    <option value="">Unassigned</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-ink-700">{ticket.assignee?.name ?? 'Unassigned'}</p>
                )}
              </div>

              <div>
                <span className="field-label">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {ticket.tags.length === 0 ? (
                    <span className="text-sm text-ink-400">None</span>
                  ) : null}
                  {ticket.tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      {...(isStaff
                        ? {
                            onRemove: () =>
                              update.mutate({
                                tagIds: ticket.tags.filter((t) => t.id !== tag.id).map((t) => t.id),
                              }),
                          }
                        : {})}
                    />
                  ))}
                </div>
                {isStaff ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(tags.data ?? [])
                      .filter((tag) => !ticket.tags.some((existing) => existing.id === tag.id))
                      .map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          className="opacity-40 transition hover:opacity-100"
                          onClick={() =>
                            update.mutate({ tagIds: [...ticket.tags.map((t) => t.id), tag.id] })
                          }
                        >
                          <TagChip tag={tag} />
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>

              <dl className="space-y-1.5 border-t border-ink-100 pt-3 text-xs">
                <Row label="Customer" value={ticket.customer?.name ?? '—'} />
                <Row label="Created" value={formatDateTime(ticket.createdAt)} />
                <Row label="Updated" value={formatDateTime(ticket.updatedAt)} />
              </dl>
            </div>
            <InlineError error={update.error} />
          </section>

          {hasRole('ADMIN') ? (
            <Button
              variant="danger"
              className="w-full"
              loading={remove.isPending}
              onClick={() => {
                if (!window.confirm(`Delete ticket #${ticket.number}? This cannot be undone.`))
                  return;
                remove.mutate(ticket.id, { onSuccess: () => navigate('/tickets') });
              }}
            >
              Delete ticket
            </Button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-400">{label}</dt>
      <dd className="truncate text-right font-medium text-ink-700">{value}</dd>
    </div>
  );
}

function CommentCard({ comment }: { comment: CommentDto }) {
  const pending = comment.id.startsWith('optimistic-');
  return (
    <li
      className={`card animate-fade-in p-4 ${comment.isInternal ? 'border-amber-200 bg-amber-50/60' : ''} ${
        pending ? 'opacity-60' : ''
      }`}
    >
      <header className="mb-2 flex items-center gap-2.5">
        {comment.author ? (
          <Avatar name={comment.author.name} id={comment.author.id} size="sm" />
        ) : null}
        <p className="text-sm font-medium text-ink-900">{comment.author?.name ?? 'Removed user'}</p>
        {comment.isInternal ? (
          <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
            Internal
          </span>
        ) : null}
        <span className="ml-auto text-xs text-ink-400">
          {pending ? 'Sending…' : formatRelative(comment.createdAt)}
        </span>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">
        {comment.body}
      </p>
    </li>
  );
}
