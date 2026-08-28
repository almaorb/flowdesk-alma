const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return DATE_TIME.format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return DATE_ONLY.format(new Date(iso));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/** "3 hours ago" / "in 12 minutes". */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const delta = new Date(iso).getTime() - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms) return RELATIVE.format(Math.round(delta / ms), unit);
  }
  return 'just now';
}

/** Compact duration for SLA countdowns: "4h 12m", "2d 3h", "18m". */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60_000) % 60;
  const hours = Math.floor(abs / 3_600_000) % 24;
  const days = Math.floor(abs / 86_400_000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 60) return `${Math.round(value)}m`;
  return formatDuration(value * 60_000);
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Stable pastel avatar colour derived from the user id. */
export function avatarTone(seed: string): string {
  const tones = [
    'bg-rose-100 text-rose-700',
    'bg-amber-100 text-amber-700',
    'bg-emerald-100 text-emerald-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-teal-100 text-teal-700',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return tones[hash % tones.length] as string;
}
