import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db/prisma.js';
import { runSlaSweep } from '../../src/jobs/sla.js';
import { app, makeTicket, resetDatabase, seedOrg, type SeededOrg } from '../helpers/fixtures.js';

let org: SeededOrg;

const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

beforeAll(async () => {
  await resetDatabase();
  org = await seedOrg('sla');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('first response stops the clock', () => {
  it('records firstResponseAt and the responder on the first public agent reply', async () => {
    const ticket = await makeTicket(org, { priority: 'URGENT', createdAt: hoursAgo(0.2) });

    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'On it.' })
      .expect(201);

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after?.firstResponseAt).toBeInstanceOf(Date);
    expect(after?.firstResponderId).toBe(org.agent.id);
    expect(after?.slaBreached).toBe(false);
  });

  it('does not let a customer’s own reply stop the clock', async () => {
    const ticket = await makeTicket(org, { priority: 'URGENT', createdAt: hoursAgo(0.2) });

    await org.customer
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'Any update?' })
      .expect(201);

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after?.firstResponseAt).toBeNull();
  });

  it('does not let an internal note stop the clock', async () => {
    const ticket = await makeTicket(org, { priority: 'URGENT', createdAt: hoursAgo(0.2) });

    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'Assigning to platform.', isInternal: true })
      .expect(201);

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after?.firstResponseAt).toBeNull();
  });

  it('keeps the first response fixed when more replies arrive', async () => {
    const ticket = await makeTicket(org, { priority: 'LOW' });

    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'first' })
      .expect(201);
    const first = await prisma.ticket.findUnique({ where: { id: ticket.id } });

    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'second' })
      .expect(201);
    const second = await prisma.ticket.findUnique({ where: { id: ticket.id } });

    expect(second?.firstResponseAt?.getTime()).toBe(first?.firstResponseAt?.getTime());
  });

  it('marks a late first response as a breach', async () => {
    // URGENT has a 1h window; this ticket is already 5h old.
    const ticket = await makeTicket(org, { priority: 'URGENT', createdAt: hoursAgo(5) });

    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'Sorry for the delay.' })
      .expect(201);

    const after = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(after?.slaBreached).toBe(true);
    expect(after?.slaBreachedAt).toBeInstanceOf(Date);
  });
});

describe('background sweep', () => {
  it('flags only tickets past their deadline with no response', async () => {
    await prisma.ticket.deleteMany({ where: { orgId: org.id } });

    // slaBreached: false stages the pre-sweep state — these two crossed their
    // deadline while sitting in the queue and nothing has flagged them yet.
    const breachedUrgent = await makeTicket(org, {
      priority: 'URGENT',
      createdAt: hoursAgo(3),
      slaBreached: false,
    });
    const breachedHigh = await makeTicket(org, {
      priority: 'HIGH',
      createdAt: hoursAgo(9),
      slaBreached: false,
    });
    const withinUrgent = await makeTicket(org, { priority: 'URGENT', createdAt: hoursAgo(0.25) });
    const withinLow = await makeTicket(org, { priority: 'LOW', createdAt: hoursAgo(30) });
    const answered = await makeTicket(org, {
      priority: 'URGENT',
      createdAt: hoursAgo(6),
      firstResponseAt: hoursAgo(5.8),
    });

    const result = await runSlaSweep();
    expect(result.breached).toBe(2);

    const flags = Object.fromEntries(
      (
        await prisma.ticket.findMany({
          where: { orgId: org.id },
          select: { id: true, slaBreached: true },
        })
      ).map((row) => [row.id, row.slaBreached]),
    );

    expect(flags[breachedUrgent.id]).toBe(true);
    expect(flags[breachedHigh.id]).toBe(true);
    expect(flags[withinUrgent.id]).toBe(false);
    expect(flags[withinLow.id]).toBe(false);
    expect(flags[answered.id]).toBe(false);
  });

  it('is idempotent — a second sweep changes nothing', async () => {
    const second = await runSlaSweep();
    expect(second.breached).toBe(0);
  });

  it('writes a SLA_BREACHED audit row per breach, attributed to the system', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { orgId: org.id, action: 'SLA_BREACHED' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.actorId === null)).toBe(true);
  });

  it('ignores tickets that are already closed', async () => {
    const closed = await makeTicket(org, {
      priority: 'URGENT',
      createdAt: hoursAgo(10),
      status: 'CLOSED',
      slaBreached: false,
    });

    await runSlaSweep();
    const after = await prisma.ticket.findUnique({ where: { id: closed.id } });
    expect(after?.slaBreached).toBe(false);
  });

  it('surfaces breached tickets through the list filter', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ slaBreached: 'true' })
      .expect(200);

    expect(response.body.meta.total).toBe(2);
    expect((response.body.data as { slaBreached: boolean }[]).every((t) => t.slaBreached)).toBe(
      true,
    );
  });
});
