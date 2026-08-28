import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db/prisma.js';
import { app, makeTicket, resetDatabase, seedOrg, type SeededOrg } from '../helpers/fixtures.js';

let org: SeededOrg;

const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  await resetDatabase();
  org = await seedOrg('metrics');

  // Two URGENT tickets answered inside their window, one breached.
  await makeTicket(org, {
    priority: 'URGENT',
    createdAt: hoursAgo(10),
    firstResponseAt: hoursAgo(9.5),
  });
  await makeTicket(org, {
    priority: 'URGENT',
    createdAt: hoursAgo(8),
    firstResponseAt: hoursAgo(7.5),
  });
  await makeTicket(org, { priority: 'URGENT', createdAt: hoursAgo(6) });

  // A LOW ticket resolved two days ago.
  const resolved = await makeTicket(org, {
    priority: 'LOW',
    createdAt: daysAgo(3),
    status: 'RESOLVED',
  });
  await prisma.ticket.update({ where: { id: resolved.id }, data: { resolvedAt: daysAgo(2) } });

  // Outside a 7-day window, inside a 30-day one.
  await makeTicket(org, { priority: 'MEDIUM', createdAt: daysAgo(20) });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/analytics/overview', () => {
  it('counts tickets, open tickets and breaches for the window', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/analytics/overview'))
      .query({ days: 30 })
      .expect(200);

    expect(response.body.totalTickets).toBe(5);
    expect(response.body.resolvedTickets).toBe(1);
    expect(response.body.openTickets).toBe(4);
    expect(response.body.breachRate).toBeCloseTo(response.body.breachedTickets / 5, 4);
  });

  it('honours the window, excluding older tickets', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/analytics/overview'))
      .query({ days: 7 })
      .expect(200);
    expect(response.body.totalTickets).toBe(4);
  });

  it('reports an average first-response time in minutes', async () => {
    const response = await org.admin.auth(request(app).get('/api/analytics/overview')).expect(200);
    // Both answered tickets took 30 minutes.
    expect(response.body.avgFirstResponseMinutes).toBeCloseTo(30, 0);
  });

  it('rejects a window outside the allowed range', async () => {
    await org.admin
      .auth(request(app).get('/api/analytics/overview'))
      .query({ days: 0 })
      .expect(400);
    await org.admin
      .auth(request(app).get('/api/analytics/overview'))
      .query({ days: 5000 })
      .expect(400);
  });
});

describe('GET /api/analytics/tickets-per-day', () => {
  it('returns one dense row per day, including days with no activity', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/analytics/tickets-per-day'))
      .query({ days: 30 })
      .expect(200);

    const rows = response.body.data as { date: string; created: number; resolved: number }[];
    expect(rows).toHaveLength(30);
    expect(rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))).toBe(true);

    const dates = rows.map((row) => row.date);
    expect(dates).toEqual([...dates].sort());

    const totalCreated = rows.reduce((sum, row) => sum + row.created, 0);
    expect(totalCreated).toBe(5);
    expect(rows.reduce((sum, row) => sum + row.resolved, 0)).toBe(1);
  });
});

describe('GET /api/analytics/first-response', () => {
  it('groups by responding agent with an average and a median', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/analytics/first-response'))
      .expect(200);
    const rows = response.body.data as {
      agentId: string;
      ticketsAnswered: number;
      avgFirstResponseMinutes: number;
      medianFirstResponseMinutes: number;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]?.agentId).toBe(org.agent.id);
    expect(rows[0]?.ticketsAnswered).toBe(2);
    expect(rows[0]?.avgFirstResponseMinutes).toBeCloseTo(30, 0);
    expect(rows[0]?.medianFirstResponseMinutes).toBeCloseTo(30, 0);
  });
});

describe('GET /api/analytics/breach-rate', () => {
  it('returns every priority, including ones with no tickets', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/analytics/breach-rate'))
      .expect(200);
    const rows = response.body.data as {
      priority: string;
      total: number;
      breached: number;
      breachRate: number;
    }[];

    expect(rows.map((row) => row.priority)).toEqual(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);

    const high = rows.find((row) => row.priority === 'HIGH');
    expect(high).toMatchObject({ total: 0, breached: 0, breachRate: 0 });

    const urgent = rows.find((row) => row.priority === 'URGENT');
    expect(urgent?.total).toBe(3);
    expect(urgent?.breachRate).toBeCloseTo((urgent?.breached ?? 0) / 3, 4);
  });

  it('agrees with a direct count from the database', async () => {
    const response = await org.admin
      .auth(request(app).get('/api/analytics/breach-rate'))
      .expect(200);
    const rows = response.body.data as { total: number; breached: number }[];

    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(
      await prisma.ticket.count({ where: { orgId: org.id } }),
    );
    expect(rows.reduce((sum, row) => sum + row.breached, 0)).toBe(
      await prisma.ticket.count({ where: { orgId: org.id, slaBreached: true } }),
    );
  });
});
