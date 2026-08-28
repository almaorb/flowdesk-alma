/**
 * Deterministic demo data.
 *
 * Creates two organizations so tenant isolation can be exercised by hand, a
 * realistic mix of roles, and 300 tickets spread over the last 45 days with
 * believable status/priority distributions, response times and SLA breaches —
 * enough that the dashboard, the filters and the audit log all show something
 * meaningful the moment the app boots.
 *
 * Re-running it wipes both demo organizations and rebuilds them identically
 * (the RNG is seeded), so screenshots and tests stay stable.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import type { AuditAction, Priority, Role, TicketStatus } from '@flowdesk/shared';
import { isSlaBreached, slaDeadline } from '@flowdesk/shared';
import { prisma } from './db/prisma.js';

const DEMO_PASSWORD = 'Password123!';
const NOW = new Date();
const DAYS_OF_HISTORY = 45;

/* ------------------------------------------------------------------ rng -- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260827);

const rand = () => rng();
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[randInt(0, items.length - 1)] as T;

function weighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

let idCounter = 0;
const id = () => `seed${(idCounter += 1).toString().padStart(6, '0')}${randomUUID().slice(0, 8)}`;

const minutes = (n: number) => n * 60 * 1000;
const hours = (n: number) => minutes(60 * n);

/* -------------------------------------------------------------- content -- */

const TICKET_TEMPLATES: { title: string; body: string }[] = [
  { title: 'Cannot log in after password reset', body: 'I reset my password from the email link, but the new password is rejected on the login screen. I have tried two browsers and an incognito window.' },
  { title: 'Invoice #{n} shows the wrong tax rate', body: 'The invoice generated this morning applies 20% VAT to a zero-rated line item. Our finance team needs a corrected copy before month end.' },
  { title: 'CSV export truncates at 1,000 rows', body: 'Exporting the full contact list only returns the first 1,000 rows. The UI does not warn that the export was truncated.' },
  { title: 'Webhook deliveries failing with 502', body: 'Since roughly 09:00 UTC our webhook endpoint receives 502s from your side. Retries are also failing. Delivery ids are in the attached list.' },
  { title: 'Mobile app crashes on the reports tab', body: 'Opening Reports on iOS 18 closes the app immediately. It reproduces on two devices; the web app is fine.' },
  { title: 'Request: bulk-assign tickets to a team', body: 'We triage roughly 200 tickets a day and assign them one at a time. Could we select multiple tickets and assign them in one action?' },
  { title: 'SSO users land on the wrong workspace', body: 'After signing in through Okta some users are dropped into the sandbox workspace instead of production.' },
  { title: 'Search ignores accented characters', body: 'Searching for "Muller" does not return records for "Müller". Our German customer list is effectively unsearchable.' },
  { title: 'Billing page spins forever on Safari', body: 'The billing page never finishes loading in Safari 18. Chrome and Firefox are unaffected. Console shows a failed request to /api/billing/summary.' },
  { title: 'Duplicate notification emails', body: 'Every assignment notification arrives twice, a few seconds apart. Started after last week’s release.' },
  { title: 'API rate limit hit unexpectedly', body: 'We are being throttled well below the documented 600 requests/minute. Could you confirm the limit applied to our account?' },
  { title: 'Attachment upload fails above 8 MB', body: 'Uploads over about 8 MB fail with a generic error. The documented limit is 25 MB.' },
  { title: 'Timezone shown as UTC on scheduled reports', body: 'Scheduled reports render timestamps in UTC even though the workspace is set to Europe/Berlin.' },
  { title: 'Add a dark theme to the agent console', body: 'Our overnight team would like a dark theme. The current console is uncomfortable to read at night.' },
  { title: 'Deleted user still appears in assignee list', body: 'We deactivated an agent last Friday, but their name is still offered when assigning a ticket.' },
  { title: 'Slow ticket list with more than 50k tickets', body: 'The ticket list takes 8-12 seconds to load on our largest workspace. Filtering by status makes it worse.' },
  { title: 'Password policy rejects valid passphrases', body: 'Long passphrases with spaces are rejected. Our security policy mandates passphrases.' },
  { title: 'Cannot remove a tag from a closed ticket', body: 'Tag removal silently fails on closed tickets. No error is shown but the tag is still there after a refresh.' },
  { title: 'Customer replies are not threading', body: 'Replies from customers create new tickets instead of appending to the original thread.' },
  { title: 'Feature request: SLA pause during customer wait', body: 'While a ticket is waiting on the customer, the SLA clock should pause. Right now we breach SLAs while waiting on them.' },
];

