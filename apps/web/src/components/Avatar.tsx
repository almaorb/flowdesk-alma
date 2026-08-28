import clsx from 'clsx';
import { avatarTone, initials } from '../lib/format';

export function Avatar({
  name,
  id,
  size = 'md',
  className,
}: {
  name: string;
  id: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
        avatarTone(id),
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function UserCell({
  user,
  fallback = 'Unassigned',
}: {
  user: { id: string; name: string } | null;
  fallback?: string;
}) {
  if (!user) return <span className="text-sm text-ink-400">{fallback}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={user.name} id={user.id} size="sm" />
      <span className="truncate text-sm text-ink-700">{user.name}</span>
    </span>
  );
}
