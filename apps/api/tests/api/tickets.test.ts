import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db/prisma.js';
import { app, makeTicket, resetDatabase, seedOrg, type SeededOrg } from '../helpers/fixtures.js';

let org: SeededOrg;
let tagId: string;

const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

beforeAll(async () => {
  await resetDatabase();
  org = await seedOrg('queue');

  const tag = await org.admin
    .auth(request(app).post('/api/tags'))
    .send({ name: 'billing', color: '#d97706' })
    .expect(201);
  tagId = tag.body.id as string;

  await makeTicket(org, {
    title: 'Payment gateway timeout',
    priority: 'URGENT',
    status: 'OPEN',
    createdAt: hoursAgo(30),
  });
  await makeTicket(org, {
    title: 'Invoice rounding error',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    createdAt: hoursAgo(20),
    assigneeId: null,
  });
  await makeTicket(org, {
    title: 'Dark mode please',
    priority: 'LOW',
    status: 'CLOSED',
    createdAt: hoursAgo(10),
  });
  await makeTicket(org, {
    title: 'Export is truncated',
    priority: 'MEDIUM',
    status: 'OPEN',
    createdAt: hoursAgo(5),
    assigneeId: org.agent.id,
  });
  for (let i = 0; i < 20; i += 1) {
    await makeTicket(org, {
      title: `Bulk ticket ${i}`,
      priority: 'LOW',
      status: 'RESOLVED',
      createdAt: hoursAgo(40 + i),
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/tickets', () => {
  it('creates a ticket with a per-tenant sequential number and an SLA deadline', async () => {
    const response = await org.customer
      .auth(request(app).post('/api/tickets'))
      .send({
        title: 'My login is broken',
        description: 'It fails after the reset email.',
        priority: 'HIGH',
      })
      .expect(201);

    expect(response.body).toMatchObject({ status: 'OPEN', priority: 'HIGH', slaBreached: false });
    expect(response.body.number).toEqual(expect.any(Number));
    expect(response.body.customer.id).toBe(org.customer.id);

    // HIGH => 4h response target.
    const deadline = new Date(response.body.slaDeadline as string).getTime();
    const created = new Date(response.body.createdAt as string).getTime();
    expect(deadline - created).toBe(4 * 60 * 60 * 1000);
  });

  it('rejects an invalid payload with field-level errors', async () => {
    const response = await org.customer
      .auth(request(app).post('/api/tickets'))
      .send({ title: 'no', description: '', priority: 'CATASTROPHIC' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (response.body.error.fields as { path: string }[]).map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'description', 'priority']));
  });

  it('will not let a customer assign a ticket', async () => {
    await org.customer
      .auth(request(app).post('/api/tickets'))
      .send({ title: 'Assign me', description: 'please', assigneeId: org.agent.id })
      .expect(403);
  });

  it('will not assign a ticket to a customer', async () => {
    const response = await org.admin
      .auth(request(app).post('/api/tickets'))
      .send({ title: 'Bad assignee', description: 'x', assigneeId: org.customer.id })
      .expect(400);
    expect(response.body.error.fields?.[0]?.path).toBe('assigneeId');
  });

  it('forces a customer’s ticket to be filed against themselves', async () => {
    const response = await org.customer
      .auth(request(app).post('/api/tickets'))
      .send({
        title: 'On behalf of someone else',
        description: 'x',
        customerId: org.otherCustomer.id,
      })
      .expect(201);
    expect(response.body.customer.id).toBe(org.customer.id);
  });
});

describe('GET /api/tickets — filtering happens in SQL', () => {
  it('paginates with accurate metadata', async () => {
    const page1 = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ pageSize: 5, page: 1 })
      .expect(200);
    const page2 = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ pageSize: 5, page: 2 })
      .expect(200);

    expect(page1.body.data).toHaveLength(5);
    expect(page1.body.meta).toMatchObject({ page: 1, pageSize: 5, hasNextPage: true });
    expect(page1.body.meta.total).toBe(await prisma.ticket.count({ where: { orgId: org.id } }));

    const ids1 = (page1.body.data as { id: string }[]).map((t) => t.id);
    const ids2 = (page2.body.data as { id: string }[]).map((t) => t.id);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });

  it('filters by a single status and by several at once', async () => {
    const open = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ status: 'OPEN' })
      .expect(200);
    expect((open.body.data as { status: string }[]).every((t) => t.status === 'OPEN')).toBe(true);

    const combined = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ status: 'OPEN,CLOSED' })
      .expect(200);
    const statuses = new Set((combined.body.data as { status: string }[]).map((t) => t.status));
    expect([...statuses].sort()).toEqual(['CLOSED', 'OPEN']);
  });

  it('filters by priority', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ priority: 'URGENT,HIGH' })
      .expect(200);
    expect(
      (response.body.data as { priority: string }[]).every((t) =>
        ['URGENT', 'HIGH'].includes(t.priority),
      ),
    ).toBe(true);
    expect(response.body.meta.total).toBeGreaterThan(0);
  });

  it('filters by assignee, including the "unassigned" bucket', async () => {
    const assigned = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ assigneeId: org.agent.id })
      .expect(200);
    expect(
      (assigned.body.data as { assignee: { id: string } }[]).every(
        (t) => t.assignee.id === org.agent.id,
      ),
    ).toBe(true);

    const unassigned = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ assigneeId: 'unassigned' })
      .expect(200);
    expect(
      (unassigned.body.data as { assignee: unknown }[]).every((t) => t.assignee === null),
    ).toBe(true);
  });

  it('searches title and description case-insensitively', async () => {
    const byTitle = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ q: 'GATEWAY' })
      .expect(200);
    expect(byTitle.body.meta.total).toBe(1);
    expect((byTitle.body.data as { title: string }[])[0]?.title).toBe('Payment gateway timeout');

    const byDescription = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ q: 'detailed description' })
      .expect(200);
    expect(byDescription.body.meta.total).toBeGreaterThan(1);

    const noMatch = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ q: 'zzzz-nothing' })
      .expect(200);
    expect(noMatch.body.meta.total).toBe(0);
    expect(noMatch.body.data).toEqual([]);
  });

  it('filters by tag', async () => {
    const ticket = await makeTicket(org, { title: 'Tagged ticket' });
    await org.admin
      .auth(request(app).patch(`/api/tickets/${ticket.id}`))
      .send({ tagIds: [tagId] })
      .expect(200);

    const response = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ tagId })
      .expect(200);
    expect(response.body.meta.total).toBe(1);
    expect((response.body.data as { id: string }[])[0]?.id).toBe(ticket.id);
  });

  it('sorts by priority using the database enum order', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ sort: 'priority', order: 'desc', pageSize: 100 })
      .expect(200);

    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 } as const;
    const values = (response.body.data as { priority: keyof typeof rank }[]).map(
      (t) => rank[t.priority],
    );
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('sorts by creation date in both directions', async () => {
    const asc = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ sort: 'createdAt', order: 'asc', pageSize: 100 })
      .expect(200);
    const dates = (asc.body.data as { createdAt: string }[]).map((t) => Date.parse(t.createdAt));
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it('rejects an unknown sort column instead of silently ignoring it', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/tickets'))
      .query({ sort: 'password' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('caps pageSize so a caller cannot ask for the whole table', async () => {
    await org.admin.auth(request(app).get('/api/tickets')).query({ pageSize: 5000 }).expect(400);
  });
});

describe('PATCH /api/tickets/:id', () => {
  it('updates fields and records what changed in the audit log', async () => {
    const ticket = await makeTicket(org, { priority: 'LOW' });
    await org.admin
      .auth(request(app).patch(`/api/tickets/${ticket.id}`))
      .send({ priority: 'URGENT', title: 'Escalated' })
      .expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ticket.id, action: 'TICKET_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toMatchObject({ priorityFrom: 'LOW', priorityTo: 'URGENT' });
  });

  it('recomputes the SLA deadline when the priority changes', async () => {
    const createdAt = hoursAgo(3);
    const ticket = await makeTicket(org, { priority: 'MEDIUM', createdAt });

    const response = await org.admin
      .auth(request(app).patch(`/api/tickets/${ticket.id}`))
      .send({ priority: 'URGENT' })
      .expect(200);

    // URGENT is a 1h window and the ticket is 3h old, so it breaches immediately.
    expect(response.body.slaBreached).toBe(true);
    expect(new Date(response.body.slaDeadline as string).getTime()).toBe(
      createdAt.getTime() + 60 * 60 * 1000,
    );
  });

  it('stops a customer from changing priority or assignee', async () => {
    const ticket = await makeTicket(org);
    const response = await org.customer
      .auth(request(app).patch(`/api/tickets/${ticket.id}`))
      .send({ priority: 'URGENT' })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('lets an admin delete a ticket but not an agent', async () => {
    const ticket = await makeTicket(org);
    await org.agent.auth(request(app).delete(`/api/tickets/${ticket.id}`)).expect(403);
    await org.admin.auth(request(app).delete(`/api/tickets/${ticket.id}`)).expect(204);
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
  });
});

describe('comments and attachments', () => {
  it('threads a reply and returns it on the ticket', async () => {
    const ticket = await makeTicket(org);
    const created = await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'Looking into it now.' })
      .expect(201);

    const detail = await org.agent.auth(request(app).get(`/api/tickets/${ticket.id}`)).expect(200);
    expect((detail.body.comments as { id: string }[]).map((c) => c.id)).toContain(created.body.id);
    expect(detail.body.commentCount).toBe(1);
  });

  it('hides internal notes from the customer but shows them to staff', async () => {
    const ticket = await makeTicket(org);
    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'Enterprise account — handle with care.', isInternal: true })
      .expect(201);

    const staffView = await org.agent
      .auth(request(app).get(`/api/tickets/${ticket.id}`))
      .expect(200);
    expect(staffView.body.comments).toHaveLength(1);

    const customerView = await org.customer
      .auth(request(app).get(`/api/tickets/${ticket.id}`))
      .expect(200);
    expect(customerView.body.comments).toHaveLength(0);
    expect(JSON.stringify(customerView.body)).not.toContain('handle with care');
  });

  it('forces a customer’s comment to be public', async () => {
    const ticket = await makeTicket(org);
    const response = await org.customer
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: 'Sneaky internal note', isInternal: true })
      .expect(201);
    expect(response.body.isInternal).toBe(false);
  });

  it('rejects an empty comment', async () => {
    const ticket = await makeTicket(org);
    await org.agent
      .auth(request(app).post(`/api/tickets/${ticket.id}/comments`))
      .send({ body: '   ' })
      .expect(400);
  });

  it('records attachment metadata and counts it on the ticket', async () => {
    const ticket = await makeTicket(org);
    await org.customer
      .auth(request(app).post(`/api/tickets/${ticket.id}/attachments`))
      .send({ filename: 'screenshot.png', contentType: 'image/png', sizeBytes: 51_200 })
      .expect(201);

    const detail = await org.customer
      .auth(request(app).get(`/api/tickets/${ticket.id}`))
      .expect(200);
    expect(detail.body.attachmentCount).toBe(1);
    expect((detail.body.attachments as { filename: string }[])[0]?.filename).toBe('screenshot.png');
  });
});