const AGENT_REPLIES = [
  'Thanks for the detail — I can reproduce this on our side and I have raised it with engineering. I will keep you posted here.',
  'Good catch. This is a known regression from last week’s release; a fix is going out in the next deploy window.',
  'I have applied a workaround to your workspace. Could you confirm whether it behaves correctly now?',
  'I need a little more information: could you send the request id from the failing call, plus the exact timestamp?',
  'This is expected behaviour today, but it is a fair request — I have added it to the roadmap board and linked this ticket.',
  'Escalating this to our platform team given the impact. You should hear back within the hour.',
];

const CUSTOMER_REPLIES = [
  'Thanks for the quick response. Let me know if you need anything else from our side.',
  'Still happening this morning, unfortunately. I have attached a fresh screen recording.',
  'That workaround works for now, thank you. Happy to keep this open until the permanent fix ships.',
  'Any update on this? It is starting to affect our month-end close.',
  'Confirmed fixed on our side — thanks for turning that around so quickly.',
];

const INTERNAL_NOTES = [
  'Customer is on the enterprise plan, renewal is in six weeks. Handle with care.',
  'Reproduced locally. Root cause looks like the pagination cursor being dropped on the second page.',
  'Duplicate of the webhook issue we saw last month; linking both for the postmortem.',
  'Waiting on the platform team before replying, do not close.',
];

const TAG_SETS = [
  { name: 'billing', color: '#d97706' },
  { name: 'bug', color: '#dc2626' },
  { name: 'feature-request', color: '#7c3aed' },
  { name: 'integrations', color: '#0891b2' },
  { name: 'performance', color: '#ca8a04' },
  { name: 'security', color: '#be123c' },
  { name: 'onboarding', color: '#059669' },
  { name: 'mobile', color: '#2563eb' },
];

/* --------------------------------------------------------------- shapes -- */

interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface OrgPlan {
  id: string;
  name: string;
  slug: string;
  ticketCount: number;
  users: SeedUser[];
}

