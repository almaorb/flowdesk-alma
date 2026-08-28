import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db/prisma.js';
import { app, makeTicket, resetDatabase, seedOrg, type SeededOrg } from '../helpers/fixtures.js';

let org: SeededOrg;
let ownTicket: { id: string };
let othersTicket: { id: string };

beforeAll(async () => {
  await resetDatabase();
  org = await seedOrg('roles');

  ownTicket = await makeTicket(org, { title: 'Customer one ticket' });
  othersTicket = await prisma.ticket.create({
    data: {
      orgId: org.id,
      number: 9001,
      title: 'Customer two ticket',
      description: 'Not visible to customer one.',
      priority: 'MEDIUM',
      customerId: org.otherCustomer.id,
      slaDeadline: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN_ONLY = [
  ['/api/analytics/overview', 'GET'],
  ['/api/analytics/tickets-per-day', 'GET'],
  ['/api/analytics/first-response', 'GET'],
  ['/api/analytics/breach-rate', 'GET'],
  ['/api/audit-logs', 'GET'],
  ['/api/audit-logs/actions', 'GET'],
  ['/api/invites', 'GET'],
] as const;

describe('admin-only surfaces', () => {
  it.each(ADMIN_ONLY)('%s is reachable by an admin', async (path) => {
    await org.admin.auth(request(app).get(path)).expect(200);
  });

  it.each(ADMIN_ONLY)('%s is refused for an agent', async (path) => {
    const response = await org.agent.auth(request(app).get(path)).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it.each(ADMIN_ONLY)('%s is refused for a customer', async (path) => {
    await org.customer.auth(request(app).get(path)).expect(403);
  });

  it.each(ADMIN_ONLY)('%s is refused without a token', async (path) => {
    await request(app).get(path).expect(401);
  });
});

describe('customer visibility', () => {
  it('only lists a customer’s own tickets', async () => {
    const response = await org.customer.auth(request(app).get('/api/tickets')).expect(200);
    const ids = (response.body.data as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(ownTicket.id);
    expect(ids).not.toContain(othersTicket.id);
  });

  it('404s on another customer’s ticket even inside the same organization', async () => {
    await org.customer.auth(request(app).get(`/api/tickets/${othersTicket.id}`)).expect(404);
  });

  it('lets agents and admins see every ticket in the organization', async () => {
    for (const staff of [org.agent, org.admin]) {
      const response = await staff.auth(request(app).get('/api/tickets')).expect(200);
      const ids = (response.body.data as { id: string }[]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([ownTicket.id, othersTicket.id]));
    }
  });

  it('shows a customer only themselves in the directory', async () => {
    const response = await org.customer.auth(request(app).get('/api/users')).expect(200);
    expect(response.body.data).toHaveLength(1);
    expect((response.body.data as { id: string }[])[0]?.id).toBe(org.customer.id);
  });

  it('stops a customer from reading another user’s record', async () => {
    await org.customer.auth(request(app).get(`/api/users/${org.agent.id}`)).expect(403);
  });
});

describe('role management', () => {
  it('lets an admin promote an agent, and revokes that user’s sessions', async () => {
    const response = await org.admin
      .auth(request(app).patch(`/api/users/${org.agent.id}`))
      .send({ role: 'ADMIN' })
      .expect(200);
    expect(response.body.role).toBe('ADMIN');

    const live = await prisma.refreshToken.count({
      where: { userId: org.agent.id, revokedAt: null },
    });
    expect(live).toBe(0);

    await org.admin
      .auth(request(app).patch(`/api/users/${org.agent.id}`))
      .send({ role: 'AGENT' })
      .expect(200);
  });

  it('refuses to demote the last remaining admin', async () => {
    const response = await org.admin
      .auth(request(app).patch(`/api/users/${org.admin.id}`))
      .send({ role: 'AGENT' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses to let an admin deactivate themselves', async () => {
    await org.admin
      .auth(request(app).patch(`/api/users/${org.admin.id}`))
      .send({ isActive: false })
      .expect(400);
  });

  it('stops an agent from changing roles at all', async () => {
    await org.agent
      .auth(request(app).patch(`/api/users/${org.customer.id}`))
      .send({ role: 'ADMIN' })
      .expect(403);
  });

  it('cuts off a deactivated user immediately, without waiting for token expiry', async () => {
    await prisma.user.update({ where: { id: org.customer.id }, data: { isActive: false } });
    const response = await org.customer.auth(request(app).get('/api/tickets')).expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    await prisma.user.update({ where: { id: org.customer.id }, data: { isActive: true } });
  });
});

describe('error envelope', () => {
  it('uses the same shape for every failure', async () => {
    const responses = await Promise.all([
      request(app).get('/api/tickets').expect(401),
      org.customer.auth(request(app).get('/api/audit-logs')).expect(403),
      org.admin.auth(request(app).get('/api/tickets/does-not-exist')).expect(404),
      request(app).get('/api/no-such-route').expect(404),
    ]);

    for (const response of responses) {
      expect(Object.keys(response.body)).toEqual(['error']);
      expect(response.body.error.code).toEqual(expect.any(String));
      expect(response.body.error.message).toEqual(expect.any(String));
    }
  });

  it('turns malformed JSON into a 400, not a 500', async () => {
    const response = await org.admin
      .auth(request(app).post('/api/tickets'))
      .set('content-type', 'application/json')
      .send('{"title": ')
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
