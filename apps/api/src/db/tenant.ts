import { prisma } from './prisma.js';

/**
 * Tenant isolation is enforced here, at the query layer, rather than in each
 * route handler.
 *
 * `tenantDb(orgId)` returns a Prisma client extension that rewrites every
 * operation on a tenant-owned model so that:
 *   - reads/updates/deletes always carry `orgId = <caller's org>`, and
 *   - creates always persist `orgId = <caller's org>`, whatever the payload said.
 *
 * A handler therefore cannot read or mutate another organization's row even if
 * it forgets the filter, and an attacker who guesses a valid ticket id from
 * another tenant gets a 404 rather than data. `TicketTag` has no `orgId` column
 * of its own, so it is scoped through its ticket relation instead.
 *
 * Anything genuinely cross-tenant (login, refresh tokens, organization
 * creation) must use the unscoped `prisma` client explicitly, which makes those
 * few call sites easy to audit.
 */
const TENANT_MODELS = new Set(['User', 'Invite', 'Ticket', 'Comment', 'Tag', 'Attachment', 'AuditLog']);

/** Models scoped through a relation because they carry no orgId column. */
const RELATION_SCOPED_MODELS: Record<string, string> = { TicketTag: 'ticket' };

type AnyArgs = Record<string, unknown>;

const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

function scopedWhere(where: unknown, scope: AnyArgs): AnyArgs {
  if (where && typeof where === 'object') return { ...(where as AnyArgs), ...scope };
  return { ...scope };
}

function withOrgId(data: unknown, orgId: string): unknown {
  if (Array.isArray(data)) return data.map((row) => ({ ...(row as AnyArgs), orgId }));
  if (data && typeof data === 'object') return { ...(data as AnyArgs), orgId };
  return { orgId };
}

export function tenantDb(orgId: string) {
  if (!orgId) throw new Error('tenantDb() requires an organization id');

  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const relationField = RELATION_SCOPED_MODELS[model];
          if (relationField) {
            if (WHERE_OPS.has(operation)) {
              const next = { ...(args as AnyArgs) };
              next.where = scopedWhere(next.where, { [relationField]: { is: { orgId } } });
              return query(next);
            }
            return query(args);
          }

          if (!TENANT_MODELS.has(model)) return query(args);

          const next = { ...(args as AnyArgs) };

          if (WHERE_OPS.has(operation)) {
            next.where = scopedWhere(next.where, { orgId });
            return query(next);
          }

          switch (operation) {
            case 'create':
            case 'createMany':
            case 'createManyAndReturn':
              next.data = withOrgId(next.data, orgId);
              return query(next);
            case 'upsert':
              next.where = scopedWhere(next.where, { orgId });
              next.create = withOrgId(next.create, orgId);
              return query(next);
            default:
              // `$queryRaw`, `$executeRaw` and friends never reach this hook, so an
              // unknown operation here means Prisma grew a new one: fail closed.
              throw new Error(
                `tenantDb: unsupported operation "${operation}" on tenant model "${model}".`,
              );
          }
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
