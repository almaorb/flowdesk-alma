import clsx from 'clsx';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

function Wrapper({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Wrapper label={label} error={error} hint={hint} htmlFor={id}>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        className={clsx('field', error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20', className)}
      />
    </Wrapper>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Wrapper label={label} error={error} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        className={clsx('field resize-y', error && 'border-rose-400', className)}
      />
    </Wrapper>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Wrapper label={label} error={error} hint={hint} htmlFor={id}>
      <select id={id} {...rest} className={clsx('field pr-8', className)}>
        {children}
      </select>
    </Wrapper>
  );
}