function buildUsers(domain: string, admins: string[], agents: string[], customers: string[]): SeedUser[] {
  const make = (name: string, role: Role): SeedUser => ({
    id: id(),
    name,
    role,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${domain}`,
  });
  return [
    ...admins.map((n) => make(n, 'ADMIN')),
    ...agents.map((n) => make(n, 'AGENT')),
    ...customers.map((n) => make(n, 'CUSTOMER')),
  ];
}

const ORGS: OrgPlan[] = [
  {
    id: id(),
    name: 'Northwind Support',
    slug: 'northwind',
    ticketCount: 220,
    users: buildUsers(
      'northwind.test',
      ['Ada Lovelace'],
      ['Grace Hopper', 'Alan Turing', 'Radia Perlman'],
      ['Bruno Silva', 'Chen Wei', 'Fatima Noor', 'Otto Meyer'],
    ),
  },
  {
    id: id(),
    name: 'Contoso Care',
    slug: 'contoso',
    ticketCount: 90,
    users: buildUsers(
      'contoso.test',
      ['Marie Curie'],
      ['Katherine Johnson', 'Jean Bartik'],
      ['Priya Raman', 'Lars Eriksson', 'Nia Okafor'],
    ),
  },
];

/* ----------------------------------------------------------------- main -- */

async function main(): Promise<void> {
  console.log('› Seeding FlowDesk demo data…');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Organization deletes cascade to every tenant-owned table.
  const removed = await prisma.organization.deleteMany({
    where: { slug: { in: ORGS.map((org) => org.slug) } },
  });
  if (removed.count > 0) console.log(`  cleared ${removed.count} existing demo organization(s)`);

  const tickets: Prisma.TicketCreateManyInput[] = [];
  const ticketTags: { ticketId: string; tagId: string }[] = [];
  const comments: {
    id: string;
    orgId: string;
    ticketId: string;
    authorId: string;
    body: string;
    isInternal: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];
  const auditLogs: (Prisma.AuditLogCreateManyInput & { action: AuditAction })[] = [];
  const attachments: {
    orgId: string;
    ticketId: string;
    uploadedById: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    createdAt: Date;
  }[] = [];

  for (const org of ORGS) {
    await prisma.organization.create({
      data: { id: org.id, name: org.name, slug: org.slug, ticketSeq: org.ticketCount },
    });

    await prisma.user.createMany({
      data: org.users.map((user) => ({
        id: user.id,
        orgId: org.id,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
      })),
    });

    const tags = TAG_SETS.map((tag) => ({ id: id(), orgId: org.id, ...tag }));
    await prisma.tag.createMany({ data: tags });

    const agents = org.users.filter((u) => u.role === 'AGENT' || u.role === 'ADMIN');
    const customers = org.users.filter((u) => u.role === 'CUSTOMER');
    const admin = org.users.find((u) => u.role === 'ADMIN')!;

    auditLogs.push({
      orgId: org.id,
      actorId: admin.id,
      action: 'ORG_CREATED',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { name: org.name, slug: org.slug },
      createdAt: new Date(NOW.getTime() - hours(24 * DAYS_OF_HISTORY + 2)),
    });

    for (let n = 1; n <= org.ticketCount; n += 1) {
      const ticketId = id();
      const template = pick(TICKET_TEMPLATES);
      const customer = pick(customers);

      // Skew creation towards the recent past so the 30-day dashboard is dense.
      const ageDays = Math.floor(Math.pow(rand(), 1.5) * DAYS_OF_HISTORY);
      const createdAt = new Date(
        NOW.getTime() - hours(24 * ageDays) - minutes(randInt(0, 24 * 60)),
      );

      const priority = weighted<Priority>({ LOW: 22, MEDIUM: 43, HIGH: 25, URGENT: 10 });
      const status = weighted<TicketStatus>({
        OPEN: 18,
        IN_PROGRESS: 14,
        WAITING_ON_CUSTOMER: 10,
        RESOLVED: 22,
        CLOSED: 31,
        REOPENED: 5,
      });

      const isTerminal = status === 'RESOLVED' || status === 'CLOSED';
      const assignee =
        status === 'OPEN' && rand() < 0.55 ? null : pick(agents);

      // Roughly one ticket in seven never gets a first response.
      const answered = assignee !== null && rand() > 0.14;
      const responder = answered ? (assignee ?? pick(agents)) : null;

      const deadline = slaDeadline(createdAt, priority);
      const slaWindowMs = deadline.getTime() - createdAt.getTime();
      // Most responses land inside the window; the tail runs past it.
      const responseDelay = rand() < 0.78
        ? Math.max(minutes(3), rand() * slaWindowMs * 0.85)
        : slaWindowMs * (1.1 + rand() * 2.2);

      let firstResponseAt: Date | null = answered
        ? new Date(createdAt.getTime() + responseDelay)
        : null;
      if (firstResponseAt && firstResponseAt > NOW) firstResponseAt = null;

      const resolvedAt = isTerminal
        ? new Date(
            Math.min(
              NOW.getTime(),
              (firstResponseAt ?? createdAt).getTime() + hours(1 + rand() * 96),
            ),
          )
        : null;
      const closedAt =
        status === 'CLOSED' && resolvedAt
          ? new Date(Math.min(NOW.getTime(), resolvedAt.getTime() + hours(rand() * 48)))
          : null;

      const breached = isSlaBreached({ createdAt, priority, firstResponseAt, now: NOW });

      const updatedAt = closedAt ?? resolvedAt ?? firstResponseAt ?? createdAt;

      tickets.push({
        id: ticketId,
        orgId: org.id,
        number: n,
        title: template.title.replace('{n}', String(1000 + randInt(1, 899))),
        description: template.body,
        status,
        priority,
        customerId: customer.id,
        assigneeId: assignee?.id ?? null,
        firstResponseAt,
        firstResponderId: firstResponseAt ? (responder?.id ?? null) : null,
        slaDeadline: deadline,
        slaBreached: breached,
        slaBreachedAt: breached ? (firstResponseAt ?? deadline) : null,
        resolvedAt,
        closedAt,
        createdAt,
        updatedAt,
      });

      // 1–3 tags on most tickets.
      const tagCount = rand() < 0.15 ? 0 : randInt(1, 3);
      const chosen = new Set<string>();
      for (let t = 0; t < tagCount; t += 1) chosen.add(pick(tags).id);
      for (const tagId of chosen) ticketTags.push({ ticketId, tagId });

      auditLogs.push({
        orgId: org.id,
        actorId: customer.id,
        action: 'TICKET_CREATED',
        entityType: 'Ticket',
        entityId: ticketId,
        metadata: { number: n, priority, title: template.title },
        createdAt,
      });

      if (firstResponseAt && responder) {
        comments.push({
          id: id(),
          orgId: org.id,
          ticketId,
          authorId: responder.id,
          body: pick(AGENT_REPLIES),
          isInternal: false,
          createdAt: firstResponseAt,
          updatedAt: firstResponseAt,
        });

        // A follow-up exchange on about half of the answered tickets.
        let cursor = firstResponseAt;
        const extra = randInt(0, 4);
        for (let c = 0; c < extra; c += 1) {
          cursor = new Date(Math.min(NOW.getTime(), cursor.getTime() + hours(1 + rand() * 20)));
          const fromAgent = rand() < 0.55;
          const internal = fromAgent && rand() < 0.25;
          comments.push({
            id: id(),
            orgId: org.id,
            ticketId,
            authorId: fromAgent ? (responder?.id ?? admin.id) : customer.id,
            body: internal ? pick(INTERNAL_NOTES) : fromAgent ? pick(AGENT_REPLIES) : pick(CUSTOMER_REPLIES),
            isInternal: internal,
            createdAt: cursor,
            updatedAt: cursor,
          });
        }
      }

      if (status !== 'OPEN') {
        auditLogs.push({
          orgId: org.id,
          actorId: assignee?.id ?? admin.id,
          action: 'TICKET_STATUS_CHANGED',
          entityType: 'Ticket',
          entityId: ticketId,
          metadata: { number: n, from: 'OPEN', to: status === 'REOPENED' ? 'RESOLVED' : status },
          createdAt: new Date(
            Math.min(NOW.getTime(), (firstResponseAt ?? createdAt).getTime() + minutes(randInt(5, 240))),
          ),
        });
      }

      if (breached) {
        auditLogs.push({
          orgId: org.id,
          actorId: null,
          action: 'SLA_BREACHED',
          entityType: 'Ticket',
          entityId: ticketId,
          metadata: { number: n, priority },
          createdAt: deadline,
        });
      }

      if (rand() < 0.18) {
        attachments.push({
          orgId: org.id,
          ticketId,
          uploadedById: customer.id,
          filename: pick(['screenshot.png', 'har-export.har', 'invoice-1043.pdf', 'console-log.txt']),
          contentType: pick(['image/png', 'application/json', 'application/pdf', 'text/plain']),
          sizeBytes: randInt(12_000, 4_800_000),
          createdAt,
        });
      }
    }

    console.log(`  ${org.name}: ${org.users.length} users, ${org.ticketCount} tickets`);
  }

  await prisma.ticket.createMany({ data: tickets });
  await prisma.ticketTag.createMany({ data: ticketTags, skipDuplicates: true });
  await prisma.comment.createMany({ data: comments });
  await prisma.attachment.createMany({ data: attachments });
  await prisma.auditLog.createMany({ data: auditLogs });

  const breachedCount = tickets.filter((t) => t.slaBreached === true).length;

  console.log('');
  console.log(`✔ ${tickets.length} tickets, ${comments.length} comments, ${attachments.length} attachments`);
  console.log(`✔ ${auditLogs.length} audit rows, ${breachedCount} SLA breaches`);
  console.log('');
  console.log('Sign in with any of these (password for all: ' + DEMO_PASSWORD + ')');
  for (const org of ORGS) {
    console.log(`  ${org.name}`);
    for (const user of org.users.filter((u) => u.role !== 'CUSTOMER')) {
      console.log(`    ${user.role.padEnd(8)} ${user.email}`);
    }
    const firstCustomer = org.users.find((u) => u.role === 'CUSTOMER');
    if (firstCustomer) console.log(`    CUSTOMER ${firstCustomer.email}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
