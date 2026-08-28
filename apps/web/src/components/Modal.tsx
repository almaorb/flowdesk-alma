import { useEffect, type ReactNode } from 'react';

/** Minimal accessible dialog — escape to close, click-outside to dismiss. */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 pt-[10vh] backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} animate-fade-in rounded-xl border border-ink-200 bg-white shadow-pop`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink-900">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
