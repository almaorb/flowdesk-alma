import clsx from 'clsx';
import type { Priority, Role, TagDto, TicketStatus } from '@flowdesk/shared';
import { SLA_RESPONSE_LABEL } from '@flowdesk/shared';
import { formatDuration } from '../lib/format';

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  IN_PROGRESS: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  WAITING_ON_CUSTOMER: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CLOSED: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  REOPENED: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20',
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  WAITING_ON_CUSTOMER: 'Waiting on customer',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLES: Record<Priority, { dot: string; text: string }> = {
  LOW: { dot: 'bg-ink-300', text: 'text-ink-500' },
  MEDIUM: { dot: 'bg-sky-500', text: 'text-ink-700' },
  HIGH: { dot: 'bg-amber-500', text: 'text-amber-800' },
  URGENT: { dot: 'bg-rose-600', text: 'text-rose-700' },
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const style = PRIORITY_STYLES[priority];
  return (
    <span
      className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold', style.text)}
      title={`First response target: ${SLA_RESPONSE_LABEL[priority]}`}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', style.dot)} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const ROLE_STYLES: Record<Role, string> = {
  ADMIN: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  AGENT: 'bg-teal-50 text-teal-700 ring-teal-600/20',
  CUSTOMER: 'bg-ink-100 text-ink-600 ring-ink-500/20',
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
        ROLE_STYLES[role],
      )}
    >
      {role}
    </span>
  );
}

export function TagChip({ tag, onRemove }: { tag: TagDto; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: `${tag.color}40`, color: tag.color, backgroundColor: `${tag.color}12` }}
    >
      {tag.name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 rounded-full px-0.5 leading-none opacity-60 hover:opacity-100"
          aria-label={`Remove ${tag.name}`}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

/**
 * SLA indicator: red once breached, amber inside the last quarter of the
 * window, and quiet once an agent has actually responded.
 */
export function SlaBadge({
  slaBreached,
  slaDeadline,
  firstResponseAt,
  status,
  compact = false,
}: {
  slaBreached: boolean;
  slaDeadline: string;
  firstResponseAt: string | null;
  status?: TicketStatus;
  compact?: boolean;
}) {
  const remaining = new Date(slaDeadline).getTime() - Date.now();
  const settled = status === 'RESOLVED' || status === 'CLOSED';

  if (slaBreached) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/25">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
        SLA breached
      </span>
    );
  }

  if (firstResponseAt) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {compact ? 'Answered' : 'Responded in time'}
      </span>
    );
  }

  if (settled) {
    return <span className="text-[11px] text-ink-400">Closed without a reply</span>;
  }

  const urgent = remaining < 60 * 60 * 1000;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium',
        urgent ? 'text-amber-700' : 'text-ink-500',
      )}
      title={`First response due ${new Date(slaDeadline).toLocaleString()}`}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', urgent ? 'bg-amber-500' : 'bg-ink-300')} />
      {formatDuration(remaining)} left
    </span>
  );
}
