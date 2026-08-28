import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { Button } from './Button';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong.';
  const code = error instanceof ApiError ? error.code : null;

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-semibold text-rose-700">{message}</p>
      {code ? <p className="font-mono text-xs text-ink-400">{code}</p> : null}
      {onRetry ? (
        <Button className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
  return (
    <p
      role="alert"
      className="animate-fade-in rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      {message}
    </p>
  );
}
