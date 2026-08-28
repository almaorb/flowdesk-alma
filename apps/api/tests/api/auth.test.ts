import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/db/prisma.js';
import { PASSWORD, app, resetDatabase, seedOrg, type SeededOrg } from '../helpers/fixtures.js';

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedOrg('acme');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/signup', () => {
  it('creates an organization with the signer as its first admin', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        organizationName: 'Globex Support',
        name: 'Hank Scorpio',
        email: 'hank@globex.test',
        password: 'CorrectHorse123!',
      })
      .expect(201);

    expect(response.body.user).toMatchObject({ email: 'hank@globex.test', role: 'ADMIN' });
    expect(response.body.organization).toMatchObject({
      name: 'Globex Support',
      slug: 'globex-support',
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.passwordHash).toBeUndefined();

    const audits = await prisma.auditLog.findMany({
      where: { orgId: response.body.organization.id as string },
      select: { action: true },
    });
    expect(audits.map((a) => a.action).sort()).toEqual(['ORG_CREATED', 'USER_SIGNED_UP']);
  });

  it('rejects a duplicate email with EMAIL_TAKEN and creates nothing', async () => {
    const before = await prisma.organization.count();
    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        organizationName: 'Another Org',
        name: 'Copycat',
        email: 'hank@globex.test',
        password: 'CorrectHorse123!',
      })
      .expect(409);

    expect(response.body.error.code).toBe('EMAIL_TAKEN');
    expect(await prisma.organization.count()).toBe(before);
  });

  it('returns field-level errors for a weak password and bad email', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ organizationName: 'X', name: '', email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (response.body.error.fields as { path: string }[]).map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['organizationName', 'email', 'password']));
  });
});

describe('POST /api/auth/login', () => {
  it('returns a session for valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: org.admin.email, password: PASSWORD })
      .expect(200);

    expect(response.body.user.id).toBe(org.admin.id);
    expect(response.body.organization.id).toBe(org.id);
    expect(response.headers['set-cookie']?.join(';')).toContain('fd_refresh');
  });

  it('gives the same 401 for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: org.admin.email, password: 'not-the-password' })
      .expect(401);

    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@nowhere.test', password: PASSWORD })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownUser.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a deactivated account', async () => {
    await prisma.user.update({ where: { id: org.otherCustomer.id }, data: { isActive: false } });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: org.otherCustomer.email, password: PASSWORD })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    await prisma.user.update({ where: { id: org.otherCustomer.id }, data: { isActive: true } });
  });
});

describe('session lifecycle', () => {
  it('GET /api/auth/me requires a token and then returns the caller', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const response = await org.agent.auth(request(app).get('/api/auth/me')).expect(200);
    expect(response.body.user.id).toBe(org.agent.id);
  });

  it('rotates the refresh token and invalidates the old one', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: org.customer.email, password: PASSWORD })
      .expect(200);

    const first = login.body.refreshToken as string;
    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first })
      .expect(200);

    expect(refreshed.body.refreshToken).not.toBe(first);
    await request(app).post('/api/auth/refresh').send({ refreshToken: first }).expect(401);
  });

  it('logout revokes the supplied refresh token', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: org.customer.email, password: PASSWORD })
      .expect(200);

    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('rejects a syntactically valid but unsigned bearer token', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('authorization', 'Bearer not.a.jwt')
      .expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('invites', () => {
  it('walks the full invite -> accept -> login flow', async () => {
    const created = await org.admin
      .auth(request(app).post('/api/invites'))
      .send({ email: 'newagent@acme.test', role: 'AGENT' })
      .expect(201);

    const token = created.body.token as string;
    expect(created.body.url).toContain(token);

    const preview = await request(app).get(`/api/public/invites/${token}`).expect(200);
    expect(preview.body).toMatchObject({
      email: 'newagent@acme.test',
      role: 'AGENT',
      organizationName: org.name,
    });

    const accepted = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, name: 'New Agent', password: 'CorrectHorse123!' })
      .expect(201);

    expect(accepted.body.user).toMatchObject({ role: 'AGENT', email: 'newagent@acme.test' });
    // The new user landed in the inviting organization, not a new one.
    expect(accepted.body.organization.id).toBe(org.id);

    // Single use.
    await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, name: 'Impostor', password: 'CorrectHorse123!' })
      .expect(400);
  });

  it('refuses an unknown invite token', async () => {
    const response = await request(app).get('/api/public/invites/does-not-exist-token').expect(404);
    expect(response.body.error.code).toBe('INVITE_INVALID');
  });

  it('only admins may create invites', async () => {
    await org.agent
      .auth(request(app).post('/api/invites'))
      .send({ email: 'nope@acme.test', role: 'AGENT' })
      .expect(403);
  });
});
