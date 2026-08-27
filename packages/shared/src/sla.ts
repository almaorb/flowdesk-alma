import type { Priority } from './enums.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * First-response SLA per priority. A ticket breaches when no ADMIN/AGENT
 * comment exists on it by `createdAt + SLA_RESPONSE_MS[priority]`.
 */
export const SLA_RESPONSE_MS: Record<Priority, number> = {
  URGENT: 1 * HOUR,
  HIGH: 4 * HOUR,
  MEDIUM: 24 * HOUR,
  LOW: 72 * HOUR,
};

export const SLA_RESPONSE_LABEL: Record<Priority, string> = {
  URGENT: '1h',
  HIGH: '4h',
  MEDIUM: '24h',
  LOW: '72h',
};

export function slaDeadline(createdAt: Date, priority: Priority): Date {
  return new Date(createdAt.getTime() + SLA_RESPONSE_MS[priority]);
}

/**
 * Pure breach predicate, used by both the background job and the seed script so
 * the two can never disagree.
 */
export function isSlaBreached(input: {
  createdAt: Date;
  priority: Priority;
  firstResponseAt: Date | null;
  now?: Date;
}): boolean {
  const deadline = slaDeadline(input.createdAt, input.priority);
  if (input.firstResponseAt) return input.firstResponseAt.getTime() > deadline.getTime();
  return (input.now ?? new Date()).getTime() > deadline.getTime();
}

/** Milliseconds until breach; negative once the deadline has passed. */
export function msUntilBreach(createdAt: Date, priority: Priority, now: Date = new Date()): number {
  return slaDeadline(createdAt, priority).getTime() - now.getTime();
}
