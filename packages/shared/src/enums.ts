/**
 * Domain enums. These mirror the Prisma enums 1:1 and are the single source of
 * truth shared by the API and the web client.
 */

export const ROLES = ['ADMIN', 'AGENT', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_CUSTOMER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const AUDIT_ACTIONS = [
  'ORG_CREATED',
  'USER_SIGNED_UP',
  'USER_UPDATED',
  'USER_LOGGED_IN',
  'USER_LOGGED_OUT',
  'INVITE_CREATED',
  'INVITE_REVOKED',
  'INVITE_ACCEPTED',
  'TICKET_CREATED',
  'TICKET_UPDATED',
  'TICKET_STATUS_CHANGED',
  'TICKET_ASSIGNED',
  'TICKET_DELETED',
  'COMMENT_CREATED',
  'TAG_CREATED',
  'TAG_DELETED',
  'ATTACHMENT_ADDED',
  'SLA_BREACHED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Statuses that count as "the ticket is done" for analytics + SLA purposes. */
export const TERMINAL_STATUSES: readonly TicketStatus[] = ['RESOLVED', 'CLOSED'];

/** Statuses in which an unanswered ticket can still breach its SLA. */
export const SLA_ACTIVE_STATUSES: readonly TicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_CUSTOMER',
  'REOPENED',
];
