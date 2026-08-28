import type { Express } from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Role } from '@flowdesk/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { slaFields } from '../../src/services/tickets.js';

export const app: Express = createApp();
export const PASSWORD = 'CorrectHorse123!';

/** Wipes every table between test files. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs, attachments, ticket_tags, comments, tickets,
      tags, invites, refresh_tokens, users, organizations
    RESTART IDENTITY CASCADE
  `);
}

export interface SeededUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
  /** Adds the Authorization header to a supertest request. */
  auth: <T extends { set: (field: string, value: string) => T }>(req: T) => T;
}

export interface SeededOrg {
  id: string;
  name: string;
  slug: string;
  admin: SeededUser;
  agent: SeededUser;
  customer: SeededUser;
  otherCustomer: SeededUser;
}

async function login(email: string): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    accessToken: response.body.accessToken as string,
    refreshToken: response.body.refreshToken as string,
  };
}

async function createUser(
  orgId: string,
  slug: string,
  role: Role,
  key: string,
): Promise<SeededUser> {
  const email = `${key}@${slug}.test`;
  const user = await prisma.user.create({
    data: {
      orgId,
      email,
      name: `${key} ${slug}`,
      role,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    },
    select: { id: true, email: true, name: true, role: true },
  });

  const tokens = await login(email);
  return {
    ...user,
    ...tokens,
    auth: (req) => req.set('authorization', `Bearer ${tokens.accessToken}`),
  };
}

/** Builds a fully populated organization: admin, agent and two customers. */
export async function seedOrg(slug: string): Promise<SeededOrg> {
  const org = await prisma.organization.create({
    data: { name: `${slug} Inc`, slug },
    select: { id: true, name: true, slug: true },
  });

  return {
    ...org,
    admin: await createUser(org.id, slug, 'ADMIN', 'admin'),
    agent: await createUser(org.id, slug, 'AGENT', 'agent'),
    customer: await createUser(org.id, slug, 'CUSTOMER', 'customer'),
    otherCustomer: await createUser(org.id, slug, 'CUSTOMER', 'customer2'),
  };
}

export interface TicketOverrides {
  title?: string;
  description?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_CUSTOMER' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeId?: string | null;
  createdAt?: Date;
  firstResponseAt?: Date | null;
  /**
   * Overrides the computed breach flag. Used to stage the state the background
   * sweep exists to fix: a ticket that crossed its deadline while sitting in
   * the queue and has not been flagged yet.
   */
  slaBreached?: boolean;
}

/** Inserts a ticket directly, bypassing the API, for arranging test state. */
export async function makeTicket(
  org: SeededOrg,
  overrides: TicketOverrides = {},
): Promise<{ id: string; number: number }> {
  const createdAt = overrides.createdAt ?? new Date();
  const priority = overrides.priority ?? 'MEDIUM';
  const firstResponseAt = overrides.firstResponseAt ?? null;
  const sla = slaFields({ createdAt, priority, firstResponseAt });

  const counter = await prisma.organization.update({
    where: { id: org.id },
    data: { ticketSeq: { increment: 1 } },
    select: { ticketSeq: true },
  });

  return prisma.ticket.create({
    data: {
      orgId: org.id,
      number: counter.ticketSeq,
      title: overrides.title ?? 'Something is broken',
      description: overrides.description ?? 'A detailed description of the problem.',
      status: overrides.status ?? 'OPEN',
      priority,
      customerId: org.customer.id,
      assigneeId: overrides.assigneeId === undefined ? null : overrides.assigneeId,
      createdAt,
      firstResponseAt,
      firstResponderId: firstResponseAt ? org.agent.id : null,
      ...sla,
      ...(overrides.slaBreached === undefined
        ? {}
        : {
            slaBreached: overrides.slaBreached,
            slaBreachedAt: overrides.slaBreached ? new Date() : null,
          }),
    },
    select: { id: true, number: true },
  });
}
