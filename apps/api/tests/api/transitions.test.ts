import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db/prisma.js';
import { app, makeTicket, resetDatabase, seedOrg, type SeededOrg } from '../helpers/fixtures.js';

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedOrg('flow');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('legal transitions', () => {
  it('walks OPEN -> IN_PROGRESS -> WAITING_ON_CUSTOMER -> RESOLVED -> CLOSED', async () => {
    const ticket = await makeTicket(org, { status: 'OPEN' });
    const path = ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;

    for (const status of path) {
      const response = await org.agent
        .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
        .send({ status })
        .expect(200);
      expect(response.body.status).toBe(status);
    }

    const final = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(final?.resolvedAt).toBeInstanceOf(Date);
    expect(final?.closedAt).toBeInstanceOf(Date);
  });

  it('writes an audit row for every transition', async () => {
    const ticket = await makeTicket(org, { status: 'OPEN' });
    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ticket.id, action: 'TICKET_STATUS_CHANGED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(org.agent.id);
    expect(audit?.metadata).toMatchObject({ from: 'OPEN', to: 'IN_PROGRESS' });
  });

  it('attaches an optional note as a comment on the ticket', async () => {
    const ticket = await makeTicket(org, { status: 'OPEN' });
    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'IN_PROGRESS', note: 'Picking this up now.' })
      .expect(200);

    const comments = await prisma.comment.findMany({ where: { ticketId: ticket.id } });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe('Picking this up now.');
  });

  it('clears resolution timestamps when a ticket is reopened', async () => {
    const ticket = await makeTicket(org, { status: 'RESOLVED' });
    await prisma.ticket.update({ where: { id: ticket.id }, data: { resolvedAt: new Date() } });

    await org.admin
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'REOPENED' })
      .expect(200);

    const reopened = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(reopened?.status).toBe('REOPENED');
    expect(reopened?.resolvedAt).toBeNull();
    expect(reopened?.closedAt).toBeNull();
  });
});

describe('illegal transitions return 409', () => {
  it('rejects OPEN -> RESOLVED', async () => {
    const ticket = await makeTicket(org, { status: 'OPEN' });
    const response = await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'RESOLVED' })
      .expect(409);

    expect(response.body.error.code).toBe('INVALID_TRANSITION');
    expect(response.body.error.message).toContain('IN_PROGRESS');
  });

  it('rejects CLOSED -> IN_PROGRESS', async () => {
    const ticket = await makeTicket(org, { status: 'CLOSED' });
    const response = await org.admin
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'IN_PROGRESS' })
      .expect(409);
    expect(response.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects a no-op transition to the current status', async () => {
    const ticket = await makeTicket(org, { status: 'IN_PROGRESS' });
    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'IN_PROGRESS' })
      .expect(409);
  });

  it('leaves the ticket untouched and writes no audit row when refused', async () => {
    const ticket = await makeTicket(org, { status: 'OPEN' });
    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'RESOLVED' })
      .expect(409);

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after?.status).toBe('OPEN');
    expect(
      await prisma.auditLog.count({
        where: { entityId: ticket.id, action: 'TICKET_STATUS_CHANGED' },
      }),
    ).toBe(0);
  });

  it('rejects a status outside the enum with a 400, not a 409', async () => {
    const ticket = await makeTicket(org, { status: 'OPEN' });
    const response = await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'ON_FIRE' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('who may reopen', () => {
  it('allows an admin', async () => {
    const ticket = await makeTicket(org, { status: 'CLOSED' });
    await org.admin
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'REOPENED' })
      .expect(200);
  });

  it('allows the ticket’s own customer', async () => {
    const ticket = await makeTicket(org, { status: 'RESOLVED' });
    await org.customer
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'REOPENED' })
      .expect(200);
  });

  it('forbids an agent with FORBIDDEN_TRANSITION', async () => {
    const ticket = await makeTicket(org, { status: 'CLOSED' });
    const response = await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'REOPENED' })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN_TRANSITION');
  });

  it('hides another customer’s ticket entirely (404 rather than 403)', async () => {
    const ticket = await makeTicket(org, { status: 'CLOSED' });
    await org.otherCustomer
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'REOPENED' })
      .expect(404);
  });
});

describe('customer restrictions', () => {
  it('forbids a customer from starting work on their own ticket', async () => {
    const ticket = await makeTicket(org, { status: 'OPEN' });
    const response = await org.customer
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'IN_PROGRESS' })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN_TRANSITION');
  });

  it('lets a customer close their own ticket', async () => {
    const ticket = await makeTicket(org, { status: 'OPEN' });
    await org.customer
      .auth(request(app).post(`/api/tickets/${ticket.id}/transition`))
      .send({ status: 'CLOSED' })
      .expect(200);
  });
});
