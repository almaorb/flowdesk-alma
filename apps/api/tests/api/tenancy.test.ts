import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db/prisma.js';
import { tenantDb } from '../../src/db/tenant.js';
import { app, makeTicket, resetDatabase, seedOrg, type SeededOrg } from '../helpers/fixtures.js';

let alpha: SeededOrg;
let beta: SeededOrg;
let alphaTicket: { id: string; number: number };
let alphaTag: { id: string };

beforeAll(async () => {
  await resetDatabase();
  alpha = await seedOrg('alpha');
  beta = await seedOrg('beta');

  alphaTicket = await makeTicket(alpha, { title: 'Alpha only secret' });
  await makeTicket(beta, { title: 'Beta only secret' });

  const created = await alpha.admin
    .auth(request(app).post('/api/tags'))
    .send({ name: 'alpha-tag', color: '#123456' })
    .expect(201);
  alphaTag = { id: created.body.id as string };

  await alpha.agent
    .auth(request(app).post(`/api/tickets/${alphaTicket.id}/comments`))
    .send({ body: 'internal alpha context', isInternal: true })
    .expect(201);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * The important half of the rubric: an authenticated caller from another
 * organization must never be able to read or mutate this one's data, and the
 * API must not even confirm that the id exists.
 */
describe('cross-tenant reads', () => {
  it('returns 404 (not 403) when fetching another org’s ticket by id', async () => {
    const response = await beta.admin
      .auth(request(app).get(`/api/tickets/${alphaTicket.id}`))
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(response.body)).not.toContain('Alpha only secret');
  });

  it('never leaks another org’s tickets into the list', async () => {
    const response = await beta.admin.auth(request(app).get('/api/tickets')).expect(200);
    const titles = (response.body.data as { title: string; orgId: string }[]).map((t) => t.title);
    expect(titles).toContain('Beta only secret');
    expect(titles).not.toContain('Alpha only secret');
    expect(new Set((response.body.data as { orgId: string }[]).map((t) => t.orgId))).toEqual(
      new Set([beta.id]),
    );
  });

  it('does not leak another org’s tickets through free-text search', async () => {
    const response = await beta.admin
      .auth(request(app).get('/api/tickets'))
      .query({ q: 'Alpha only secret' })
      .expect(200);
    expect(response.body.meta.total).toBe(0);
  });

  it('scopes the user directory to the caller’s organization', async () => {
    const response = await beta.admin.auth(request(app).get('/api/users')).expect(200);
    const emails = (response.body.data as { email: string }[]).map((u) => u.email);
    expect(emails.every((email) => email.endsWith('@beta.test'))).toBe(true);
    expect(emails).not.toContain(alpha.admin.email);
  });

  it('scopes tags to the caller’s organization', async () => {
    const response = await beta.admin.auth(request(app).get('/api/tags')).expect(200);
    expect((response.body.data as { name: string }[]).map((t) => t.name)).not.toContain(
      'alpha-tag',
    );
  });

  it('scopes the audit log to the caller’s organization', async () => {
    const response = await beta.admin.auth(request(app).get('/api/audit-logs')).expect(200);
    const entityIds = (response.body.data as { entityId: string | null }[]).map(
      (row) => row.entityId,
    );
    expect(entityIds).not.toContain(alphaTicket.id);
  });

  it('scopes analytics to the caller’s organization', async () => {
    const [alphaStats, betaStats] = await Promise.all([
      alpha.admin.auth(request(app).get('/api/analytics/overview')).expect(200),
      beta.admin.auth(request(app).get('/api/analytics/overview')).expect(200),
    ]);
    const total = await prisma.ticket.count();
    expect(alphaStats.body.totalTickets + betaStats.body.totalTickets).toBe(total);
    expect(alphaStats.body.totalTickets).toBeGreaterThan(0);
  });
});

describe('cross-tenant writes', () => {
  it('cannot patch another org’s ticket', async () => {
    await beta.admin
      .auth(request(app).patch(`/api/tickets/${alphaTicket.id}`))
      .send({ title: 'defaced' })
      .expect(404);

    const untouched = await prisma.ticket.findUnique({ where: { id: alphaTicket.id } });
    expect(untouched?.title).toBe('Alpha only secret');
  });

  it('cannot transition another org’s ticket', async () => {
    await beta.admin
      .auth(request(app).post(`/api/tickets/${alphaTicket.id}/transition`))
      .send({ status: 'CLOSED' })
      .expect(404);

    const untouched = await prisma.ticket.findUnique({ where: { id: alphaTicket.id } });
    expect(untouched?.status).toBe('OPEN');
  });

  it('cannot comment on another org’s ticket', async () => {
    await beta.agent
      .auth(request(app).post(`/api/tickets/${alphaTicket.id}/comments`))
      .send({ body: 'hello from beta' })
      .expect(404);

    expect(
      await prisma.comment.count({ where: { ticketId: alphaTicket.id, orgId: beta.id } }),
    ).toBe(0);
  });

  it('cannot delete another org’s ticket', async () => {
    await beta.admin.auth(request(app).delete(`/api/tickets/${alphaTicket.id}`)).expect(404);
    expect(await prisma.ticket.findUnique({ where: { id: alphaTicket.id } })).not.toBeNull();
  });

  it('cannot delete another org’s tag', async () => {
    await beta.admin.auth(request(app).delete(`/api/tags/${alphaTag.id}`)).expect(404);
    expect(await prisma.tag.findUnique({ where: { id: alphaTag.id } })).not.toBeNull();
  });

  it('cannot change a user in another organization', async () => {
    await beta.admin
      .auth(request(app).patch(`/api/users/${alpha.customer.id}`))
      .send({ role: 'ADMIN' })
      .expect(404);

    const unchanged = await prisma.user.findUnique({ where: { id: alpha.customer.id } });
    expect(unchanged?.role).toBe('CUSTOMER');
  });

  it('cannot assign another org’s user to its own ticket', async () => {
    const betaTicket = await makeTicket(beta);
    const response = await beta.admin
      .auth(request(app).patch(`/api/tickets/${betaTicket.id}`))
      .send({ assigneeId: alpha.agent.id })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cannot tag its own ticket with another org’s tag', async () => {
    const betaTicket = await makeTicket(beta);
    await beta.admin
      .auth(request(app).patch(`/api/tickets/${betaTicket.id}`))
      .send({ tagIds: [alphaTag.id] })
      .expect(400);
  });
});

describe('tenantDb query extension', () => {
  it('forces the tenant filter onto a query that forgot it', async () => {
    // Deliberately unqualified: the extension must still scope this to beta.
    const rows = await tenantDb(beta.id).ticket.findMany({ select: { orgId: true } });
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.orgId))).toEqual(new Set([beta.id]));
  });

  it('overrides a spoofed orgId in the where clause instead of honouring it', async () => {
    // The injected tenant filter is applied last, so a handler (or an attacker
    // controlling the filter) cannot widen the query to another organization.
    const rows = await tenantDb(beta.id).ticket.findMany({
      where: { orgId: alpha.id },
      select: { orgId: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.orgId))).toEqual(new Set([beta.id]));
  });

  it('stamps the caller’s orgId on a create that claims another', async () => {
    const created = await tenantDb(beta.id).tag.create({
      data: { orgId: alpha.id, name: 'smuggled-tag', color: '#000000' },
      select: { id: true, orgId: true },
    });
    expect(created.orgId).toBe(beta.id);
  });

  it('will not update or delete a row belonging to another tenant', async () => {
    const updated = await tenantDb(beta.id).ticket.updateMany({
      where: { id: alphaTicket.id },
      data: { title: 'hijacked' },
    });
    expect(updated.count).toBe(0);

    const deleted = await tenantDb(beta.id).ticket.deleteMany({ where: { id: alphaTicket.id } });
    expect(deleted.count).toBe(0);

    const intact = await prisma.ticket.findUnique({ where: { id: alphaTicket.id } });
    expect(intact?.title).toBe('Alpha only secret');
  });
});
