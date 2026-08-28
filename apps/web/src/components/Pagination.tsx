import type { Paginated } from '@flowdesk/shared';
import { Button } from './Button';

export function Pagination({
  meta,
  onPageChange,
  label = 'results',
}: {
  meta: Paginated<unknown>['meta'];
  onPageChange: (page: number) => void;
  label?: string;
}) {
  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.total, meta.page * meta.pageSize);

  return (
    <div className="flex items-center justify-between gap-4 border-t border-ink-200 px-4 py-3">
      <p className="text-xs text-ink-500">
        {meta.total === 0 ? (
          <>No {label}</>
        ) : (
          <>
            <span className="font-semibold text-ink-700">
              {first}–{last}
            </span>{' '}
            of <span className="font-semibold text-ink-700">{meta.total.toLocaleString()}</span> {label}
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-500">
          Page {meta.page} / {meta.totalPages}
        </span>
        <Button size="sm" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={!meta.hasNextPage} onClick={() => onPageChange(meta.page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
