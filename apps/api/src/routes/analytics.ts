import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { analyticsRangeSchema } from '@flowdesk/shared';
import type {
  AgentResponseStatDto,
  AnalyticsOverviewDto,
  BreachRateByPriorityDto,
  TicketsPerDayPointDto,
} from '@flowdesk/shared';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../lib/http.js';
import { parseQuery } from '../lib/validate.js';
import { auth, requireAuth, requireRole } from '../middleware/auth.js';

/**
 * Every figure on the dashboard is produced by Postgres. The handlers below use
 * `$queryRaw` with bound parameters (never string concatenation), and every
 * statement filters on the caller's `orgId`, which is read from the verified
 * access token rather than from the request.
 */
export const analyticsRouter = Router();
analyticsRouter.use(requireAuth, requireRole('ADMIN'));

function sinceDate(days: number): Date {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return since;
}

analyticsRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    const { days } = parseQuery(analyticsRangeSchema, req);
    const since = sinceDate(days);

    const [row] = await prisma.$queryRaw<
      {
        totalTickets: number;
        openTickets: number;
        resolvedTickets: number;
        breachedTickets: number;
        avgFirstResponseMinutes: number | null;
        avgResolutionHours: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*)::int AS "totalTickets",
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'REOPENED')
        )::int AS "openTickets",
        COUNT(*) FILTER (WHERE t.status IN ('RESOLVED', 'CLOSED'))::int AS "resolvedTickets",
        COUNT(*) FILTER (WHERE t."slaBreached")::int AS "breachedTickets",
        ROUND(
          AVG(EXTRACT(EPOCH FROM (t."firstResponseAt" - t."createdAt")) / 60)::numeric, 1
        )::float8 AS "avgFirstResponseMinutes",
        ROUND(
          AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 3600)::numeric, 1
        )::float8 AS "avgResolutionHours"
      FROM tickets t
      WHERE t."orgId" = ${orgId} AND t."createdAt" >= ${since}
    `);

    const total = row?.totalTickets ?? 0;
    const breached = row?.breachedTickets ?? 0;

    const body: AnalyticsOverviewDto = {
      totalTickets: total,
      openTickets: row?.openTickets ?? 0,
      resolvedTickets: row?.resolvedTickets ?? 0,
      breachedTickets: breached,
      breachRate: total === 0 ? 0 : Number((breached / total).toFixed(4)),
      avgFirstResponseMinutes: row?.avgFirstResponseMinutes ?? null,
      avgResolutionHours: row?.avgResolutionHours ?? null,
    };

    res.json(body);
  }),
);

analyticsRouter.get(
  '/tickets-per-day',
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    const { days } = parseQuery(analyticsRangeSchema, req);
    const since = sinceDate(days);

    const rows = await prisma.$queryRaw<TicketsPerDayPointDto[]>(Prisma.sql`
      WITH calendar AS (
        SELECT generate_series(
          date_trunc('day', ${since}::timestamp),
          date_trunc('day', now()::timestamp),
          interval '1 day'
        )::date AS day
      ),
      created AS (
        SELECT date_trunc('day', t."createdAt")::date AS day, COUNT(*)::int AS n
        FROM tickets t
        WHERE t."orgId" = ${orgId} AND t."createdAt" >= ${since}
        GROUP BY 1
      ),
      resolved AS (
        SELECT date_trunc('day', t."resolvedAt")::date AS day, COUNT(*)::int AS n
        FROM tickets t
        WHERE t."orgId" = ${orgId} AND t."resolvedAt" IS NOT NULL AND t."resolvedAt" >= ${since}
        GROUP BY 1
      )
      SELECT
        to_char(c.day, 'YYYY-MM-DD') AS "date",
        COALESCE(cr.n, 0)::int AS "created",
        COALESCE(rs.n, 0)::int AS "resolved"
      FROM calendar c
      LEFT JOIN created cr ON cr.day = c.day
      LEFT JOIN resolved rs ON rs.day = c.day
      ORDER BY c.day ASC
    `);

    res.json({ data: rows, meta: { days, since: since.toISOString() } });
  }),
);

analyticsRouter.get(
  '/first-response',
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    const { days } = parseQuery(analyticsRangeSchema, req);
    const since = sinceDate(days);

    const rows = await prisma.$queryRaw<AgentResponseStatDto[]>(Prisma.sql`
      SELECT
        u.id AS "agentId",
        u.name AS "agentName",
        COUNT(*)::int AS "ticketsAnswered",
        ROUND(
          AVG(EXTRACT(EPOCH FROM (t."firstResponseAt" - t."createdAt")) / 60)::numeric, 1
        )::float8 AS "avgFirstResponseMinutes",
        ROUND(
          (PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (t."firstResponseAt" - t."createdAt")) / 60
          ))::numeric, 1
        )::float8 AS "medianFirstResponseMinutes"
      FROM tickets t
      JOIN users u ON u.id = t."firstResponderId"
      WHERE t."orgId" = ${orgId}
        AND t."firstResponseAt" IS NOT NULL
        AND t."createdAt" >= ${since}
      GROUP BY u.id, u.name
      ORDER BY "avgFirstResponseMinutes" ASC
    `);

    res.json({ data: rows, meta: { days, since: since.toISOString() } });
  }),
);

analyticsRouter.get(
  '/breach-rate',
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    const { days } = parseQuery(analyticsRangeSchema, req);
    const since = sinceDate(days);

    const rows = await prisma.$queryRaw<{ priority: string; total: number; breached: number }[]>(
      Prisma.sql`
        SELECT
          p.priority::text AS "priority",
          COUNT(t.id)::int AS "total",
          COUNT(t.id) FILTER (WHERE t."slaBreached")::int AS "breached"
        FROM (SELECT unnest(enum_range(NULL::"Priority")) AS priority) p
        LEFT JOIN tickets t
          ON t.priority = p.priority
          AND t."orgId" = ${orgId}
          AND t."createdAt" >= ${since}
        GROUP BY p.priority
        ORDER BY p.priority DESC
      `,
    );

    const data: BreachRateByPriorityDto[] = rows.map((row) => ({
      priority: row.priority as BreachRateByPriorityDto['priority'],
      total: row.total,
      breached: row.breached,
      breachRate: row.total === 0 ? 0 : Number((row.breached / row.total).toFixed(4)),
    }));

    res.json({ data, meta: { days, since: since.toISOString() } });
  }),
);
