import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent-600 text-white shadow-sm hover:bg-accent-700 focus-visible:outline-accent-600 disabled:bg-accent-300',
  secondary:
    'border border-ink-200 bg-white text-ink-800 shadow-sm hover:bg-ink-50 focus-visible:outline-ink-400 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-ink-400',
  danger:
    'border border-rose-200 bg-white text-rose-700 shadow-sm hover:bg-rose-50 focus-visible:outline-rose-500',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled === true || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center rounded-lg font-medium transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-70',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : icon}
      {children}
    </button>
  );
}
