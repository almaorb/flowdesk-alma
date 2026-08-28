import clsx from 'clsx';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className ?? 'h-4 w-4',
      )}
    />
  );
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-ink-400">
      <Spinner className="h-6 w-6" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}

/** Skeleton row used while a table page loads. */
export function SkeletonRows({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-ink-100">
          {Array.from({ length: cols }).map((__, colIndex) => (
            <td key={colIndex} className="px-4 py-3">
              <div className="h-3 w-full max-w-[12rem] animate-pulse-soft rounded bg-ink-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
