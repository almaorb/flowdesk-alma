import { describe, expect, it } from 'vitest';
import {
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
  allowedTransitions,
  canTransition,
  checkTransition,
  transitionsFor,
} from '../index.js';
import type { TicketStatus, TransitionActor, TransitionTicket } from '../index.js';

const CUSTOMER_ID = 'user_customer';
const OTHER_CUSTOMER_ID = 'user_other_customer';

const admin: TransitionActor = { id: 'user_admin', role: 'ADMIN' };
const agent: TransitionActor = { id: 'user_agent', role: 'AGENT' };
const customer: TransitionActor = { id: CUSTOMER_ID, role: 'CUSTOMER' };
const otherCustomer: TransitionActor = { id: OTHER_CUSTOMER_ID, role: 'CUSTOMER' };

const ticket = (status: TicketStatus): TransitionTicket => ({
  status,
  customerId: CUSTOMER_ID,
  assigneeId: null,
});

describe('transition graph', () => {
  it('models the documented happy path', () => {
    expect(canTransition('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'WAITING_ON_CUSTOMER')).toBe(true);
    expect(canTransition('WAITING_ON_CUSTOMER', 'RESOLVED')).toBe(true);
    expect(canTransition('RESOLVED', 'CLOSED')).toBe(true);
  });

  it('rejects skipping straight from OPEN to RESOLVED', () => {
    expect(canTransition('OPEN', 'RESOLVED')).toBe(false);
  });

  it('never allows a self-transition', () => {
    for (const status of TICKET_STATUSES) {
      expect(TICKET_TRANSITIONS[status]).not.toContain(status);
      const result = checkTransition(ticket(status), status, admin);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('INVALID_TRANSITION');
    }
  });

  it('only exposes REOPENED from RESOLVED and CLOSED', () => {
    const sources = TICKET_STATUSES.filter((s) => allowedTransitions(s).includes('REOPENED'));
    expect([...sources].sort()).toEqual(['CLOSED', 'RESOLVED']);
  });

  it('has no edge that points at a status outside the enum', () => {
    for (const status of TICKET_STATUSES) {
      for (const target of TICKET_TRANSITIONS[status]) {
        expect(TICKET_STATUSES).toContain(target);
      }
    }
  });

  it('leaves every status reachable from OPEN', () => {
    const seen = new Set<TicketStatus>(['OPEN']);
    const queue: TicketStatus[] = ['OPEN'];
    while (queue.length > 0) {
      const current = queue.shift() as TicketStatus;
      for (const next of TICKET_TRANSITIONS[current]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(TICKET_STATUSES.length);
  });
});

describe('checkTransition — invalid edges', () => {
  it('returns a 409 INVALID_TRANSITION for an edge that does not exist', () => {
    const result = checkTransition(ticket('CLOSED'), 'IN_PROGRESS', admin);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_TRANSITION', status: 409 });
  });

  it('reports the allowed targets in the message', () => {
    const result = checkTransition(ticket('OPEN'), 'RESOLVED', agent);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('IN_PROGRESS');
  });
});

describe('checkTransition — REOPENED authorisation', () => {
  it('lets an admin reopen a resolved ticket', () => {
    expect(checkTransition(ticket('RESOLVED'), 'REOPENED', admin).ok).toBe(true);
  });

  it('lets the ticket customer reopen a closed ticket', () => {
    expect(checkTransition(ticket('CLOSED'), 'REOPENED', customer).ok).toBe(true);
  });

  it('forbids an agent from reopening', () => {
    const result = checkTransition(ticket('RESOLVED'), 'REOPENED', agent);
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_TRANSITION', status: 403 });
  });

  it('forbids a different customer from reopening', () => {
    const result = checkTransition(ticket('CLOSED'), 'REOPENED', otherCustomer);
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_TRANSITION', status: 403 });
  });

  it('still 409s when reopening from a status with no REOPENED edge', () => {
    const result = checkTransition(ticket('OPEN'), 'REOPENED', admin);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_TRANSITION', status: 409 });
  });
});

describe('checkTransition — customer restrictions', () => {
  it('forbids a customer from starting work on a ticket', () => {
    const result = checkTransition(ticket('OPEN'), 'IN_PROGRESS', customer);
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_TRANSITION', status: 403 });
  });

  it('forbids a customer from touching a ticket they do not own', () => {
    const result = checkTransition(ticket('OPEN'), 'CLOSED', otherCustomer);
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_TRANSITION', status: 403 });
  });

  it('allows a customer to close their own ticket', () => {
    expect(checkTransition(ticket('OPEN'), 'CLOSED', customer).ok).toBe(true);
  });

  it('lets agents drive the normal queue flow', () => {
    expect(checkTransition(ticket('OPEN'), 'IN_PROGRESS', agent).ok).toBe(true);
    expect(checkTransition(ticket('IN_PROGRESS'), 'RESOLVED', agent).ok).toBe(true);
  });
});

describe('transitionsFor', () => {
  it('never offers an option the guard would reject', () => {
    for (const status of TICKET_STATUSES) {
      for (const actor of [admin, agent, customer, otherCustomer]) {
        for (const target of transitionsFor(ticket(status), actor)) {
          expect(checkTransition(ticket(status), target, actor).ok).toBe(true);
        }
      }
    }
  });

  it('offers a customer nothing but REOPENED on a closed ticket', () => {
    expect(transitionsFor(ticket('CLOSED'), customer)).toEqual(['REOPENED']);
  });

  it('offers a foreign customer nothing at all', () => {
    expect(transitionsFor(ticket('CLOSED'), otherCustomer)).toEqual([]);
  });
});
