import type { Role, TicketStatus } from './enums.js';

/**
 * Ticket lifecycle.
 *
 * Happy path: OPEN -> IN_PROGRESS -> WAITING_ON_CUSTOMER -> RESOLVED -> CLOSED.
 * REOPENED is reachable only from RESOLVED/CLOSED and only for an ADMIN or the
 * ticket's own customer. Back-edges (e.g. WAITING_ON_CUSTOMER -> IN_PROGRESS)
 * exist because real queues need them; every edge below is deliberate and every
 * edge *not* below is a 409 INVALID_TRANSITION.
 */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'CLOSED'],
  IN_PROGRESS: ['WAITING_ON_CUSTOMER', 'RESOLVED', 'OPEN', 'CLOSED'],
  WAITING_ON_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'],
};

/** Statuses a CUSTOMER may ever move a ticket to (on their own tickets). */
const CUSTOMER_ALLOWED_TARGETS: readonly TicketStatus[] = ['REOPENED', 'CLOSED'];

export type TransitionDenial =
  | { ok: false; code: 'INVALID_TRANSITION'; status: 409; message: string }
  | { ok: false; code: 'FORBIDDEN_TRANSITION'; status: 403; message: string };

export type TransitionResult = { ok: true } | TransitionDenial;

export interface TransitionActor {
  id: string;
  role: Role;
}

export interface TransitionTicket {
  status: TicketStatus;
  customerId: string;
  assigneeId: string | null;
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: TicketStatus): readonly TicketStatus[] {
  return TICKET_TRANSITIONS[from];
}

/**
 * Full guard: graph edge first (409 when the edge does not exist), then
 * role/ownership rules (403 when the actor is not entitled to a legal edge).
 */
export function checkTransition(
  ticket: TransitionTicket,
  to: TicketStatus,
  actor: TransitionActor,
): TransitionResult {
  const from = ticket.status;

  if (from === to) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      status: 409,
      message: `Ticket is already ${from}.`,
    };
  }

  if (!canTransition(from, to)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      status: 409,
      message: `Cannot move a ticket from ${from} to ${to}. Allowed: ${
        TICKET_TRANSITIONS[from].join(', ') || 'none'
      }.`,
    };
  }

  if (to === 'REOPENED') {
    const isOwner = ticket.customerId === actor.id;
    if (actor.role !== 'ADMIN' && !isOwner) {
      return {
        ok: false,
        code: 'FORBIDDEN_TRANSITION',
        status: 403,
        message: 'Only an admin or the ticket customer may reopen a ticket.',
      };
    }
    return { ok: true };
  }

  if (actor.role === 'CUSTOMER') {
    if (ticket.customerId !== actor.id) {
      return {
        ok: false,
        code: 'FORBIDDEN_TRANSITION',
        status: 403,
        message: 'Customers may only change the status of their own tickets.',
      };
    }
    if (!CUSTOMER_ALLOWED_TARGETS.includes(to)) {
      return {
        ok: false,
        code: 'FORBIDDEN_TRANSITION',
        status: 403,
        message: `Customers may only move a ticket to ${CUSTOMER_ALLOWED_TARGETS.join(' or ')}.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Transitions an actor could pick in the UI. Used to render the status
 * dropdown, so the client never offers an option the API would reject.
 */
export function transitionsFor(
  ticket: TransitionTicket,
  actor: TransitionActor,
): readonly TicketStatus[] {
  return TICKET_TRANSITIONS[ticket.status].filter((to) => checkTransition(ticket, to, actor).ok);
}
